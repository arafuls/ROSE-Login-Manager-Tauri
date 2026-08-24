//! Vendored from rednimgames/rose-updater (MIT licensed), src/clone.rs.
//! One deliberate change: the original resolves DNS through a hardcoded
//! Cloudflare resolver (their src/dns.rs) as a robustness measure against
//! unreliable ISP DNS. That module was left un-vendored (self-contained
//! but an extra dependency - hickory-resolver - for a corner case, not
//! something correctness depends on); this uses reqwest's default system
//! DNS resolution instead. Revisit if DNS-related update failures turn up
//! in practice.
//!
//! # ROSE Updater Clone
//!
//! Cloning a local file to match a remote bitar archive:
//! 1. Open a `RemoteArchiveReader` over HTTP for the remote archive.
//! 2. Scan the local file to build a `ChunkIndex` of what it already has.
//! 3. Reorder the local file in place to prepare it as a `CloneOutput`.
//! 4. Stream and apply only the chunks the local file is missing.

use std::path::Path;
use std::sync::OnceLock;

use anyhow::Context;
use bitar::CloneOutput;
use futures::StreamExt;
use tokio::fs;
use tokio::sync::Semaphore;

use super::error::ErrorCode;
use super::progress::ProgressState;

pub type RemoteArchiveReader = bitar::Archive<bitar::archive_reader::HttpReader>;

const LOCAL_CHUNK_BUFFER_SIZE: usize = 64;
const REMOTE_CHUNK_BUFFER_SIZE: usize = 64;

/// Bounds the number of chunks being hashed/decompressed concurrently across
/// the entire process - chunk verification/decompression is CPU-bound and
/// otherwise oversubscribes the CPU when many files are processed at once.
fn cpu_semaphore() -> &'static Semaphore {
    static SEM: OnceLock<Semaphore> = OnceLock::new();
    SEM.get_or_init(|| {
        let cores = std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(4);
        let permits = (cores / 2).max(2);
        Semaphore::new(permits)
    })
}

/// Opens an HTTP-backed reader over the remote bitar archive at `url`.
pub async fn init_remote_archive_reader(url: reqwest::Url) -> anyhow::Result<RemoteArchiveReader> {
    let client = reqwest::ClientBuilder::new()
        .brotli(true)
        .build()
        .context(ErrorCode::SetupConnection.to_string())?
        .get(url.clone());

    let http_reader = bitar::archive_reader::HttpReader::from_request(client).retries(4);
    let archive = bitar::Archive::try_init(http_reader)
        .await
        .with_context(|| format!("{} ({})", ErrorCode::DownloadArchive, &url))?;

    Ok(archive)
}

/// Estimates how many chunks the local file will scan into, for progress
/// bar sizing before the actual scan runs. Returns 0 if the file doesn't exist yet.
pub async fn estimate_local_chunk_count(
    archive_reader: &RemoteArchiveReader,
    local_file_path: &Path,
) -> anyhow::Result<u64> {
    if !local_file_path.exists() {
        return Ok(0);
    }

    let chunker_config = archive_reader.chunker_config();
    let chunk_size = match chunker_config {
        bitar::chunker::Config::FixedSize(size) => *size as u64,
        _ => 1,
    };

    let local_file_metadata = tokio::fs::metadata(local_file_path)
        .await
        .with_context(|| {
            format!(
                "{} ({})",
                ErrorCode::ReadFileMetadata,
                local_file_path.display()
            )
        })?;

    let local_file_size = local_file_metadata.len();
    let local_chunk_count = (local_file_size + chunk_size - 1) / chunk_size;

    Ok(local_chunk_count)
}

