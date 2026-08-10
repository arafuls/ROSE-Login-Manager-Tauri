//! Orchestration adapted from rednimgames/rose-updater's
//! src/bin/rose-updater/main.rs (`update_process`/`verify_and_repair`/
//! `get_remote_files`/`get_files_to_update`), with the "update the updater
//! binary itself, then restart" branch removed entirely - we don't ship or
//! use rose-updater.exe as a binary at all, so there's no updater executable
//! of our own to keep current. We only ever sync the game's own data files.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use anyhow::Context;
use reqwest::Url;
use tokio::fs;
use tracing::info;

use super::clone::{
    build_local_chunk_index, clone_remote_file, estimate_local_chunk_count,
    init_local_clone_output, init_remote_archive_reader, RemoteArchiveReader,
};
use super::error::ErrorCode;
use super::manifest::{
    download_remote_manifest, get_or_create_local_manifest, save_local_manifest, LocalManifest,
    LocalManifestFileEntry, RemoteManifest,
};
use super::progress::{ProgressStage, ProgressState};

const LOCAL_MANIFEST_VERSION: usize = 1;
const TEXT_FILE_EXTENSIONS: &[&str; 1] = &["xml"];

struct FileToDownload {
    local_path: String,
    remote_path: String,
}

#[derive(Clone, Copy)]
struct RemoteFilePass {
    scan_stage: ProgressStage,
    transfer_stage: ProgressStage,
    delete_text_files: bool,
}

impl RemoteFilePass {
    const fn update() -> Self {
        Self {
            scan_stage: ProgressStage::CheckingFiles,
            transfer_stage: ProgressStage::DownloadingUpdates,
            delete_text_files: true,
        }
    }

    const fn verify() -> Self {
        Self {
            scan_stage: ProgressStage::VerifyingFiles,
            transfer_stage: ProgressStage::VerifyingFiles,
            delete_text_files: false,
        }
    }
}

fn is_text_file_path(path: &Path) -> bool {
    let Some(ext) = path.extension().and_then(|s| s.to_str()) else {
        return false;
    };
    TEXT_FILE_EXTENSIONS.contains(&ext)
}

fn should_remove_text_file(pass: RemoteFilePass, path: &Path) -> bool {
    pass.delete_text_files && is_text_file_path(path)
}

fn local_manifest_path(output_dir: &Path, remote_url: &Url) -> PathBuf {
    output_dir
        .join("updater")
        .join(remote_url.host_str().unwrap_or("default"))
        .join("local_manifest.json")
}

fn build_local_manifest(remote_manifest: &RemoteManifest) -> LocalManifest {
    let mut local_manifest = LocalManifest {
        version: LOCAL_MANIFEST_VERSION,
        ..Default::default()
    };
    for file in &remote_manifest.files {
        local_manifest.files.push(LocalManifestFileEntry {
            path: file.source_path.clone(),
            hash: file.source_hash.clone(),
            size: file.source_size,
        });
    }
    local_manifest
}

fn build_full_file_list(remote_manifest: &RemoteManifest) -> Vec<FileToDownload> {
    remote_manifest
        .files
        .iter()
        .map(|entry| FileToDownload {
            local_path: entry.source_path.clone(),
            remote_path: entry.path.clone(),
        })
        .collect()
}

async fn get_files_to_update(
    remote_manifest: &RemoteManifest,
    local_manifest: &LocalManifest,
) -> Vec<FileToDownload> {
    let mut local_manifest_data = HashMap::new();
    for entry in &local_manifest.files {
        local_manifest_data.insert(&entry.path, entry.clone());
    }

    remote_manifest
        .files
        .iter()
        .filter(|entry| {
            !matches!(
                local_manifest_data.get(&entry.source_path),
                Some(local_entry) if local_entry.hash == entry.source_hash
            )
        })
        .map(|entry| FileToDownload {
            local_path: entry.source_path.clone(),
            remote_path: entry.path.clone(),
        })
        .collect()
}

