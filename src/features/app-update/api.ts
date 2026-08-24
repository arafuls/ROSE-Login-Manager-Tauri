import { getVersion } from "@tauri-apps/api/app";
import { check, type Update } from "@tauri-apps/plugin-updater";

export function appGetVersion(): Promise<string> {
  return getVersion();
}

/** Resolves to `null` when already on the latest version. */
export function appCheckForUpdate(): Promise<Update | null> {
  return check();
}
