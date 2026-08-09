/**
 * Settings API layer - see docs/command-contract.md, "Settings" section.
 *
 * Same shape as the other feature api.ts modules: each export matches a
 * real command 1:1 and today just talks to an in-memory (localStorage
 * backed) mock. Swapping to the real backend is a one-line change per
 * function, e.g.:
 *
 *   export async function settingsGet(): Promise<Settings> {
 *     return invoke("settings_get");
 *   }
 */
import { mockDelay, readMockState, writeMockState } from "@/lib/mock-storage";
import type { Settings, SettingsPatch } from "./types";

const STORAGE_KEY = "settings";

const DEFAULT_SETTINGS: Settings = {
  roseGameFolder: null,
  displayEmail: true,
  maskEmail: false,
  launchClientBehind: false,
  skipPlanetCutscene: false,
  loginScreen: "Random",
  toggleCharDataScanning: false,
};

function loadSettings(): Settings {
  return readMockState<Settings>(STORAGE_KEY, DEFAULT_SETTINGS);
}

function saveSettings(settings: Settings): void {
  writeMockState(STORAGE_KEY, settings);
}

export async function settingsGet(): Promise<Settings> {
  await mockDelay();
  return loadSettings();
}

type Listener = (settings: Settings) => void;
const listeners = new Set<Listener>();

/**
 * Not part of the command contract (there's no `settings-changed` event
 * listed today, unlike `profiles-changed`). Added so the settings page and
 * the profile list can both stay in sync with `displayEmail` / `maskEmail`
 * without a full page navigation. If the backend later adds a real
 * `settings-changed` event, swap this for `listen("settings-changed", cb)`
 * at the one call site in `use-settings.ts`.
 */
export function onSettingsChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function settingsUpdate(patch: SettingsPatch): Promise<Settings> {
  await mockDelay();
  const next = { ...loadSettings(), ...patch };
  saveSettings(next);
  for (const listener of listeners) {
    listener(next);
  }
  return next;
}

/**
 * Registry lookup (HKLM + HKCU) for the ROSE Online install folder. The old
 * app only checked HKLM, which is one of the silent-failure bugs called out
 * in the contract - here a `null` result is always surfaced to the UI
 * (toast), never swallowed.
 */
export async function settingsFindGameFolder(): Promise<string | null> {
  await mockDelay(400);
  return "C:\\Program Files (x86)\\Rednim Games\\ROSE Online";
}

/**
 * DEVIATION from the contract: there is no `settings_browse_game_folder`
 * command because a native folder picker is a Tauri plugin call
 * (`@tauri-apps/plugin-dialog`'s `open({ directory: true })`), not an
 * app-defined command - it never touches Rust business logic, so it isn't
 * listed in command-contract.md. It's mocked here (instead of importing the
 * real plugin) because plugin-dialog isn't registered on the Rust side yet
 * and, more importantly, has no native window to show in a plain browser
 * `bun run dev` preview anyway. Swap the body for the real plugin call once
 * the desktop shell is available.
 */
export async function settingsBrowseGameFolder(): Promise<string | null> {
  await mockDelay(200);
  // biome-ignore lint/suspicious/noAlert: temporary stand-in for a native folder dialog in the browser-only mock, see comment above.
  const picked = globalThis.prompt(
    "Mock folder picker (real app opens a native dialog):",
    "C:\\Program Files (x86)\\Rednim Games\\ROSE Online"
  );
  return picked && picked.trim().length > 0 ? picked.trim() : null;
}