async fn get_remote_files(
    base_url: &Url,
    files_to_update: &[FileToDownload],
    output_dir: &Path,
    progress_state: &ProgressState,
    pass: RemoteFilePass,
) -> anyhow::Result<usize> {
    info!(count = files_to_update.len(), "Starting clone process");

    let mut archive_readers = {
        let mut tasks = Vec::new();
        for file_data in files_to_update {
            let file_url = base_url
                .join(&file_data.remote_path)
                .context(ErrorCode::InvalidServerAddress.to_string())?;
            tasks.push(init_remote_archive_reader(file_url));
        }
        let readers: anyhow::Result<Vec<RemoteArchiveReader>> =
            futures::future::join_all(tasks).await.into_iter().collect();
        readers?
    };

    let local_file_paths: Vec<_> = files_to_update
        .iter()
        .map(|file_data| output_dir.join(&file_data.local_path))
        .collect();

    for path in &local_file_paths {
        if path.exists() && should_remove_text_file(pass, path) {
            if let Err(e) = std::fs::remove_file(path) {
                tracing::error!(path =? path.display(), error =? e, "Failed to delete text file");
            }
        }
    }

    let mut total_local_chunk_count = 0;
    for (archive_reader, local_file_path) in archive_readers.iter().zip(&local_file_paths) {
        total_local_chunk_count +=
            estimate_local_chunk_count(archive_reader, local_file_path).await?;
    }

    progress_state.set_stage(pass.scan_stage);
    progress_state.set_current_progress(0);
    progress_state.set_max_progress(total_local_chunk_count);

    let chunk_indexes = {
        let tasks: Vec<_> = archive_readers
            .iter()
            .zip(&local_file_paths)
            .map(|(reader, path)| build_local_chunk_index(reader, path, progress_state.clone()))
            .collect();
        let indexes: anyhow::Result<Vec<bitar::ChunkIndex>> =
            futures::future::join_all(tasks).await.into_iter().collect();
        indexes?
    };

    let mut clone_outputs = {
        let tasks = archive_readers
            .iter()
            .zip(&local_file_paths)
            .zip(chunk_indexes)
            .map(|((reader, path), index)| init_local_clone_output(reader, path, index));
        let outputs: anyhow::Result<Vec<bitar::CloneOutput<tokio::fs::File>>> =
            futures::future::join_all(tasks).await.into_iter().collect();
        outputs?
    };

    let mut total_download_chunk_size = 0u64;
    let mut files_repaired = 0;
    for clone_output in &clone_outputs {
        let mut file_needs_repair = false;
        for (_hash, chunk_location) in clone_output.chunks().iter_chunks() {
            total_download_chunk_size += chunk_location.size() as u64;
            file_needs_repair = true;
        }
        if file_needs_repair {
            files_repaired += 1;
        }
    }

    progress_state.set_stage(pass.transfer_stage);
    progress_state.set_current_progress(0);
    progress_state.set_max_progress(total_download_chunk_size);

    {
        let tasks = archive_readers
            .iter_mut()
            .zip(clone_outputs.iter_mut())
            .map(|(reader, output)| clone_remote_file(reader, output, progress_state.clone()));
        let results: anyhow::Result<Vec<()>> =
            futures::future::join_all(tasks).await.into_iter().collect();
        results?;
    }

    // bitar's CloneOutput never shrinks the output file; truncate any file
    // that's larger than the remote source so stale trailing bytes from an
    // older, bigger version don't shift chunk boundaries on every future pass.
    for (archive_reader, local_file_path) in archive_readers.iter().zip(&local_file_paths) {
        let source_size = archive_reader.total_source_size();
        if let Ok(metadata) = fs::metadata(local_file_path).await {
            if metadata.len() > source_size {
                let file = fs::OpenOptions::new()
                    .write(true)
                    .open(local_file_path)
                    .await
                    .with_context(|| {
                        format!(
                            "{} ({})",
                            ErrorCode::OpenFileForWriting,
                            local_file_path.display()
                        )
                    })?;
                file.set_len(source_size).await.with_context(|| {
                    format!(
                        "{} ({})",
                        ErrorCode::WriteUpdateToDisk,
                        local_file_path.display()
                    )
                })?;
            }
        }
    }

    Ok(files_repaired)
}

