//! App settings persistence (`settings.toml` in the app data dir), plus the two
//! pieces of Windows-specific integration the settings screen needs: writing the
//! game's own `rose.toml` config, and looking up the game's install folder from the
//! registry.

pub mod registry;
pub mod rose_toml;
#[cfg(not(windows))]
mod wine_prefix;

use std::fs;
use std::path::Path;

use crate::error::AppResult;
use crate::models::{Settings, SettingsPatch};

const SETTINGS_FILENAME: &str = "settings.toml";

fn settings_file_path(app_data_dir: &Path) -> std::path::PathBuf {
    app_data_dir.join(SETTINGS_FILENAME)
}

/// Loads settings from disk, creating the file with defaults (and a best-effort
/// registry auto-detect of the game folder, mirroring the old app's
/// `ConfigurationManager.HandleRoseInstallLocation`) if it doesn't exist yet.
pub fn load(app_data_dir: &Path) -> AppResult<Settings> {
    let path = settings_file_path(app_data_dir);

    if !path.exists() {
        let mut defaults = Settings::default();
        if let Some(folder) = registry::find_game_folder() {
            defaults.rose_game_folder = Some(folder);
        }
        save(app_data_dir, &defaults)?;
        return Ok(defaults);
    }

    let contents = fs::read_to_string(&path)?;
    let settings: Settings = toml::from_str(&contents)?;
    Ok(settings)
}

pub fn save(app_data_dir: &Path, settings: &Settings) -> AppResult<()> {
    fs::create_dir_all(app_data_dir)?;
    let contents = toml::to_string_pretty(settings)?;
    fs::write(settings_file_path(app_data_dir), contents)?;
    Ok(())
}

/// Applies a `Partial<Settings>` patch on top of the current settings, returning the
/// merged result. Does not persist it - callers save separately.
pub fn apply_patch(current: &Settings, patch: &SettingsPatch) -> Settings {
    let mut next = current.clone();

    if let Some(folder) = &patch.rose_game_folder {
        next.rose_game_folder = folder.clone();
    }
    if let Some(v) = patch.display_email {
        next.display_email = v;
    }
    if let Some(v) = patch.mask_email {
        next.mask_email = v;
    }
    if let Some(v) = patch.launch_client_behind {
        next.launch_client_behind = v;
    }
    if let Some(v) = patch.skip_planet_cutscene {
        next.skip_planet_cutscene = v;
    }
    if let Some(v) = patch.login_screen {
        next.login_screen = v;
    }
    if let Some(v) = patch.linux_launch_mode {
        next.linux_launch_mode = v;
    }
    if let Some(v) = patch.nav_style {
        next.nav_style = v;
    }
    if let Some(v) = &patch.active_theme_id {
        next.active_theme_id = v.clone();
    }

    next
}
