/** Mirrors the `Settings` type in docs/command-contract.md exactly. */

export const LOGIN_SCREEN_OPTIONS = [
  "Random",
  "Treehouse",
  "Adventure Plains",
  "Junon Polis",
] as const;

export type LoginScreen = (typeof LOGIN_SCREEN_OPTIONS)[number];

/**
 * How to launch the game client on non-Windows platforms - "Wine" runs the
 * Windows trose.exe build through Wine (see src-tauri/src/wine.rs);
 * "Native" launches ROSE Online's own native Linux client directly (see
 * src-tauri/src/native_launch.rs). Irrelevant on Windows, which always
 * launches trose.exe directly regardless of this setting.
 */
export const LINUX_LAUNCH_MODE_OPTIONS = ["Wine", "Native"] as const;

export type LinuxLaunchMode = (typeof LINUX_LAUNCH_MODE_OPTIONS)[number];

/** Sidebar vs. the original top toolbar - a persisted user preference. */
export const NAV_STYLE_OPTIONS = ["Sidebar", "Topbar"] as const;

export type NavStyle = (typeof NAV_STYLE_OPTIONS)[number];

/** The full persisted app settings shape, as returned by `settingsGet`. */
export interface Settings {
  activeThemeId: string;
  displayEmail: boolean;
  launchClientBehind: boolean;
  linuxLaunchMode: LinuxLaunchMode;
  loginScreen: LoginScreen;
  maskEmail: boolean;
  navStyle: NavStyle;
  roseGameFolder: string | null;
  showNewsPanel: boolean;
  skipPlanetCutscene: boolean;
}

export type SettingsPatch = Partial<Settings>;
