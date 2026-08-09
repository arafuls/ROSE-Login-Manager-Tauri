//! `vault_*` commands: passphrase-based unlock for the encrypted profile store.
//!
//! No key material is ever persisted. `vault_setup` stores a random salt and a
//! "verifier" (a fixed plaintext encrypted under the Argon2id-derived key);
//! `vault_unlock` re-derives the key from the supplied passphrase and the stored
//! salt, then confirms it's correct by attempting to decrypt the verifier - AES-GCM
//! authentication fails loudly (and safely) if the key is wrong, which is how we
//! distinguish "wrong passphrase" from "everything is fine" without ever storing the
//! actual key.

use tauri::State;

use crate::crypto;
use crate::db::vault_meta;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

/// Arbitrary fixed plaintext used only to verify a derived key is correct. Its
/// content doesn't matter - only that encrypting and decrypting it round-trips.
const VERIFIER_PLAINTEXT: &[u8] = b"rose-login-manager-vault-v1";

#[tauri::command]
pub fn vault_is_initialized(state: State<AppState>) -> AppResult<bool> {
    let conn = state.db.lock().unwrap();
    vault_meta::is_initialized(&conn)
}

#[tauri::command]
pub fn vault_setup(passphrase: String, state: State<AppState>) -> AppResult<()> {
    let conn = state.db.lock().unwrap();

    if vault_meta::is_initialized(&conn)? {
        return Err(AppError::VaultAlreadyInitialized);
    }
    crypto::validate_passphrase_len(&passphrase)?;

    let salt = crypto::random_salt();
    let key = crypto::derive_key(&passphrase, &salt)?;
    let verifier = crypto::encrypt(&key, VERIFIER_PLAINTEXT)?;

    vault_meta::insert(&conn, &salt, &verifier)?;

    *state.vault_key.lock().unwrap() = Some(key);
    Ok(())
}

#[tauri::command]
pub fn vault_unlock(passphrase: String, state: State<AppState>) -> AppResult<()> {
    let conn = state.db.lock().unwrap();

    let meta = vault_meta::load(&conn)?.ok_or(AppError::VaultNotInitialized)?;
    let key = crypto::derive_key(&passphrase, &meta.salt)?;

    // A decrypt failure here means the AEAD tag didn't authenticate, i.e. the
    // derived key is wrong, i.e. the passphrase was wrong.
    crypto::decrypt(&key, &meta.verifier).map_err(|_| AppError::WrongPassphrase)?;

    *state.vault_key.lock().unwrap() = Some(key);
    Ok(())
}

#[tauri::command]
pub fn vault_is_unlocked(state: State<AppState>) -> bool {
    state.vault_key.lock().unwrap().is_some()
}
