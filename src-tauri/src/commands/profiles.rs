//! `profiles_*` commands. Per the contract, every one of these errors if the vault
//! isn't unlocked - enforced via `AppState::require_unlocked`, which every handler
//! below calls first, even the ones (delete, reorder) that don't touch ciphertext
//! themselves, since a locked vault means "no one has proven they should be able to
//! see or touch this profile list yet."

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use tauri::{AppHandle, Emitter, State};

use crate::crypto;
use crate::db::profiles;
use crate::error::{AppError, AppResult};
use crate::models::{
    ExportBundle, ExportedProfile, ImportResult, NewProfileInput, Profile, UpdateProfileInput,
};
use crate::state::AppState;

const PROFILES_CHANGED_EVENT: &str = "profiles-changed";
const EXPORT_BUNDLE_VERSION: u8 = 1;

fn notify_changed(app: &AppHandle) {
    // Best-effort: a failed emit (e.g. no listeners yet) shouldn't fail the command
    // that already succeeded against the database.
    let _ = app.emit(PROFILES_CHANGED_EVENT, ());
}

/// Reads the contents of a file the user picked via the native open dialog
/// (`@tauri-apps/plugin-dialog`'s `open()`) for import. A dedicated command
/// rather than pulling in `tauri-plugin-fs` for this one read - that plugin's
/// static path-scoping is unnecessary complexity when the only file we ever
/// read is one the user just explicitly chose through a native dialog.
#[tauri::command]
pub fn profiles_read_export_file(path: String) -> AppResult<String> {
    std::fs::read_to_string(&path).map_err(Into::into)
}

#[tauri::command]
pub fn profiles_list(state: State<AppState>) -> AppResult<Vec<Profile>> {
    state.require_unlocked()?;
    let conn = state.db.lock().unwrap();
    profiles::list(&conn)
}

#[tauri::command]
pub fn profiles_create(
    input: NewProfileInput,
    state: State<AppState>,
    app: AppHandle,
) -> AppResult<Profile> {
    let key = state.require_unlocked()?;
    let encrypted = crypto::encrypt(&key, input.password.as_bytes())?;

    let profile = {
        let conn = state.db.lock().unwrap();
        profiles::insert(&conn, &input.name, &input.email, &encrypted)?
    };

    notify_changed(&app);
    Ok(profile)
}

#[tauri::command]
pub fn profiles_update(
    email: String,
    input: UpdateProfileInput,
    state: State<AppState>,
    app: AppHandle,
) -> AppResult<Profile> {
    let key = state.require_unlocked()?;

    let encrypted_password = input
        .password
        .as_ref()
        .map(|p| crypto::encrypt(&key, p.as_bytes()))
        .transpose()?;

    let profile = {
        let conn = state.db.lock().unwrap();
        profiles::update(
            &conn,
            &email,
            input.name.as_deref(),
            input.email.as_deref(),
            encrypted_password.as_deref(),
        )?
    };

    notify_changed(&app);
    Ok(profile)
}

#[tauri::command]
pub fn profiles_delete(email: String, state: State<AppState>, app: AppHandle) -> AppResult<()> {
    state.require_unlocked()?;
    {
        let conn = state.db.lock().unwrap();
        profiles::delete(&conn, &email)?;
    }
    notify_changed(&app);
    Ok(())
}

#[tauri::command]
pub fn profiles_reorder(
    ordered_emails: Vec<String>,
    state: State<AppState>,
    app: AppHandle,
) -> AppResult<()> {
    state.require_unlocked()?;
    {
        let conn = state.db.lock().unwrap();
        profiles::reorder(&conn, &ordered_emails)?;
    }
    notify_changed(&app);
    Ok(())
}

#[tauri::command]
pub fn profiles_export(
    emails: Vec<String>,
    export_password: String,
    state: State<AppState>,
) -> AppResult<ExportBundle> {
    let vault_key = state.require_unlocked()?;
    crypto::validate_passphrase_len(&export_password)?;

    let rows = {
        let conn = state.db.lock().unwrap();
        profiles::get_many_with_password(&conn, &emails)?
    };

    let mut exported = Vec::with_capacity(rows.len());
    for (name, email, encrypted_password) in rows {
        let plaintext = crypto::decrypt(&vault_key, &encrypted_password)?;
        let password = String::from_utf8(plaintext)
            .map_err(|e| AppError::Crypto(format!("stored password was not valid UTF-8: {e}")))?;
        exported.push(ExportedProfile {
            name,
            email,
            password,
        });
    }

    let json = serde_json::to_vec(&exported)?;

    let export_salt = crypto::random_salt();
    let export_key = crypto::derive_key(&export_password, &export_salt)?;
    let encrypted_payload = crypto::encrypt(&export_key, &json)?;

    // Bundle layout: export_salt (16 bytes) || nonce (12 bytes, from encrypt) || ciphertext+tag.
    let mut combined = Vec::with_capacity(export_salt.len() + encrypted_payload.len());
    combined.extend_from_slice(&export_salt);
    combined.extend_from_slice(&encrypted_payload);

    Ok(ExportBundle {
        version: EXPORT_BUNDLE_VERSION,
        ciphertext: BASE64.encode(combined),
    })
}

#[tauri::command]
pub fn profiles_import(
    bundle: ExportBundle,
    export_password: String,
    state: State<AppState>,
    app: AppHandle,
) -> AppResult<ImportResult> {
    let vault_key = state.require_unlocked()?;

    if bundle.version != EXPORT_BUNDLE_VERSION {
        return Err(AppError::InvalidExportBundle);
    }

    let combined = BASE64.decode(bundle.ciphertext.as_bytes())?;
    if combined.len() < crypto::SALT_LEN {
        return Err(AppError::InvalidExportBundle);
    }
    let (export_salt, encrypted_payload) = combined.split_at(crypto::SALT_LEN);

    let export_key = crypto::derive_key(&export_password, export_salt)?;
    let json = crypto::decrypt(&export_key, encrypted_payload).map_err(|_| AppError::InvalidExportBundle)?;
    let entries: Vec<ExportedProfile> = serde_json::from_slice(&json)?;

    let mut imported = 0u32;
    let mut skipped = Vec::new();

    {
        let conn = state.db.lock().unwrap();
        for entry in entries {
            if profiles::email_exists(&conn, &entry.email)? {
                skipped.push(entry.email);
                continue;
            }
            let encrypted = crypto::encrypt(&vault_key, entry.password.as_bytes())?;
            profiles::insert(&conn, &entry.name, &entry.email, &encrypted)?;
            imported += 1;
        }
    }

    if imported > 0 {
        notify_changed(&app);
    }

    Ok(ImportResult { imported, skipped })
}
