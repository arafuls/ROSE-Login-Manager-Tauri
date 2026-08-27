//! `vault_*` commands: Passphrase-based unlock for the encrypted profile store,
//! backed by a recovery key and an optional OS-protected (DPAPI) session cache.
//!
//! DEKs are never persisted in plaintext. They are stored wrapped under both a 
//! passphrase-derived key and an independent recovery key. If both are lost, 
//! `vault_reset` is the only recovery path.

use tauri::State;

use crate::crypto;
use crate::db::{vault_meta, vault_session};
use crate::error::{AppError, AppResult};
use crate::models::VaultSetupResult;
use crate::os_credential;
use crate::state::AppState;

/// Checks if `vault_setup` has run to direct the frontend layout.
#[tauri::command]
pub fn vault_is_initialized(state: State<AppState>) -> AppResult<bool> {
    let conn = state.db.lock().unwrap();
    vault_meta::is_initialized(&conn)
}

/// Generates a new DEK, wraps it using both the passphrase and a new recovery key,
/// persists the wrappings, and unlocks the session. Returns the recovery key.
#[tauri::command]
pub fn vault_setup(passphrase: String, state: State<AppState>) -> AppResult<VaultSetupResult> {
    let conn = state.db.lock().unwrap();

    if vault_meta::is_initialized(&conn)? {
        return Err(AppError::VaultAlreadyInitialized);
    }
    crypto::validate_passphrase_len(&passphrase)?;

    // Clear stale session rows left behind by non-transactional resets.
    clear_stay_unlocked(&conn)?;

    let dek = crypto::generate_dek();

    let passphrase_salt = crypto::random_salt();
    let passphrase_key = crypto::derive_key(&passphrase, &passphrase_salt)?;
    let wrapped_dek_by_passphrase = crypto::encrypt(&passphrase_key, &dek)?;

    let recovery_key = crypto::generate_recovery_key();
    let recovery_salt = crypto::random_salt();
    let recovery_derived_key =
        crypto::derive_key(&crypto::normalize_recovery_key(&recovery_key), &recovery_salt)?;
    let wrapped_dek_by_recovery = crypto::encrypt(&recovery_derived_key, &dek)?;

    vault_meta::insert(
        &conn,
        &vault_meta::VaultMeta {
            passphrase_salt: passphrase_salt.to_vec(),
            wrapped_dek_by_passphrase,
            recovery_salt: recovery_salt.to_vec(),
            wrapped_dek_by_recovery,
        },
    )?;

    *state.vault_key.lock().unwrap() = Some(dek);

    Ok(VaultSetupResult { recovery_key })
}

/// Unlocks the vault via passphrase and loads the DEK into session memory.
#[tauri::command]
pub fn vault_unlock(passphrase: String, state: State<AppState>) -> AppResult<()> {
    let conn = state.db.lock().unwrap();

    let meta = vault_meta::load(&conn)?.ok_or(AppError::VaultNotInitialized)?;
    let key = crypto::derive_key(&passphrase, &meta.passphrase_salt)?;

    let dek_bytes = crypto::decrypt(&key, &meta.wrapped_dek_by_passphrase)
        .map_err(|_| AppError::WrongPassphrase)?;
    let dek = to_vault_key(dek_bytes)?;

    *state.vault_key.lock().unwrap() = Some(dek);
    Ok(())
}

/// Unlocks via recovery key and re-wraps the DEK under `new_passphrase`.
/// Leaves the original recovery key wrapping intact.
#[tauri::command]
pub fn vault_recover(
    recovery_key: String,
    new_passphrase: String,
    state: State<AppState>,
) -> AppResult<()> {
    crypto::validate_passphrase_len(&new_passphrase)?;

    let conn = state.db.lock().unwrap();
    let meta = vault_meta::load(&conn)?.ok_or(AppError::VaultNotInitialized)?;

    let normalized = crypto::normalize_recovery_key(&recovery_key);
    let recovery_derived_key = crypto::derive_key(&normalized, &meta.recovery_salt)?;
    let dek_bytes = crypto::decrypt(&recovery_derived_key, &meta.wrapped_dek_by_recovery)
        .map_err(|_| AppError::InvalidRecoveryKey)?;
    let dek = to_vault_key(dek_bytes)?;

    let new_passphrase_salt = crypto::random_salt();
    let new_passphrase_key = crypto::derive_key(&new_passphrase, &new_passphrase_salt)?;
    let new_wrapped_dek = crypto::encrypt(&new_passphrase_key, &dek)?;
    vault_meta::update_passphrase_wrap(&conn, &new_passphrase_salt, &new_wrapped_dek)?;

    *state.vault_key.lock().unwrap() = Some(dek);
    Ok(())
}

