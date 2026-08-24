//! Launch support for ROSE Online's native Linux client (as distinct from
//! the Windows build launched directly on Windows or through Wine
//! elsewhere - see `wine.rs`). Ships as `trose` (no extension) alongside
//! `crashpad_handler` and a handful of bundled `.so` files, both non-
//! executable by default - confirmed directly from an actual install, not
//! assumed. Opted into explicitly via `Settings > Game folder`
//! (`LinuxLaunchMode::Native`), never autodetected - see
//! `models::LinuxLaunchMode`'s doc comment for why.
//!
//! Deliberately not attempting to replicate this build's own update/sync
//! protocol (`rose.vfs`/`data.idx`, a completely different packaging format
//! from the Windows manifest+chunked-diff system `rose_update` vendors) -
//! callers skip file sync entirely in this mode and rely on the user having
//! already run the official `rose-updater` themselves, exactly as the game
//! devs' own install instructions describe.

use std::path::Path;

use tauri::AppHandle;
use tauri_plugin_shell::process::Command as ShellCommand;
use tauri_plugin_shell::ShellExt;

use crate::error::AppResult;

pub fn build_launch_command(app: &AppHandle, exe_path: &Path) -> AppResult<ShellCommand> {
    ensure_executable(exe_path)?;

    // Best-effort, non-fatal - matches the devs' own documented workaround
    // ("chmod +x crashpad_handler" if the game won't start) without making
    // a missing/already-fine sidecar a hard error.
    if let Some(dir) = exe_path.parent() {
        let _ = ensure_executable(&dir.join("crashpad_handler"));
    }

    let mut cmd = app.shell().command(exe_path.to_string_lossy().to_string());
    if let Some(dir) = exe_path.parent() {
        // Defensive: covers the bundled .so files (libfmod, libsteam_api,
        // libdiscord_game_sdk) if trose wasn't linked with RPATH=$ORIGIN.
        cmd = cmd.env("LD_LIBRARY_PATH", dir.to_string_lossy().to_string());
    }
    Ok(cmd)
}

fn ensure_executable(path: &Path) -> AppResult<()> {
    use std::os::unix::fs::PermissionsExt;

    let mut perms = std::fs::metadata(path)?.permissions();
    perms.set_mode(perms.mode() | 0o111); // add execute, preserve existing read/write bits
    std::fs::set_permissions(path, perms)?;
    Ok(())
}
