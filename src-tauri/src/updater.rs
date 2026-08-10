//! Wraps launching the ROSE Online client through `rose-updater.exe`
//! (https://github.com/rednimgames/rose-updater) when it's present in the
//! configured game folder, so the client is checked/updated before it runs.
//! Falls back to spawning `trose.exe` directly when the updater isn't there
//! (not installed alongside the game, or an older/manual game install) -
//! that fallback is byte-identical to how launching worked before this
//! module existed, so nothing regresses for anyone who doesn't have
//! rose-updater.exe yet.
//!
//! IMPORTANT - unverified CLI grammar: the exact arguments below are this
//! module's author's best reading of rose-updater's README, not verified
//! against the tool's own `--help` output or a real run (no local ROSE
//! install/updater binary was available while writing this). Specifically
//! unverified:
//!   - That `rose-updater.exe --url <url> <exe> -- <args>` is the correct
//!     "update then launch with these args" invocation.
//!   - That omitting the trailing `<exe>` target makes it check/update
//!     without launching anything (used by `force_recheck` below).
//! Verify against a real copy of rose-updater.exe before relying on this,
//! and correct DEFAULT_UPDATE_URL/the arg construction here if wrong - it's
//! deliberately isolated in this one module for exactly that reason.

use std::path::Path;

use tauri::AppHandle;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tokio::sync::mpsc::Receiver;

use crate::error::{AppError, AppResult};

const UPDATER_EXE: &str = "rose-updater.exe";
const TROSE_EXE: &str = "trose.exe";

/// Matches the old app's `RoseUpdater.cs` `RemoteUrl` constant and
/// rose-updater's own documented default.
const DEFAULT_UPDATE_URL: &str = "https://updates.roseonlinegame.com";

pub struct LaunchOutcome {
    pub rx: Receiver<CommandEvent>,
    pub child: CommandChild,
    /// False when rose-updater.exe wasn't found and trose.exe was spawned
    /// directly instead. Callers use this to decide whether it's safe to
    /// attempt "launch behind" window positioning - that logic matches the
    /// spawned child's PID to a window, which only holds when the child we
    /// spawned *is* trose.exe. Whether rose-updater.exe keeps the same PID
    /// when it hands off to trose.exe, or spawns it as a distinct child
    /// process, isn't verified - so "launch behind" is skipped whenever the
    /// updater path is used, rather than guessing.
    pub via_updater: bool,
}

pub fn find_updater(game_folder: &Path) -> Option<std::path::PathBuf> {
    let path = game_folder.join(UPDATER_EXE);
    path.exists().then_some(path)
}

/// Launches the client, updating it first if rose-updater.exe is present.
/// `client_args` are the args trose.exe itself should receive (e.g.
/// `--login --server ... --username ... --password ...`, or empty for a
/// plain launch with no saved profile).
pub fn launch(
    app: &AppHandle,
    game_folder: &Path,
    client_args: &[String],
) -> AppResult<LaunchOutcome> {
    let trose_path = game_folder.join(TROSE_EXE);
    if !trose_path.exists() {
        return Err(AppError::GameExecutableNotFound);
    }

    if let Some(updater_path) = find_updater(game_folder) {
        let mut args: Vec<String> = vec![
            "--url".to_string(),
            DEFAULT_UPDATE_URL.to_string(),
            trose_path.to_string_lossy().to_string(),
        ];
        if !client_args.is_empty() {
            args.push("--".to_string());
            args.extend(client_args.iter().cloned());
        }
        let (rx, child) = app
            .shell()
            .command(updater_path.to_string_lossy().to_string())
            .current_dir(game_folder)
            .args(args)
            .spawn()
            .map_err(|e| AppError::Internal(format!("failed to launch rose-updater.exe: {e}")))?;
        Ok(LaunchOutcome {
            rx,
            child,
            via_updater: true,
        })
    } else {
        let (rx, child) = app
            .shell()
            .command(trose_path.to_string_lossy().to_string())
            .current_dir(game_folder)
            .args(client_args)
            .spawn()
            .map_err(|e| AppError::Internal(format!("failed to launch trose.exe: {e}")))?;
        Ok(LaunchOutcome {
            rx,
            child,
            via_updater: false,
        })
    }
}

/// Runs rose-updater with no launch target - the "Verify File Integrity" /
/// "Force Recheck" action: check and update game files without starting the
/// client. Errors if rose-updater.exe isn't present; there's no direct
/// fallback for a "verify" action without it.
pub fn force_recheck(app: &AppHandle, game_folder: &Path) -> AppResult<LaunchOutcome> {
    let updater_path = find_updater(game_folder).ok_or(AppError::UpdaterNotFound)?;
    let (rx, child) = app
        .shell()
        .command(updater_path.to_string_lossy().to_string())
        .current_dir(game_folder)
        .args(["--url", DEFAULT_UPDATE_URL, "--force-recheck"])
        .spawn()
        .map_err(|e| AppError::Internal(format!("failed to run rose-updater.exe: {e}")))?;
    Ok(LaunchOutcome {
        rx,
        child,
        via_updater: true,
    })
}
