/** Mirrors the `Settings` type in docs/command-contract.md exactly. */

export const LOGIN_SCREEN_OPTIONS = [
  "Random",
  "Treehouse",
  "Adventure Plains",
  "Junon Polis",
] as const;

export type LoginScreen = (typeof LOGIN_SCREEN_OPTIONS)[number];

export interface Settings {
  displayEmail: boolean;
  launchClientBehind: boolean;
  loginScreen: LoginScreen;
  maskEmail: boolean;
  roseGameFolder: string | null;
  skipPlanetCutscene: boolean;
}

export type SettingsPatch = Partial<Settings>;
