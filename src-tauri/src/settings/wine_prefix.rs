//! Bounded Wine-prefix introspection for the two things the settings screen
//! needs on non-Windows platforms: the ROSE Online install folder
//! (`find_game_folder`, `registry::find_game_folder`'s counterpart) and the
//! game client's own `AppData\Roaming` (`appdata_roaming_dir`,
//! `rose_toml::rose_toml_path`'s counterpart). There's no registry-equivalent
//! authoritative source on this platform - both are just files inside a
//! prefix's `drive_c`, and prefix location varies by tool (plain Wine,
//! Lutris, Bottles, PlayOnLinux, custom `WINEPREFIX`). Deliberately not
//! attempting an exhaustive search (see `wine.rs`'s own doc comment for the
//! same call on the launch side) - this checks `$WINEPREFIX` and the
//! default `~/.wine` prefix only. A miss isn't a bug; Browse already covers
//! the game-folder case, and rose.toml sync is already best-effort even on
//! Windows (silently skipped if the game's never been launched).

use std::path::PathBuf;
use std::{env, fs};

const RELATIVE_CANDIDATES: [&str; 2] = [
    "Program Files/ROSE Online",
    "Program Files (x86)/ROSE Online",
];

fn candidate_prefixes() -> Vec<PathBuf> {
    let mut prefixes = Vec::new();
    if let Ok(wineprefix) = env::var("WINEPREFIX") {
        prefixes.push(PathBuf::from(wineprefix));
    }
    if let Some(home) = dirs::home_dir() {
        prefixes.push(home.join(".wine"));
    }
    prefixes
}

pub fn find_game_folder() -> Option<String> {
    candidate_prefixes().into_iter().find_map(|prefix| {
        let drive_c = prefix.join("drive_c");
        RELATIVE_CANDIDATES
            .iter()
            .map(|relative| drive_c.join(relative))
            .find(|candidate| candidate.join("trose.exe").is_file())
            .map(|candidate| candidate.to_string_lossy().to_string())
    })
}

/// Resolves `<prefix>/drive_c/users/<wine-user>/AppData/Roaming` for
/// whichever Wine prefix has one. The "Windows user" Wine emulates is named
/// after the real Unix username by default, so `$USER` is tried first;
/// falling back to the one non-`Public` folder under `drive_c/users` (Wine
/// always creates a `Public` folder alongside the real user's) covers the
/// case where `$USER` isn't set in the process environment.
pub fn appdata_roaming_dir() -> Option<PathBuf> {
    candidate_prefixes().into_iter().find_map(|prefix| {
        let users_dir = prefix.join("drive_c").join("users");

        let user_folder = env::var("USER")
            .ok()
            .map(|user| users_dir.join(user))
            .filter(|path| path.is_dir())
            .or_else(|| {
                fs::read_dir(&users_dir)
                    .ok()?
                    .filter_map(|entry| entry.ok())
                    .map(|entry| entry.path())
                    .find(|path| {
                        path.is_dir()
                            && path.file_name().and_then(|name| name.to_str()) != Some("Public")
                    })
            })?;

        let appdata = user_folder.join("AppData").join("Roaming");
        appdata.is_dir().then_some(appdata)
    })
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;

    #[test]
    fn finds_the_install_and_appdata_dir_under_wineprefix_and_returns_none_when_absent() {
        let temp = std::env::temp_dir().join(format!(
            "rose-wine-prefix-test-{}",
            std::process::id()
        ));
        let install_dir = temp.join("drive_c").join("Program Files").join("ROSE Online");
        fs::create_dir_all(&install_dir).unwrap();
        fs::write(install_dir.join("trose.exe"), b"").unwrap();

        // Wine always creates a "Public" folder alongside the real user's -
        // included here to exercise the fallback scan's exclusion of it,
        // without depending on the test process's actual $USER value.
        let users_dir = temp.join("drive_c").join("users");
        fs::create_dir_all(users_dir.join("Public")).unwrap();
        let appdata_dir = users_dir.join("linuxuser").join("AppData").join("Roaming");
        fs::create_dir_all(&appdata_dir).unwrap();

        // SAFETY: this test is the only one in the crate that reads or
        // writes WINEPREFIX, so there's no cross-test race on the value.
        unsafe {
            env::set_var("WINEPREFIX", &temp);
        }
        let found_game_folder = find_game_folder();
        let found_appdata_dir = appdata_roaming_dir();
        unsafe {
            env::remove_var("WINEPREFIX");
        }
        fs::remove_dir_all(&temp).unwrap();

        assert_eq!(
            found_game_folder.as_deref(),
            Some(install_dir.to_str().unwrap())
        );
        assert_eq!(found_appdata_dir, Some(appdata_dir));

        // No prefix set, and the default ~/.wine (if it even exists on the
        // test runner) won't contain this made-up install - can't assert
        // None unconditionally without risking a false failure on a
        // machine that happens to have a real ROSE install under ~/.wine,
        // so this only checks the WINEPREFIX-set-but-empty case.
        let empty_temp = std::env::temp_dir().join(format!(
            "rose-wine-prefix-test-empty-{}",
            std::process::id()
        ));
        fs::create_dir_all(&empty_temp).unwrap();
        unsafe {
            env::set_var("WINEPREFIX", &empty_temp);
        }
        let not_found_game_folder = find_game_folder();
        let not_found_appdata_dir = appdata_roaming_dir();
        unsafe {
            env::remove_var("WINEPREFIX");
        }
        fs::remove_dir_all(&empty_temp).unwrap();

        assert_eq!(not_found_game_folder, None);
        assert_eq!(not_found_appdata_dir, None);
    }
}
