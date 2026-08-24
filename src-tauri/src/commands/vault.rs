//! `vault_*` commands: passphrase-based unlock for the encrypted profile store,
//! with a recovery key as a second, independent way to unlock it.
//!
//! No passphrase, recovery key, or the derived DEK itself is ever persisted.
//! `vault_setup` generates a random DEK and stores it wrapped (encrypted)
//! under two independently-derived keys - one from the passphrase, one from
//! a freshly generated recovery key shown to the user exactly once. Either
//! wrapping can be unwrapped to recover the same DEK: `vault_unlock` uses the
//! passphrase-wrapped copy, `vault_recover` uses the recovery-key-wrapped
//! copy (and re-wraps the DEK under a new passphrase in the same step, since
//! recovery only happens when the old passphrase is gone). If both are lost,
//! `vault_reset` is the only way out - there is no backdoor.

use tauri::State;

use crate::crypto;
use crate::db::vault_meta;
use crate::error::{AppError, AppResult};
use crate::models::VaultSetupResult;
use crate::state::AppState;

/// Whether `vault_setup` has ever run - drives whether the frontend shows
/// the first-run setup screen or the unlock screen.
#[tauri::command]
pub fn vault_is_initialized(state: State<AppState>) -> AppResult<bool> {
    let conn = state.db.lock().unwrap();
    vault_meta::is_initialized(&conn)
}

/// First-run only: generates the DEK, wraps it under both the passphrase
/// and a freshly generated recovery key, persists both wrappings, and
/// unlocks the vault for this session. Returns the recovery key so the
/// frontend can show it exactly once (see [`VaultSetupResult`]).
#[tauri::command]
pub fn vault_setup(passphrase: String, state: State<AppState>) -> AppResult<VaultSetupResult> {
    let conn = state.db.lock().unwrap();

    if vault_meta::is_initialized(&conn)? {
        return Err(AppError::VaultAlreadyInitialized);
    }
    crypto::validate_passphrase_len(&passphrase)?;

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

/// Unlocks with the vault's passphrase, storing the recovered DEK in
/// session state for `crypto::encrypt`/`decrypt` calls elsewhere to use.
#[tauri::command]
pub fn vault_unlock(passphrase: String, state: State<AppState>) -> AppResult<()> {
    let conn = state.db.lock().unwrap();

    let meta = vault_meta::load(&conn)?.ok_or(AppError::VaultNotInitialized)?;
    let key = crypto::derive_key(&passphrase, &meta.passphrase_salt)?;

    // A decrypt failure here means the AEAD tag didn't authenticate, i.e. the
    // derived key is wrong, i.e. the passphrase was wrong.
    let dek_bytes = crypto::decrypt(&key, &meta.wrapped_dek_by_passphrase)
        .map_err(|_| AppError::WrongPassphrase)?;
    let dek = to_vault_key(dek_bytes)?;

    *state.vault_key.lock().unwrap() = Some(dek);
    Ok(())
}

/// Unlocks using the one-time recovery key shown at setup, then immediately
/// re-wraps the recovered DEK under `new_passphrase` - recovery only ever
/// happens because the old passphrase is gone, so there's no reason to make
/// the user unlock once with the recovery key and separately go set a new
/// passphrase afterward. The original recovery key keeps working after this,
/// since it wraps the same DEK independently of the passphrase wrapping.
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

/// Rotates the passphrase while it's still known - unlike `vault_recover`,
/// this doesn't need the recovery key. Authenticates via `current_passphrase`
/// (a decrypt failure means it was wrong), then re-wraps the *same* DEK
/// under a freshly-salted key derived from `new_passphrase`. The recovery-
/// key wrapping is untouched - it keeps working afterward, same as after
/// `vault_recover`. `state.vault_key` doesn't need updating: only how the
/// DEK is wrapped changes, not the DEK itself, so the already-unlocked
/// session key stays valid.
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

/// Last resort when both the passphrase and the recovery key are lost: wipes
/// the vault and every saved profile, returning the app to first-run state.
/// No confirmation/undo at this layer - the frontend is responsible for
/// making sure this is a deliberate, hard-to-misclick action.
#[tauri::command]
pub fn vault_reset(state: State<AppState>) -> AppResult<()> {
    let conn = state.db.lock().unwrap();
    vault_meta::reset(&conn)?;
    *state.vault_key.lock().unwrap() = None;
    Ok(())
}

/// Whether this session currently has the DEK in memory (i.e. unlocked).
#[tauri::command]
pub fn vault_is_unlocked(state: State<AppState>) -> bool {
    state.vault_key.lock().unwrap().is_some()
}

/// Drops the in-memory DEK, re-locking the vault for this session without
/// touching anything persisted on disk.
#[tauri::command]
pub fn vault_lock(state: State<AppState>) {
    *state.vault_key.lock().unwrap() = None;
}

/// Converts a decrypted DEK's raw bytes into the fixed-size array type used
/// everywhere else, surfacing a clear error instead of a panic if a
/// corrupted wrapping ever decrypts to the wrong length.
fn to_vault_key(bytes: Vec<u8>) -> AppResult<crypto::VaultKey> {
    bytes
        .try_into()
        .map_err(|_| AppError::Crypto("unwrapped DEK had an unexpected length".into()))
}
