//! DTOs shared between the db/crypto layers and the `#[tauri::command]` boundary.
//!
//! These mirror `docs/command-contract.md`'s TypeScript types field-for-field via
//! `#[serde(rename_all = "camelCase")]`, since that file is the source of truth for
//! both this Rust backend and the frontend built against it in parallel.

use serde::{Deserialize, Deserializer, Serialize};

/// Returned once by `vault_setup` - the recovery key is never stored in
/// retrievable form (only wrapped-DEK ciphertext derived from it), so this
/// is the only moment the app can ever show it to the user.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultSetupResult {
    pub recovery_key: String,
}

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

/// One entry from `news_fetch`. Sourced from the news API
/// (roseonlinegame.com/api/v1/news), not the HTML listing page it
/// replaced - the API is versioned and structured (a real `category`
/// object, a direct thumbnail URL, an ISO 8601 timestamp) instead of
/// requiring CSS-selector scraping that silently breaks if the page's
/// markup changes. `published` is reformatted from the API's ISO 8601
/// `published_at` into "May 31, 2026" style text server-side, so the
/// frontend can display it as-is.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NewsItem {
    pub title: String,
    pub link: String,
    pub published: String,
    pub excerpt: String,
    /// e.g. "Maintenance", "Development", "News" - whatever text the site
    /// puts in the badge. Not a closed enum on purpose: the site controls
    /// this vocabulary, not us, and a new category value should degrade
    /// to a plain label instead of failing to deserialize.
    pub category: String,
    /// `None` if a post genuinely has no thumbnail - handled explicitly
    /// on the frontend rather than falling back to an empty string.
    pub thumbnail: Option<String>,
}
