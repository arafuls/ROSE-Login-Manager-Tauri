//! `theme_*` commands. None require the vault to be unlocked - themes,
//! like settings, aren't vault-gated (they need to apply on the lock
//! screen too).

use tauri::State;

use crate::error::AppResult;
use crate::models::{Theme, ThemeInput, ThemePortable};
use crate::settings;
use crate::state::AppState;
use crate::theme;

/// Lists every built-in palette followed by every saved custom theme.
#[tauri::command]
pub fn theme_list(state: State<AppState>) -> AppResult<Vec<Theme>> {
    theme::list(&state.app_data_dir)
}

/// Creates a new theme (`input.id: None`) or updates an existing one in place.
#[tauri::command]
pub fn theme_save(input: ThemeInput, state: State<AppState>) -> AppResult<Theme> {
    theme::upsert(&state.app_data_dir, input)
}

/// If the deleted theme was the active one, resets `settings.toml` back to
/// the built-in rather than leaving `active_theme_id` pointing at nothing -
/// the frontend's theme-application effect also defensively falls back to
/// the built-in if the active id isn't found in the loaded list, but fixing
/// it at the source here means the two files don't silently disagree even
/// before the frontend's next read.
#[tauri::command]
pub fn theme_delete(id: String, state: State<AppState>) -> AppResult<()> {
    theme::delete(&state.app_data_dir, &id)?;

    let current = settings::load(&state.app_data_dir)?;
    if current.active_theme_id == id {
        let mut next = current;
        next.active_theme_id = theme::ROSE_DEFAULT_THEME_ID.to_string();
        settings::save(&state.app_data_dir, &next)?;
    }
    Ok(())
}

/// Writes a theme to disk in its portable (id-less) export shape.
#[tauri::command]
pub fn theme_export_to_file(id: String, path: String, state: State<AppState>) -> AppResult<()> {
    let found = theme::get(&state.app_data_dir, &id)?;
    let portable = ThemePortable {
        name: found.name,
        colors: found.colors,
    };
    let json = serde_json::to_string_pretty(&portable)?;
    std::fs::write(&path, json).map_err(Into::into)
}

/// Always mints a fresh id for the imported theme (see `ThemePortable`'s
/// doc comment) - an imported file is never trusted to carry a safe id of
/// its own.
#[tauri::command]
pub fn theme_import_from_file(path: String, state: State<AppState>) -> AppResult<Theme> {
    let contents = std::fs::read_to_string(&path)?;
    let portable: ThemePortable = serde_json::from_str(&contents)?;
    theme::upsert(
        &state.app_data_dir,
        ThemeInput {
            id: None,
            name: portable.name,
            colors: portable.colors,
        },
    )
}
