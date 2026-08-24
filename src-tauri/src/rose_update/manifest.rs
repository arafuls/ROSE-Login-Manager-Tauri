//! Vendored from rednimgames/rose-updater (MIT licensed), src/manifest.rs,
//! near-verbatim (only the ErrorCode import path changed).

use std::path::Path;

use anyhow::Context;
use reqwest::Url;
use serde::{Deserialize, Serialize};
use tokio::fs;
use tracing::info;

use super::error::ErrorCode;

/// The manifest as published on the update server.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct RemoteManifest {
    pub version: usize,
    pub files: Vec<RemoteManifestFileEntry>,
}

/// One file's entry in a `RemoteManifest`.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct RemoteManifestFileEntry {
    pub path: String,
    pub source_path: String,
    pub source_hash: Vec<u8>,
    pub source_size: usize,
}

/// The manifest describing what's currently installed locally, persisted
/// alongside the game files so a later sync knows what it already has.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct LocalManifest {
    pub version: usize,
    pub files: Vec<LocalManifestFileEntry>,
}

/// One file's entry in a `LocalManifest`.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct LocalManifestFileEntry {
    pub path: String,
    pub hash: Vec<u8>,
    pub size: usize,
}

/// Reads the local manifest from `path`, or returns an empty one if it
/// doesn't exist yet or fails to parse.
pub async fn get_or_create_local_manifest(path: &Path) -> anyhow::Result<LocalManifest> {
    info!("Getting local manifest");

    let local_manifest = if path
        .try_exists()
        .context("Failed to get the local manifest")?
    {
        info!(local_manifest_path=%path.display(), "Using existing manifest file");

        let manifest_file = fs::File::open(&path)
            .await
            .context(ErrorCode::ReadLocalData.to_string())?;
        match serde_json::from_reader(manifest_file.into_std().await) {
            Ok(manifest) => manifest,
            Err(_) => {
                info!("Failed to parse local manifest");
                LocalManifest::default()
            }
        }
    } else {
        info!("Creating new manifest");
        LocalManifest::default()
    };

    Ok(local_manifest)
}

/// Writes the local manifest to disk, creating its parent directory if needed.
pub async fn save_local_manifest(
    manifest_path: &Path,
    manifest: &LocalManifest,
) -> anyhow::Result<()> {
    info!(
        manifest_path =% manifest_path.display(),
        "Saving local manifest"
    );

    if let Some(manifest_parent_dir) = manifest_path.parent() {
        fs::create_dir_all(manifest_parent_dir)
            .await
            .context(ErrorCode::SaveProgress.to_string())?;
    }

    let manifest_file = fs::File::create(manifest_path)
        .await
        .context(ErrorCode::SaveProgress.to_string())?;
    serde_json::to_writer(manifest_file.into_std().await, &manifest)
        .context(ErrorCode::SaveProgress.to_string())?;

    Ok(())
}

/// Fetches and parses `manifest_name` from the update server.
pub async fn download_remote_manifest(
    remote_url: &Url,
    manifest_name: &str,
) -> anyhow::Result<RemoteManifest> {
    let remote_manifest_url = remote_url
        .join(manifest_name)
        .context(ErrorCode::InvalidServerAddress.to_string())?;

    info!(url=% remote_manifest_url.as_str(), "Downloading remote manifest");

    let response = reqwest::get(remote_manifest_url)
        .await
        .context(ErrorCode::DownloadManifest.to_string())?;

    let manifest = response
        .json::<RemoteManifest>()
        .await
        .context(ErrorCode::InvalidServerData.to_string())?;

    Ok(manifest)
}
