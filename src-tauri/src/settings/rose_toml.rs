//! Reads/writes the ROSE Online game client's own config file, `rose.toml`.
//!
//! This is a *different* file from our own `settings.toml`: it lives under the
//! game's Rednim Games AppData folder (`%APPDATA%\Rednim Games\ROSE Online\config\
//! rose.toml`), independent of where the game is installed, and independent of our
//! app's data directory - the old app located it the same way, as a sibling of its
//! own AppData folder (`ROSE Login Manager/Model/GlobalVariables.cs::GetTomlValue`).
//!
//! Two of our settings are mirrored into it so the game client picks them up:
//! `skip_planet_cutscene` (`[game] skip_planet_cutscene`, a bool) and `login_screen`
//! (`[game] title_map_id`, an int - see `LoginScreen::title_map_id`).

use std::fs;
use std::path::PathBuf;

use crate::error::{AppError, AppResult};
use crate::models::LoginScreen;

/// Resolves the path to the game's `rose.toml`, or `None` if we can't determine the
/// user's roaming AppData folder at all (should not happen on a real Windows install).
pub fn rose_toml_path() -> Option<PathBuf> {
    let appdata = dirs::config_dir()?; // %APPDATA% on Windows
    Some(
        appdata
            .join("Rednim Games")
            .join("ROSE Online")
            .join("config")
            .join("rose.toml"),
    )
}

/// Best-effort sync of game-affecting settings into the game client's own config
/// file. This is intentionally tolerant of the file not existing yet (the game may
/// never have been launched) - that is not an error condition for our settings
/// update, just a no-op for this part of it.
pub fn apply_game_settings(
    skip_planet_cutscene: Option<bool>,
    login_screen: Option<LoginScreen>,
) -> AppResult<()> {
    if skip_planet_cutscene.is_none() && login_screen.is_none() {
        return Ok(());
    }

    let Some(path) = rose_toml_path() else {
        return Ok(());
    };
    if !path.exists() {
        return Ok(());
    }

    let contents = fs::read_to_string(&path)?;
    let mut doc: toml::Value = toml::from_str(&contents)?;

    let root = doc
        .as_table_mut()
        .ok_or_else(|| AppError::Internal("rose.toml root is not a TOML table".into()))?;
    let game = root
        .entry("game".to_string())
        .or_insert_with(|| toml::Value::Table(Default::default()));
    let game_table = game
        .as_table_mut()
        .ok_or_else(|| AppError::Internal("rose.toml [game] is not a TOML table".into()))?;

    if let Some(skip) = skip_planet_cutscene {
        game_table.insert(
            "skip_planet_cutscene".to_string(),
            toml::Value::Boolean(skip),
        );
    }
    if let Some(screen) = login_screen {
        game_table.insert(
            "title_map_id".to_string(),
            toml::Value::Integer(screen.title_map_id()),
        );
    }

    fs::write(&path, toml::to_string(&doc)?)?;
    Ok(())
}
