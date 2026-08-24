//! Tauri-managed application state: the SQLite connection, the in-memory vault key
//! (present only while unlocked - never persisted), and the resolved app data
//! directory used by the settings module.

use std::path::PathBuf;
use std::sync::Mutex;

use rusqlite::Connection;

use crate::crypto::VaultKey;
use crate::error::{AppError, AppResult};

/// Everything Tauri manages as shared app state, accessible from any
/// `#[tauri::command]` via `State<AppState>`.
pub struct AppState {
    pub db: Mutex<Connection>,
    /// `Some(key)` while the vault is unlocked for this session; `None` otherwise.
    /// Never written to disk - re-derived from the passphrase on every unlock.
    pub vault_key: Mutex<Option<VaultKey>>,
    pub app_data_dir: PathBuf,
}

impl AppState {
    /// Returns the unlocked vault key, or [`AppError::VaultLocked`] if the vault
    /// hasn't been unlocked yet this session. Every profile command that touches
    /// ciphertext must call this first, per the contract's "all error if
    /// `!vault_is_unlocked()`" rule.
    pub fn require_unlocked(&self) -> AppResult<VaultKey> {
        self.vault_key
            .lock()
            .unwrap()
            .as_ref()
            .copied()
            .ok_or(AppError::VaultLocked)
    }
}
