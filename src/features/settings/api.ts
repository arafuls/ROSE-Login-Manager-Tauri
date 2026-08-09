/**
 * Settings API layer - see docs/command-contract.md, "Settings" section.
 * Wired to the real Tauri commands; see git history for the mock this
 * replaced if you need the earlier in-memory version for reference.
 */
import { invoke } from "@tauri-apps/api/core";
import type { Settings, SettingsPatch } from "./types";

export function settingsGet(): Promise<Settings> {
  return invoke("settings_get");
}

type Listener = (settings: Settings) => void;
const listeners = new Set<Listener>();

/**
 * NOT a real Tauri event - there is no `settings-changed` command/event in
 * the contract (unlike `profiles-changed`), and it doesn't need one: every
 * consumer of settings lives in this same webview/JS runtime (the settings
 * page and the profile list, which reads displayEmail/maskEmail), so a
 * plain in-process pub-sub is sufficient. `settingsUpdate` below notifies it
 * after a successful real invoke() call.
 */
export function onSettingsChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function settingsUpdate(patch: SettingsPatch): Promise<Settings> {
  const next = await invoke<Settings>("settings_update", { patch });
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
export function settingsFindGameFolder(): Promise<string | null> {
  return invoke("settings_find_game_folder");
}

/**
 * DEVIATION from the contract, unchanged from the mock: there is no
 * `settings_browse_game_folder` command because a native folder picker is a
 * Tauri *plugin* call (`@tauri-apps/plugin-dialog`'s `open({ directory: true
 * })`), not an app-defined command - it never touches Rust business logic.
 * `@tauri-apps/plugin-dialog` isn't registered on the Rust side yet (it's
 * new scope beyond wiring the existing Phase 1 contract), so this still
 * prompts rather than showing a native dialog. Swap this body for the real
 * plugin call when that's added.
 */
export function settingsBrowseGameFolder(): Promise<string | null> {
  // biome-ignore lint/suspicious/noAlert: temporary stand-in for a native folder dialog until plugin-dialog is wired up, see comment above.
  const picked = globalThis.prompt(
    "Folder picker not wired up yet - paste the ROSE Online install path:",
    ""
  );
  return Promise.resolve(
    picked && picked.trim().length > 0 ? picked.trim() : null
  );
}
