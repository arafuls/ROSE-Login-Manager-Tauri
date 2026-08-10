//! Vendored from rednimgames/rose-updater (MIT licensed), src/error.rs,
//! near-verbatim. See rose_update/mod.rs for why this is vendored rather
//! than depended on directly.
//!
//! Kept because these are the exact codes ROSE Online's own support
//! documentation references (https://github.com/rednimgames/rose-updater/
//! blob/main/ERROR_CODES.md) - if something goes wrong, a user can look up
//! "ROSE-104" and get Rednim's own troubleshooting steps, not a message we
//! invented ourselves.

use std::fmt;

/// Error codes for user-facing error messages.
///
/// Categories:
/// - ROSE-1xx: Network & server errors
/// - ROSE-2xx: File system errors
/// - ROSE-3xx: Data integrity errors
#[derive(Debug, Clone, Copy)]
pub enum ErrorCode {
    // Network (1xx)
    CheckForUpdates = 100,
    DownloadManifest = 101,
    InvalidServerAddress = 102,
    SetupConnection = 103,
    DownloadArchive = 104,
    DownloadChunk = 105,

    // File system (2xx)
    CreateGameFolder = 200,
    ReadLocalData = 201,
    SaveProgress = 202,
    OpenFileForReading = 203,
    OpenFileForWriting = 204,
    CreateFolder = 205,
    WriteUpdateToDisk = 206,
    ReadFileMetadata = 207,

    // Data integrity (3xx)
    InvalidServerData = 300,
    CorruptDownload = 301,
    IntegrityCheckFailed = 302,
    PrepareFileForUpdate = 303,
    VerifyLocalFile = 304,
    ProcessDownloadedData = 305,
}

impl ErrorCode {
    pub fn code(self) -> u16 {
        self as u16
    }

    fn message(self) -> &'static str {
        match self {
            Self::CheckForUpdates => "Failed to check for updates",
            Self::DownloadManifest => "Could not download update information",
            Self::InvalidServerAddress => "Invalid update server address",
            Self::SetupConnection => "Could not set up the download connection",
            Self::DownloadArchive => "Could not download game data",
            Self::DownloadChunk => "Failed to download a game file chunk",

            Self::CreateGameFolder => "Could not create the game folder",
            Self::ReadLocalData => "Could not read local update data",
            Self::SaveProgress => "Could not save update progress",
            Self::OpenFileForReading => "Could not open game file for reading",
            Self::OpenFileForWriting => "Could not open game file for updating",
            Self::CreateFolder => "Could not create folder",
            Self::WriteUpdateToDisk => "Could not write update to disk",
            Self::ReadFileMetadata => "Could not check game file",

            Self::InvalidServerData => "Received invalid data from the update server",
            Self::CorruptDownload => "Downloaded data appears corrupted",
            Self::IntegrityCheckFailed => "Downloaded data failed integrity check",
            Self::PrepareFileForUpdate => "Could not prepare game file for updating",
            Self::VerifyLocalFile => "Could not verify a local game file",
            Self::ProcessDownloadedData => "Could not process downloaded data",
        }
    }
}

impl fmt::Display for ErrorCode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "[ROSE-{}] {}", self.code(), self.message())
    }
}
