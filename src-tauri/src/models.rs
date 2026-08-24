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

/// How to launch the game client on non-Windows platforms. `trose.exe` (the
/// Windows build) needs Wine (see `crate::wine`); ROSE Online's newer native
/// Linux client (see `crate::native_launch`) ships its own `trose` binary
/// with a completely different asset packaging format, so this is an
/// explicit user choice, not autodetected - manually opted into per
/// `Settings > Game folder`, defaulting to `Wine` so existing installs are
/// unaffected. Irrelevant on Windows, which always launches `trose.exe`
/// directly regardless of this setting.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum LinuxLaunchMode {
    Wine,
    Native,
}

impl Default for LinuxLaunchMode {
    fn default() -> Self {
        LinuxLaunchMode::Wine
    }
}

/// Sidebar vs. the original top toolbar - a persisted user preference, not a
/// one-way migration. `Default` = `Sidebar`, matching current shipped
/// behavior so existing installs see no change.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum NavStyle {
    Sidebar,
    Topbar,
}

impl Default for NavStyle {
    fn default() -> Self {
        NavStyle::Sidebar
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
    #[serde(default)]
    pub linux_launch_mode: LinuxLaunchMode,
    #[serde(default)]
    pub nav_style: NavStyle,
    /// `Theme.id` of the currently active theme - always a real id, never
    /// null/absent, because `"rose-default"` (see `crate::theme`) is itself
    /// a valid id for the built-in palette. Keeping this non-nullable means
    /// the patch field below is a plain `Option<String>` like every other
    /// scalar setting, with none of `rose_game_folder`'s `double_option`
    /// machinery needed to represent "explicitly reset."
    ///
    /// `#[serde(default)]` matters here beyond the "file doesn't exist yet"
    /// case that `Settings::default()` covers: an existing `settings.toml`
    /// written before this field existed has every *other* field but this
    /// one - without a per-field default, deserializing it fails outright
    /// (`settings_get` errors, and every caller of `useSettings()` -
    /// including `profile-list.tsx`, which gates its whole list render on
    /// `settings` being non-null - gets stuck with `loading`/`settings`
    /// never resolving).
    #[serde(default = "default_active_theme_id")]
    pub active_theme_id: String,
}

fn default_active_theme_id() -> String {
    crate::theme::ROSE_DEFAULT_THEME_ID.to_string()
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
            linux_launch_mode: LinuxLaunchMode::Wine,
            nav_style: NavStyle::Sidebar,
            active_theme_id: crate::theme::ROSE_DEFAULT_THEME_ID.to_string(),
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
    pub linux_launch_mode: Option<LinuxLaunchMode>,
    #[serde(default)]
    pub nav_style: Option<NavStyle>,
    #[serde(default)]
    pub active_theme_id: Option<String>,
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

/// Every themeable color token, deliberately excluding `--radius` and the
/// font variables (out of scope - this is a color theme editor, not a full
/// design-system editor) and the `--chart-*`/`--sidebar-*` tokens (confirmed
/// dead: referenced nowhere outside `global.css` itself). Values are raw CSS
/// color strings (hex, `oklch()`, etc.), stored and passed through opaquely -
/// Rust never parses or validates them, that happens client-side via
/// `CSS.supports('color', value)` before a save/import is ever sent here.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeColors {
    pub background: String,
    pub foreground: String,
    pub card: String,
    pub card_foreground: String,
    pub popover: String,
    pub popover_foreground: String,
    pub primary: String,
    pub primary_foreground: String,
    pub secondary: String,
    pub secondary_foreground: String,
    pub muted: String,
    pub muted_foreground: String,
    pub accent: String,
    pub accent_foreground: String,
    pub destructive: String,
    pub border: String,
    pub input: String,
    pub ring: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Theme {
    pub id: String,
    pub name: String,
    pub colors: ThemeColors,
    /// True only for the synthesized `"rose-default"` entry - never
    /// persisted in `themes.json`, never true for a user-created theme.
    /// Lets the frontend disable Edit/Delete without hardcoding the
    /// reserved id string.
    pub built_in: bool,
}

/// `theme_save`'s payload: `id: None` creates a new theme, `id: Some(id)`
/// updates an existing one in place.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeInput {
    #[serde(default)]
    pub id: Option<String>,
    pub name: String,
    pub colors: ThemeColors,
}

/// The export/import file shape - deliberately just `name` + `colors`, with
/// no `id`/`builtIn`, so importing a file always mints a fresh local id
/// rather than trusting (and potentially colliding with) one from outside.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemePortable {
    pub name: String,
    pub colors: ThemeColors,
}