async fn fetch_remote_manifest(url: &str, manifest_name: &str) -> anyhow::Result<(Url, RemoteManifest)> {
    let mut url_str = url.to_owned();
    if !url_str.ends_with('/') {
        url_str.push('/');
    }
    let remote_url =
        Url::parse(&url_str).context(format!("{} ({})", ErrorCode::InvalidServerAddress, url))?;

    let remote_manifest = download_remote_manifest(&remote_url, manifest_name)
        .await
        .context(ErrorCode::CheckForUpdates.to_string())?;

    Ok((remote_url, remote_manifest))
}

/// Checks the local manifest cache against the remote manifest and downloads
/// only what changed (or, with `force_recheck`, re-checks every file's hash
/// regardless of the cache). Cheap no-op when everything already matches.
/// Returns the number of files that had chunks downloaded.
pub async fn sync_game_files(
    output_dir: &Path,
    url: &str,
    manifest_name: &str,
    force_recheck: bool,
    progress_state: ProgressState,
) -> anyhow::Result<usize> {
    progress_state.set_stage(ProgressStage::FetchingMetadata);
    fs::create_dir_all(output_dir)
        .await
        .context(ErrorCode::CreateGameFolder.to_string())?;

    let (remote_url, remote_manifest) = fetch_remote_manifest(url, manifest_name).await?;
    let local_manifest_path = local_manifest_path(output_dir, &remote_url);
    let local_manifest = get_or_create_local_manifest(&local_manifest_path)
        .await
        .context(ErrorCode::ReadLocalData.to_string())?;

    let files_to_update = if force_recheck {
        build_full_file_list(&remote_manifest)
    } else {
        get_files_to_update(&remote_manifest, &local_manifest).await
    };

    let files_repaired = get_remote_files(
        &remote_url,
        &files_to_update,
        output_dir,
        &progress_state,
        RemoteFilePass::update(),
    )
    .await
    .context(ErrorCode::DownloadArchive.to_string())?;

    let new_local_manifest = build_local_manifest(&remote_manifest);
    save_local_manifest(&local_manifest_path, &new_local_manifest).await?;

    progress_state.set_stage(ProgressStage::Done);
    Ok(files_repaired)
}

/// Full verify-and-repair pass: checks every file against the remote
/// manifest (ignoring the local cache entirely) and re-downloads anything
/// that doesn't match. Matches rose-updater's `--verify` flag / "Repair"
/// button. Returns the number of files repaired.
pub async fn verify_game_files(
    output_dir: &Path,
    url: &str,
    manifest_name: &str,
    progress_state: ProgressState,
) -> anyhow::Result<usize> {
    progress_state.set_stage(ProgressStage::FetchingMetadata);

    let (remote_url, remote_manifest) = fetch_remote_manifest(url, manifest_name).await?;
    let all_files = build_full_file_list(&remote_manifest);

    let files_repaired = get_remote_files(
        &remote_url,
        &all_files,
        output_dir,
        &progress_state,
        RemoteFilePass::verify(),
    )
    .await
    .context(ErrorCode::DownloadArchive.to_string())?;

    let local_manifest_path = local_manifest_path(output_dir, &remote_url);
    let new_local_manifest = build_local_manifest(&remote_manifest);
    save_local_manifest(&local_manifest_path, &new_local_manifest).await?;

    progress_state.set_stage(ProgressStage::Done);
    Ok(files_repaired)
}
