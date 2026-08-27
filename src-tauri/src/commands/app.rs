//! App-level commands not tied to vault/profiles/settings/theme.

/// True if the exe isn't running from NSIS's `currentUser` install dir
/// (`%LOCALAPPDATA%\{ProductName}`, this app's default) - meaning an
/// in-app update would install a new copy there instead of replacing this
/// file. Best-effort, not a guarantee (e.g. dev builds always read as
/// portable).
#[cfg(windows)]
#[tauri::command]
pub fn app_is_portable_install(app: tauri::AppHandle) -> bool {
    let Ok(exe) = std::env::current_exe() else {
        return false;
    };
    let Some(exe_dir) = exe.parent() else {
        return false;
    };
    let Some(local_data) = dirs::data_local_dir() else {
        return false;
    };
    let expected_dir = local_data.join(&app.package_info().name);

    match (exe_dir.canonicalize(), expected_dir.canonicalize()) {
        (Ok(a), Ok(b)) => a != b,
        _ => true,
    }
}

/// No install-path convention to compare against off Windows - always
/// "not portable" so no warning shows there.
#[cfg(not(windows))]
#[tauri::command]
pub fn app_is_portable_install(_app: tauri::AppHandle) -> bool {
    false
}