/// Re-wraps the DEK under a new passphrase using the current passphrase for auth.
/// Keeps the DEK and recovery wrapping unchanged.
#[tauri::command]
pub fn vault_change_passphrase(
    current_passphrase: String,
    new_passphrase: String,
    state: State<AppState>,
) -> AppResult<()> {
    crypto::validate_passphrase_len(&new_passphrase)?;

    let conn = state.db.lock().unwrap();
    let meta = vault_meta::load(&conn)?.ok_or(AppError::VaultNotInitialized)?;

    let current_key = crypto::derive_key(&current_passphrase, &meta.passphrase_salt)?;
    let dek_bytes = crypto::decrypt(&current_key, &meta.wrapped_dek_by_passphrase)
        .map_err(|_| AppError::WrongPassphrase)?;
    let dek = to_vault_key(dek_bytes)?;

    let new_salt = crypto::random_salt();
    let new_key = crypto::derive_key(&new_passphrase, &new_salt)?;
    let new_wrapped_dek = crypto::encrypt(&new_key, &dek)?;
    vault_meta::update_passphrase_wrap(&conn, &new_salt, &new_wrapped_dek)?;

    Ok(())
}

/// Wipes all vault data and returns the app to a fresh first-run state.
#[tauri::command]
pub fn vault_reset(state: State<AppState>) -> AppResult<()> {
    let conn = state.db.lock().unwrap();
    vault_meta::reset(&conn)?;
    clear_stay_unlocked(&conn)?;
    *state.vault_key.lock().unwrap() = None;
    Ok(())
}

/// Wipes all vault data and returns the app to a fresh first-run state.
#[tauri::command]
pub fn vault_is_unlocked(state: State<AppState>) -> bool {
    state.vault_key.lock().unwrap().is_some()
}

/// Clears the in-memory DEK and removes any saved OS-protected session blob.
#[tauri::command]
pub fn vault_lock(state: State<AppState>) -> AppResult<()> {
    let conn = state.db.lock().unwrap();
    clear_stay_unlocked(&conn)?;
    *state.vault_key.lock().unwrap() = None;
    Ok(())
}

/// Checks if an OS-protected DEK copy is currently saved ("stay unlocked").
#[tauri::command]
pub fn vault_stay_unlocked_is_enabled(state: State<AppState>) -> AppResult<bool> {
    let conn = state.db.lock().unwrap();
    vault_session::is_enabled(&conn)
}

/// Whether this platform's OS-backed storage is reachable right now - gates
/// whether the frontend offers the toggle. Always `true` on Windows; a real
/// Secret Service probe on Linux.
#[tauri::command]
pub fn vault_stay_unlocked_is_supported() -> bool {
    os_credential::is_supported()
}

/// Confirms the passphrase and saves an OS-protected copy of the DEK for auto-unlock.
#[tauri::command]
pub fn vault_enable_stay_unlocked(passphrase: String, state: State<AppState>) -> AppResult<()> {
    let conn = state.db.lock().unwrap();

    let meta = vault_meta::load(&conn)?.ok_or(AppError::VaultNotInitialized)?;
    let key = crypto::derive_key(&passphrase, &meta.passphrase_salt)?;
    let dek_bytes = crypto::decrypt(&key, &meta.wrapped_dek_by_passphrase)
        .map_err(|_| AppError::WrongPassphrase)?;

    let wrapped_dek_by_os = os_credential::protect(&dek_bytes)?;
    vault_session::save(&conn, &wrapped_dek_by_os)?;
    Ok(())
}

/// Disables "stay unlocked" by removing the OS-protected session blob.
#[tauri::command]
pub fn vault_disable_stay_unlocked(state: State<AppState>) -> AppResult<()> {
    let conn = state.db.lock().unwrap();
    clear_stay_unlocked(&conn)
}

/// Unlocks using an OS-protected DEK at startup. Clears invalid/corrupted blobs and returns `false`.
#[tauri::command]
pub fn vault_resume_from_os(state: State<AppState>) -> AppResult<bool> {
    if state.vault_key.lock().unwrap().is_some() {
        return Ok(true);
    }

    let conn = state.db.lock().unwrap();
    let Some(wrapped) = vault_session::load(&conn)? else {
        return Ok(false);
    };

    match os_credential::unprotect(&wrapped) {
        Ok(dek_bytes) => {
            let dek = to_vault_key(dek_bytes)?;
            *state.vault_key.lock().unwrap() = Some(dek);
            Ok(true)
        }
        // Transient (e.g. keyring daemon not started yet), not a dead
        // secret - don't clear the row, or a momentary hiccup would reset
        // the setting.
        Err(AppError::CredentialStoreUnavailable(_)) => Ok(false),
        Err(_) => {
            clear_stay_unlocked(&conn)?;
            Ok(false)
        }
    }
}

/// Clears "stay unlocked" locally and, where applicable, the OS-side
/// secret - shared so no call site forgets the OS half.
/// `os_credential::clear` failures are non-fatal.
fn clear_stay_unlocked(conn: &rusqlite::Connection) -> AppResult<()> {
    vault_session::clear(conn)?;
    let _ = os_credential::clear();
    Ok(())
}

/// Converts raw decrypted DEK bytes into a fixed-size `VaultKey`.
fn to_vault_key(bytes: Vec<u8>) -> AppResult<crypto::VaultKey> {
    bytes
        .try_into()
        .map_err(|_| AppError::Crypto("unwrapped DEK had an unexpected length".into()))
}
