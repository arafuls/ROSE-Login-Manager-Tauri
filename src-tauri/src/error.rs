//! Application error type.
//!
//! Every `#[tauri::command]` returns `Result<T, AppError>`. `AppError` serializes to a
//! JSON object with a `kind` discriminant (plus a human-readable `message`) so the
//! frontend can match on `kind` for typed, field-level error handling instead of
//! parsing strings, per `docs/command-contract.md`.

use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("vault is locked")]
    VaultLocked,

    #[error("vault has already been initialized")]
    VaultAlreadyInitialized,

    #[error("vault has not been initialized yet")]
    VaultNotInitialized,

    #[error("wrong passphrase")]
    WrongPassphrase,

    #[error("passphrase must be at least {min} characters")]
    PassphraseTooShort { min: usize },

    #[error("a profile with this email already exists")]
    DuplicateEmail,

    #[error("no profile found for this email")]
    ProfileNotFound,

    #[error("export bundle is malformed or was encrypted with a different password")]
    InvalidExportBundle,

    #[error("filesystem error: {0}")]
    Io(String),

    #[error("database error: {0}")]
    Db(String),

    #[error("cryptographic error: {0}")]
    Crypto(String),

    #[error("{0}")]
    Internal(String),
}

impl AppError {
    fn kind(&self) -> &'static str {
        match self {
            AppError::VaultLocked => "vault_locked",
            AppError::VaultAlreadyInitialized => "vault_already_initialized",
            AppError::VaultNotInitialized => "vault_not_initialized",
            AppError::WrongPassphrase => "wrong_passphrase",
            AppError::PassphraseTooShort { .. } => "passphrase_too_short",
            AppError::DuplicateEmail => "duplicate_email",
            AppError::ProfileNotFound => "profile_not_found",
            AppError::InvalidExportBundle => "invalid_export_bundle",
            AppError::Io(_) => "io_error",
            AppError::Db(_) => "db_error",
            AppError::Crypto(_) => "crypto_error",
            AppError::Internal(_) => "internal_error",
        }
    }
}

// Manual Serialize impl (rather than deriving with #[serde(tag = "kind")]) so we control
// exactly two fields: `kind` (stable discriminant for the frontend to match on) and
// `message` (human-readable, for logs/toasts). Never include secrets in `message`.
impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("AppError", 2)?;
        state.serialize_field("kind", self.kind())?;
        state.serialize_field("message", &self.to_string())?;
        state.end()
    }
}

pub type AppResult<T> = Result<T, AppError>;

impl From<rusqlite::Error> for AppError {
    fn from(err: rusqlite::Error) -> Self {
        AppError::Db(err.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        AppError::Io(err.to_string())
    }
}

impl From<toml::de::Error> for AppError {
    fn from(err: toml::de::Error) -> Self {
        AppError::Internal(format!("failed to parse TOML: {err}"))
    }
}

impl From<toml::ser::Error> for AppError {
    fn from(err: toml::ser::Error) -> Self {
        AppError::Internal(format!("failed to serialize TOML: {err}"))
    }
}

impl From<base64::DecodeError> for AppError {
    fn from(_err: base64::DecodeError) -> Self {
        // A base64 decode failure on an export bundle means it was truncated/corrupted
        // or never a bundle to begin with; surface it as the same typed error as an
        // authentication failure so the frontend doesn't need to special-case it.
        AppError::InvalidExportBundle
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        AppError::Internal(format!("JSON (de)serialization error: {err}"))
    }
}
