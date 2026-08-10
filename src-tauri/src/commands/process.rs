//! `profiles_launch` / `client_launch_default` / `updater_force_recheck` -
//! spawning the ROSE Online client, optionally through `rose-updater.exe`
//! (see `crate::updater` for the update-wrapping logic and its caveats).
//!
//! Accepted limitation, not a bug: `trose.exe` only accepts login
//! credentials as command-line arguments, which are visible to any other
//! process on the machine (Task Manager's Command line column,
//! `Win32_Process.CommandLine`, etc.) for as long as the client runs. This
//! was flagged in the design review of the old app; the game developers
//! have been informed. There is no launcher-side fix for how the game
//! client itself accepts credentials, so this isn't attempted here.

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_shell::process::CommandEvent;

use crate::crypto;
use crate::db::profiles;
use crate::error::{AppError, AppResult};
use crate::settings;
use crate::state::AppState;
use crate::updater::{self, LaunchOutcome};
use crate::win32_window;

const PROFILES_CHANGED_EVENT: &str = "profiles-changed";
const LAUNCH_STATUS_EVENT: &str = "client-launch-status";
const LOGIN_SERVER: &str = "connect.roseonlinegame.com";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LaunchStatus {
    running: bool,
    /// Which action this status belongs to, so the frontend can show the
    /// right label ("Launching...", "Verifying files...") and reset the
    /// right button's disabled state.
    context: &'static str,
}

fn emit_status(app: &AppHandle, context: &'static str, running: bool) {
    let _ = app.emit(LAUNCH_STATUS_EVENT, LaunchStatus { running, context });
}

#[tauri::command]
pub async fn profiles_launch(
    email: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> AppResult<()> {
    let vault_key = state.require_unlocked()?;

    let current_settings = settings::load(&state.app_data_dir)?;
    let game_folder = current_settings
        .rose_game_folder
        .ok_or(AppError::GameFolderNotSet)?;
    let game_folder_path = std::path::Path::new(&game_folder);

    let encrypted_password = {
        let conn = state.db.lock().unwrap();
        let profile = profiles::get(&conn, &email)?.ok_or(AppError::ProfileNotFound)?;
        if profile.status {
            return Err(AppError::AlreadyRunning);
        }
        profiles::get_encrypted_password(&conn, &email)?.ok_or(AppError::ProfileNotFound)?
    };

    let plaintext = crypto::decrypt(&vault_key, &encrypted_password)?;
    let password = String::from_utf8(plaintext)
        .map_err(|e| AppError::Crypto(format!("stored password was not valid UTF-8: {e}")))?;

    let client_args = vec![
        "--login".to_string(),
        "--server".to_string(),
        LOGIN_SERVER.to_string(),
        "--username".to_string(),
        email.clone(),
        "--password".to_string(),
        password,
    ];
    let LaunchOutcome {
        mut rx,
        child,
        via_updater,
    } = updater::launch(&app, game_folder_path, &client_args)?;

    {
        let conn = state.db.lock().unwrap();
        profiles::set_status(&conn, &email, true)?;
    }
    let _ = app.emit(PROFILES_CHANGED_EVENT, ());
    emit_status(&app, "profile", true);

    if current_settings.launch_client_behind && !via_updater {
        let behind_app = app.clone();
        let child_pid = child.pid();
        tauri::async_runtime::spawn_blocking(move || {
            win32_window::move_behind_main_window(&behind_app, child_pid);
        });
    }

    // Watch for the client exiting on a background task so the profile's
    // "running" status clears itself without the user having to do anything -
    // matches the old app's `ProcessManager` subscribing to `Process.Exited`.
    let watch_app = app.clone();
    let watch_email = email.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            if matches!(event, CommandEvent::Terminated(_)) {
                break;
            }
        }
        if let Some(watch_state) = watch_app.try_state::<AppState>() {
            if let Ok(conn) = watch_state.db.lock() {
                let _ = profiles::set_status(&conn, &watch_email, false);
            }
        }
        let _ = watch_app.emit(PROFILES_CHANGED_EVENT, ());
        emit_status(&watch_app, "profile", false);
    });

    Ok(())
}

/// Launches the client with no saved profile - the game shows its own login
/// screen. No vault interaction at all, since no stored credentials are
/// touched. Matches the old app's `LoginThread()` no-argument overload
/// (`--login --server ...`, no `--username`/`--password`).
#[tauri::command]
pub async fn client_launch_default(state: State<'_, AppState>, app: AppHandle) -> AppResult<()> {
    let current_settings = settings::load(&state.app_data_dir)?;
    let game_folder = current_settings
        .rose_game_folder
        .ok_or(AppError::GameFolderNotSet)?;
    let game_folder_path = std::path::Path::new(&game_folder);

    let client_args = vec![
        "--login".to_string(),
        "--server".to_string(),
        LOGIN_SERVER.to_string(),
    ];
    let LaunchOutcome {
        mut rx,
        child,
        via_updater,
    } = updater::launch(&app, game_folder_path, &client_args)?;

    emit_status(&app, "default", true);

    if current_settings.launch_client_behind && !via_updater {
        let behind_app = app.clone();
        let child_pid = child.pid();
        tauri::async_runtime::spawn_blocking(move || {
            win32_window::move_behind_main_window(&behind_app, child_pid);
        });
    }

    let watch_app = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            if matches!(event, CommandEvent::Terminated(_)) {
                break;
            }
        }
        emit_status(&watch_app, "default", false);
    });

    Ok(())
}

/// "Verify File Integrity" / "Force Recheck": runs rose-updater to check and
/// update game files without launching the client. Errors with
/// `updater_not_found` if rose-updater.exe isn't in the game folder - there's
/// no meaningful fallback for a verify-only action without it.
#[tauri::command]
pub async fn updater_force_recheck(state: State<'_, AppState>, app: AppHandle) -> AppResult<()> {
    let current_settings = settings::load(&state.app_data_dir)?;
    let game_folder = current_settings
        .rose_game_folder
        .ok_or(AppError::GameFolderNotSet)?;
    let game_folder_path = std::path::Path::new(&game_folder);

    let LaunchOutcome { mut rx, .. } = updater::force_recheck(&app, game_folder_path)?;

    emit_status(&app, "verify", true);

    let watch_app = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            if matches!(event, CommandEvent::Terminated(_)) {
                break;
            }
        }
        emit_status(&watch_app, "verify", false);
    });

    Ok(())
}
