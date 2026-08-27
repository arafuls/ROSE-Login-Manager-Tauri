/** Thin wrappers over Tauri's app/updater plugins for this app's own update flow. */

import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { check, type Update } from "@tauri-apps/plugin-updater";

/** The running app's own version, for display in Settings. */
export function appGetVersion(): Promise<string> {
  return getVersion();
}

/** Resolves to `null` when already on the latest version. */
export function appCheckForUpdate(): Promise<Update | null> {
  return check();
}

/** Whether the running exe is outside this app's expected install location (see the Rust command's doc comment). */
export function appIsPortableInstall(): Promise<boolean> {
  return invoke("app_is_portable_install");
}
