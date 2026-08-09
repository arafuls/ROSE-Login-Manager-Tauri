//! `settings_*` commands.

use tauri::State;

use crate::error::AppResult;
use crate::models::{Settings, SettingsPatch};
use crate::settings::{self, registry, rose_toml};
use crate::state::AppState;

#[tauri::command]
pub fn settings_get(state: State<AppState>) -> AppResult<Settings> {
    settings::load(&state.app_data_dir)
}

#[tauri::command]
pub fn settings_update(patch: SettingsPatch, state: State<AppState>) -> AppResult<Settings> {
    let current = settings::load(&state.app_data_dir)?;
    let next = settings::apply_patch(&current, &patch);
    settings::save(&state.app_data_dir, &next)?;

    // Best-effort mirror into the game client's own rose.toml. This is not allowed to
    // fail settings_update as a whole: our settings.toml write already succeeded, and
    // rose.toml may legitimately not exist yet (game never launched).
    if let Err(err) =
        rose_toml::apply_game_settings(patch.skip_planet_cutscene, patch.login_screen)
    {
        eprintln!("warning: failed to sync settings into rose.toml: {err}");
    }

    Ok(next)
}

#[tauri::command]
pub fn settings_find_game_folder() -> Option<String> {
    registry::find_game_folder()
}
