//! `profiles_launch` - spawns the ROSE Online client (`trose.exe`) with a
//! profile's decrypted credentials on the command line, matching the old
//! app's `--login --server ... --username ... --password ...` invocation.
//!
//! Accepted limitation, not a bug: `trose.exe` only accepts login
//! credentials as command-line arguments, which are visible to any other
//! process on the machine (Task Manager's Command line column,
//! `Win32_Process.CommandLine`, etc.) for as long as the client runs. This
//! was flagged in the design review of the old app; the game developers
//! have been informed. There is no launcher-side fix for how the game
//! client itself accepts credentials, so this isn't attempted here.

use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

use crate::crypto;
use crate::db::profiles;
use crate::error::{AppError, AppResult};
use crate::settings;
use crate::state::AppState;
use crate::win32_window;

const PROFILES_CHANGED_EVENT: &str = "profiles-changed";
const LOGIN_SERVER: &str = "connect.roseonlinegame.com";

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
    let exe_path = std::path::Path::new(&game_folder).join("trose.exe");
    if !exe_path.exists() {
        return Err(AppError::GameExecutableNotFound);
    }

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

    // `Shell::command` with an absolute path spawns that executable directly
    // (unlike `Shell::sidecar`, this doesn't require pre-registering
    // trose.exe anywhere) - the game folder is user-configured in Settings,
    // not bundled with this app.
    let (mut rx, child) = app
        .shell()
        .command(exe_path.to_string_lossy().to_string())
        .current_dir(&game_folder)
        .args([
            "--login",
            "--server",
            LOGIN_SERVER,
            "--username",
            email.as_str(),
            "--password",
            password.as_str(),
        ])
        .spawn()
        .map_err(|e| AppError::Internal(format!("failed to launch trose.exe: {e}")))?;

    {
        let conn = state.db.lock().unwrap();
        profiles::set_status(&conn, &email, true)?;
    }
    let _ = app.emit(PROFILES_CHANGED_EVENT, ());

    if current_settings.launch_client_behind {
        // Runs on a blocking thread (it polls with std::thread::sleep for up
        // to ~5s waiting for the client's window to appear) so it doesn't
        // delay this command's response to the frontend.
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
    });

    Ok(())
}
