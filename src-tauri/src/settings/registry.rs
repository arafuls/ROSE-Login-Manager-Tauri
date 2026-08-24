//! Windows Registry lookup for the ROSE Online install folder.
//!
//! The old WPF app (`GlobalVariables.InstallLocationFromRegistry`) only checked
//! `HKEY_LOCAL_MACHINE`. That's a bug: a per-user install of the game (no admin
//! rights, installer writes to `HKEY_CURRENT_USER` instead) would silently fail to
//! auto-detect, leaving `RoseGameFolder` empty with no explanation. This version
//! checks both hives, preferring `HKLM` (matching prior behavior) and falling back
//! to `HKCU`.

const UNINSTALL_SUBKEY: &str =
    r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{975CAD98-4A32-4E44-8681-29A2C4BE0B93}_is1";
const VALUE_NAME: &str = "InstallLocation";

#[cfg(windows)]
pub fn find_game_folder() -> Option<String> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;

    for hive in [HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER] {
        let root = RegKey::predef(hive);
        if let Ok(key) = root.open_subkey(UNINSTALL_SUBKEY) {
            if let Ok(value) = key.get_value::<String, _>(VALUE_NAME) {
                if !value.trim().is_empty() {
                    return Some(value);
                }
            }
        }
    }
    None
}

#[cfg(not(windows))]
pub fn find_game_folder() -> Option<String> {
    // The game and this launcher are Windows-only; on any other target (e.g. running
    // `cargo check` on a non-Windows dev machine / CI) there's no registry to query.
    None
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn does_not_panic_when_key_is_absent() {
        // We can't assert a specific value (depends on whether ROSE is actually
        // installed on the machine running the test), just that this doesn't panic
        // and returns a sane type.
        let _ = find_game_folder();
    }
}
