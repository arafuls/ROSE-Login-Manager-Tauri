//! Wine-aware launch support for non-Windows platforms. `trose.exe` is a
//! Windows binary; on Linux/macOS it has to run through Wine, since ROSE
//! Online's official native Linux/macOS client is still an invite-only
//! closed beta with no public build, install layout, or documented launch
//! mechanism to target (confirmed directly from the announcement:
//! https://forum.roseonlinegame.com/topic/7626-patch-notes-2026-03-31-macos-linux-closed-beta/).
//! Wine is broadly available across mainstream x86_64 desktop distros
//! (Ubuntu/Debian/Fedora/Arch all package it), so it's the practical
//! option today.
//!
//! Deliberately not attempting to auto-detect a Wine-prefixed game install,
//! since prefixes vary too much across plain Wine, Lutris, Bottles,
//! PlayOnLinux, and custom `WINEPREFIX` setups to guess reliably. Manual
//! Browse/path entry in Settings already works via the OS-native folder
//! picker.

use std::path::Path;

use tauri::AppHandle;
use tauri_plugin_shell::process::Command as ShellCommand;
use tauri_plugin_shell::ShellExt;

use crate::error::AppResult;
#[cfg(not(windows))]
use crate::error::AppError;

/// Builds the command to launch `exe_path` - direct on Windows (unchanged
/// behavior), wrapped in `wine` everywhere else. Errors with
/// `AppError::WineNotFound` up front on a non-Windows platform without
/// Wine on `PATH`, rather than letting a raw spawn failure surface as a
/// confusing generic error later.
pub fn build_launch_command(app: &AppHandle, exe_path: &Path) -> AppResult<ShellCommand> {
    #[cfg(windows)]
    {
        Ok(app.shell().command(exe_path.to_string_lossy().to_string()))
    }

    #[cfg(not(windows))]
    {
        if !is_available() {
            return Err(AppError::WineNotFound);
        }
        Ok(app
            .shell()
            .command("wine")
            .arg(exe_path.to_string_lossy().to_string()))
    }
}

/// Checked up front via a synchronous `wine --version` rather than
/// inferring it from a failed spawn's error text afterward - a plain
/// "command not found" string isn't reliable to parse across platforms,
/// and this gives an immediate, deterministic answer before anything else
/// is attempted.
#[cfg(not(windows))]
fn is_available() -> bool {
    std::process::Command::new("wine")
        .arg("--version")
        .output()
        .is_ok()
}