/// Scans the local file into a `ChunkIndex` of the chunks it already
/// contains, so `clone_remote_file` only has to download what's missing.
pub async fn build_local_chunk_index(
    archive_reader: &RemoteArchiveReader,
    local_file_path: &Path,
    progress_state: ProgressState,
) -> anyhow::Result<bitar::ChunkIndex> {
    if !local_file_path.exists() {
        return Ok(bitar::ChunkIndex::new_empty(
            archive_reader.chunk_hash_length(),
        ));
    }

    let mut local_file = tokio::fs::OpenOptions::new()
        .read(true)
        .open(local_file_path)
        .await
        .with_context(|| {
            format!(
                "{} ({})",
                ErrorCode::OpenFileForReading,
                local_file_path.display()
            )
        })?;

    let chunker_config = archive_reader.chunker_config();
    let use_incremental_progress = matches!(chunker_config, bitar::chunker::Config::FixedSize(_));

    let mut chunk_stream = chunker_config
        .new_chunker(&mut local_file)
        .map(|stream_chunk| async move {
            let _permit = cpu_semaphore().acquire().await;
            tokio::task::spawn_blocking(|| {
                stream_chunk.map(|(offset, chunk)| (offset, chunk.verify()))
            })
            .await
        })
        .buffered(LOCAL_CHUNK_BUFFER_SIZE);

    let mut chunk_index = bitar::ChunkIndex::new_empty(archive_reader.chunk_hash_length());
    while let Some(r) = chunk_stream.next().await {
        let (chunk_offset, verified) = r
            .context(ErrorCode::VerifyLocalFile.to_string())?
            .context(ErrorCode::VerifyLocalFile.to_string())?;
        let (hash, chunk) = verified.into_parts();
        chunk_index.add_chunk(hash, chunk.len(), &[chunk_offset]);

        if use_incremental_progress {
            progress_state.increment_progress(1);
        }
    }

    if !use_incremental_progress {
        progress_state.increment_progress(1);
    }

    Ok(chunk_index)
}

/// Opens (creating if needed) the local file and reorders its existing
/// chunks in place to prepare it as a `CloneOutput` ready to receive
/// whatever chunks `clone_remote_file` streams in next.
pub async fn init_local_clone_output(
    archive_reader: &RemoteArchiveReader,
    local_file_path: &Path,
    local_chunk_index: bitar::ChunkIndex,
) -> anyhow::Result<CloneOutput<tokio::fs::File>> {
    if let Some(parent) = local_file_path.parent() {
        fs::create_dir_all(parent)
            .await
            .with_context(|| format!("{} ({})", ErrorCode::CreateFolder, parent.display()))?;
    }
    let local_file = tokio::fs::OpenOptions::new()
        .create(true)
        .read(true)
        .write(true)
        .truncate(false)
        .open(local_file_path)
        .await
        .with_context(|| {
            format!(
                "{} ({})",
                ErrorCode::OpenFileForWriting,
                local_file_path.display()
            )
        })?;

    let mut clone_output = CloneOutput::new(local_file, archive_reader.build_source_index());
    let _size = clone_output
        .reorder_in_place(local_chunk_index)
        .await
        .context(ErrorCode::PrepareFileForUpdate.to_string())?;
    Ok(clone_output)
}

/// Streams, decompresses, verifies, and writes every chunk `clone_output`
/// is still missing, completing the local file to match the remote archive.
pub async fn clone_remote_file(
    archive_reader: &mut RemoteArchiveReader,
    clone_output: &mut bitar::CloneOutput<tokio::fs::File>,
    progress_state: ProgressState,
) -> anyhow::Result<()> {
    let use_incremental_progress = matches!(
        archive_reader.chunker_config(),
        bitar::chunker::Config::FixedSize(_)
    );

    let mut chunk_stream = archive_reader
        .chunk_stream(clone_output.chunks())
        .map(|archive_chunk| async move {
            let _permit = cpu_semaphore().acquire().await;
            tokio::task::spawn_blocking(move || -> anyhow::Result<bitar::VerifiedChunk> {
                let compressed = archive_chunk.context(ErrorCode::DownloadChunk.to_string())?;
                let decompressed = compressed
                    .decompress()
                    .context(ErrorCode::CorruptDownload.to_string())?;
                let verified = decompressed
                    .verify()
                    .context(ErrorCode::IntegrityCheckFailed.to_string())?;
                Ok(verified)
            })
            .await
        })
        .buffered(REMOTE_CHUNK_BUFFER_SIZE);

    while let Some(r) = chunk_stream.next().await {
        let verified = r
            .context(ErrorCode::ProcessDownloadedData.to_string())?
            .context(ErrorCode::ProcessDownloadedData.to_string())?;
        let bytes_written = clone_output
            .feed(&verified)
            .await
            .context(ErrorCode::WriteUpdateToDisk.to_string())?;

        if use_incremental_progress && bytes_written > 0 {
            progress_state.increment_progress(verified.len() as u64);
        }
    }

    if !use_incremental_progress {
        progress_state.increment_progress(1);
    }

    Ok(())
}
