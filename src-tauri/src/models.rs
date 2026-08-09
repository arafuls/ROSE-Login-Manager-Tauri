//! DTOs shared between the db/crypto layers and the `#[tauri::command]` boundary.
//!
//! These mirror `docs/command-contract.md`'s TypeScript types field-for-field via
//! `#[serde(rename_all = "camelCase")]`, since that file is the source of truth for
//! both this Rust backend and the frontend built against it in parallel.

use serde::{Deserialize, Deserializer, Serialize};

/// A profile as seen by the frontend. Note the password is intentionally absent -
/// per the contract, "password never leaves Rust in plaintext. Frontend never sees it."
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub email: String,
    pub name: String,
    /// true = client currently running for this profile.
    pub status: bool,
    pub order: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewProfileInput {
    pub name: String,
    pub email: String,
    /// Plaintext in-memory only; sent once over invoke(), never logged.
    pub password: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProfileInput {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub email: Option<String>,
    /// Omit to leave the password unchanged.
    #[serde(default)]
    pub password: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum LoginScreen {
    Random,
    Treehouse,
    #[serde(rename = "Adventure Plains")]
    AdventurePlains,
    #[serde(rename = "Junon Polis")]
    JunonPolis,
}

impl Default for LoginScreen {
    fn default() -> Self {
        LoginScreen::Random
    }
}

impl LoginScreen {
    /// Maps to ROSE's `rose.toml` `[game] title_map_id`, per the old app's
    /// `SettingsViewModel.LoginScreenToInt`.
    pub fn title_map_id(self) -> i64 {
        match self {
            LoginScreen::Random => 0,
            LoginScreen::Treehouse => 4,
            LoginScreen::AdventurePlains => 7,
            LoginScreen::JunonPolis => 16,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub rose_game_folder: Option<String>,
    pub display_email: bool,
    pub mask_email: bool,
    pub launch_client_behind: bool,
    pub skip_planet_cutscene: bool,
    pub login_screen: LoginScreen,
    pub toggle_char_data_scanning: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            rose_game_folder: None,
            display_email: false,
            mask_email: false,
            launch_client_behind: false,
            skip_planet_cutscene: false,
            login_screen: LoginScreen::Random,
            toggle_char_data_scanning: false,
        }
    }
}

/// `Partial<Settings>` at the invoke() boundary: every field optional, missing fields
/// mean "leave unchanged".
/// Distinguishes "key absent" (`None`, leave unchanged) from "key present with value
/// `null`" (`Some(None)`, explicitly clear) for a nullable `Option<String>` field -
/// the classic serde "double option" problem. `#[serde(default, deserialize_with =
/// ...)]` only invokes this when the JSON key is actually present.
fn double_option<'de, D>(de: D) -> Result<Option<Option<String>>, D::Error>
where
    D: Deserializer<'de>,
{
    Option::<String>::deserialize(de).map(Some)
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPatch {
    /// `None` = not provided in the patch, leave unchanged. `Some(None)` = explicitly
    /// set to null (clear the configured game folder). `Some(Some(path))` = set.
    #[serde(default, deserialize_with = "double_option")]
    pub rose_game_folder: Option<Option<String>>,
    #[serde(default)]
    pub display_email: Option<bool>,
    #[serde(default)]
    pub mask_email: Option<bool>,
    #[serde(default)]
    pub launch_client_behind: Option<bool>,
    #[serde(default)]
    pub skip_planet_cutscene: Option<bool>,
    #[serde(default)]
    pub login_screen: Option<LoginScreen>,
    #[serde(default)]
    pub toggle_char_data_scanning: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportBundle {
    pub version: u8,
    /// base64, re-encrypted under the export password, not the vault key.
    pub ciphertext: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub imported: u32,
    pub skipped: Vec<String>,
}

/// The plaintext shape encrypted inside an [`ExportBundle`]'s ciphertext.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportedProfile {
    pub name: String,
    pub email: String,
    pub password: String,
}
