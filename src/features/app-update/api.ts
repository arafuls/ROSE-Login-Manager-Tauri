/** Thin wrappers over Tauri's app/updater plugins for this app's own update flow. */

import { getVersion } from "@tauri-apps/api/app";
import { check, type Update } from "@tauri-apps/plugin-updater";

/** The running app's own version, for display in Settings. */
export function appGetVersion(): Promise<string> {
  return getVersion();
}

/** Resolves to `null` when already on the latest version. */
export function appCheckForUpdate(): Promise<Update | null> {
  return check();
}
