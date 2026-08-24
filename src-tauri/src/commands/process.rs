//! `profiles_launch` / `client_launch_default` / `updater_force_recheck` -
//! syncing game files (via the vendored update logic in `crate::rose_update`,
//! see that module's doc comment for why it's vendored rather than depended
//! on) and spawning the ROSE Online client.
//!
//! Unlike the earlier version of this file, launching never shells out to
//! `rose-updater.exe`: that binary is a full GUI app (confirmed by reading
//! its actual source) with no headless mode, and even its own GUI doesn't
//! auto-launch the game after updating - a human has to click Play inside
//! its window. Routing through it would mean two clicks in two different
//! windows, not the 1-click launch this is supposed to be. Instead, update
//! logic (manifest fetch, chunked-diff download) runs in-process, with real
//! progress emitted to the frontend, followed by a direct `trose.exe` spawn.
//!
//! Accepted limitation, not a bug: `trose.exe` only accepts login
//! credentials as command-line arguments, which are visible to any other
//! process on the machine (Task Manager's Command line column,
//! `Win32_Process.CommandLine`, etc.) for as long as the client runs. This
//! was flagged in the design review of the old app; the game developers
//! have been informed. There is no launcher-side fix for how the game
//! client itself accepts credentials, so this isn't attempted here.

use std::path::Path;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_shell::process::CommandEvent;

use crate::crypto;
use crate::db::profiles;
use crate::error::{AppError, AppResult};
use crate::rose_update::progress::ProgressState;
use crate::rose_update::sync::{sync_game_files, verify_game_files};
use crate::settings;
use crate::state::AppState;
use crate::win32_window;
use crate::wine;

const PROFILES_CHANGED_EVENT: &str = "profiles-changed";
const LAUNCH_STATUS_EVENT: &str = "client-launch-status";
const LOGIN_SERVER: &str = "connect.roseonlinegame.com";

/// Matches rose-updater's actual compiled-in default (verified by reading
/// its source) - note the "2", the old app's constant and this project's
/// earlier assumption both used the wrong "updates.roseonlinegame.com".
const DEFAULT_UPDATE_URL: &str = "https://updates2.roseonlinegame.com";
const MANIFEST_NAME: &str = "manifest.json";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LaunchStatus {
    running: bool,
    /// Which action this status belongs to, so the frontend can show the
    /// right label and reset the right button's disabled state.
    context: &'static str,
    stage: Option<String>,
    current: Option<u64>,
    max: Option<u64>,
}

fn emit_status(app: &AppHandle, context: &'static str, running: bool, progress: &ProgressState) {
    let _ = app.emit(
        LAUNCH_STATUS_EVENT,
        LaunchStatus {
            running,
            context,
            stage: Some(progress.current_stage().label().to_string()),
            current: Some(progress.current_progress()),
            max: Some(progress.max_progress()),
        },
    );
}

/// Runs `work` to completion, periodically emitting `progress`'s current
/// values as a `client-launch-status` event so the frontend can show real
/// percentages instead of an indeterminate bar.
async fn run_with_progress(
    app: &AppHandle,
    context: &'static str,
    progress: &ProgressState,
    work: impl std::future::Future<Output = anyhow::Result<usize>>,
) -> anyhow::Result<usize> {
    emit_status(app, context, true, progress);

    let mut ticker = tokio::time::interval(Duration::from_millis(150));
    tokio::pin!(work);
    loop {
        tokio::select! {
            res = &mut work => break res,
            _ = ticker.tick() => {
                emit_status(app, context, true, progress);
            }
        }
    }
}

fn to_app_error(err: anyhow::Error) -> AppError {
    AppError::Internal(format!("{err:#}"))
}

/// Shared by `profiles_launch`/`client_launch_default` - both need the same
/// exe-existence check and command spawn, differing only in which
/// arguments they pass. `wine::build_launch_command` handles the Windows-
/// vs-Wine branching so this function doesn't need to know or care which
/// platform it's running on.
fn spawn_trose(
    app: &AppHandle,
    game_folder_path: &Path,
    args: &[&str],
) -> AppResult<(
    tauri::async_runtime::Receiver<CommandEvent>,
    tauri_plugin_shell::process::CommandChild,
)> {
    let exe_path = game_folder_path.join("trose.exe");
    if !exe_path.exists() {
        return Err(AppError::GameExecutableNotFound);
    }

    wine::build_launch_command(app, &exe_path)?
        .current_dir(game_folder_path)
        .args(args)
        .spawn()
        .map_err(|e| AppError::Internal(format!("failed to launch trose.exe: {e}")))
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
    let game_folder_path = Path::new(&game_folder);

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

    let progress = ProgressState::default();
    run_with_progress(
        &app,
        "profile",
        &progress,
        sync_game_files(
            game_folder_path,
            DEFAULT_UPDATE_URL,
            MANIFEST_NAME,
            false,
            progress.clone(),
        ),
    )
    .await
    .map_err(to_app_error)?;
    emit_status(&app, "profile", false, &progress);

    let (mut rx, child) = spawn_trose(
        &app,
        game_folder_path,
        &[
            "--login",
            "--server",
            LOGIN_SERVER,
            "--username",
            email.as_str(),
            "--password",
            password.as_str(),
        ],
    )?;

    {
        let conn = state.db.lock().unwrap();
        profiles::set_status(&conn, &email, true)?;
    }
    let _ = app.emit(PROFILES_CHANGED_EVENT, ());

    if current_settings.launch_client_behind {
        let behind_app = app.clone();
        let child_pid = child.pid();
        tauri::async_runtime::spawn_blocking(move || {
            win32_window::move_behind_main_window(&behind_app, child_pid);
        });
    }

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
    let game_folder_path = Path::new(&game_folder);

    let progress = ProgressState::default();
    run_with_progress(
        &app,
        "default",
        &progress,
        sync_game_files(
            game_folder_path,
            DEFAULT_UPDATE_URL,
            MANIFEST_NAME,
            false,
            progress.clone(),
        ),
    )
    .await
    .map_err(to_app_error)?;
    emit_status(&app, "default", false, &progress);

    let (mut rx, child) = spawn_trose(
        &app,
        game_folder_path,
        &["--login", "--server", LOGIN_SERVER],
    )?;

    if current_settings.launch_client_behind {
        let behind_app = app.clone();
        let child_pid = child.pid();
        tauri::async_runtime::spawn_blocking(move || {
            win32_window::move_behind_main_window(&behind_app, child_pid);
        });
    }

    tauri::async_runtime::spawn(async move { while (rx.recv().await).is_some() {} });

    Ok(())
}

/// "Verify Files": full check-and-repair of every game file against the
/// remote manifest, ignoring the local cache. Matches rose-updater's
/// `--verify` flag / "Repair" button - just without opening its window.
#[tauri::command]
pub async fn updater_force_recheck(state: State<'_, AppState>, app: AppHandle) -> AppResult<()> {
    let current_settings = settings::load(&state.app_data_dir)?;
    let game_folder = current_settings
        .rose_game_folder
        .ok_or(AppError::GameFolderNotSet)?;
    let game_folder_path = Path::new(&game_folder);

    let progress = ProgressState::default();
    run_with_progress(
        &app,
        "verify",
        &progress,
        verify_game_files(game_folder_path, DEFAULT_UPDATE_URL, MANIFEST_NAME, progress.clone()),
    )
    .await
    .map_err(to_app_error)?;
    emit_status(&app, "verify", false, &progress);

    Ok(())
}
