/**
 * Updater API layer - see docs/command-contract.md, "Updater" and "Events"
 * sections. The exact rose-updater.exe CLI grammar behind these commands is
 * unverified (see src-tauri/src/updater.rs) - this layer just calls the
 * Tauri commands, the uncertainty lives entirely on the Rust side.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isBackendError } from "@/lib/tauri-errors";
import type { LaunchStatus } from "./types";
import { UpdaterError, type UpdaterErrorKind } from "./types";

const KIND_MAP: Record<string, UpdaterErrorKind> = {
  game_folder_not_set: "game_folder_not_set",
  game_executable_not_found: "game_executable_not_found",
  updater_not_found: "updater_not_found",
  already_running: "already_running",
};

function toUpdaterError(error: unknown): UpdaterError {
  if (isBackendError(error)) {
    return new UpdaterError(KIND_MAP[error.kind] ?? "unknown", error.message);
  }
  return new UpdaterError("unknown");
}

export async function clientLaunchDefault(): Promise<void> {
  try {
    await invoke("client_launch_default");
  } catch (error) {
    throw toUpdaterError(error);
  }
}

export async function updaterForceRecheck(): Promise<void> {
  try {
    await invoke("updater_force_recheck");
  } catch (error) {
    throw toUpdaterError(error);
  }
}

const LAUNCH_STATUS_EVENT = "client-launch-status";

/** See the equivalent note in features/profiles/api.ts's onProfilesChanged
 * for why this bridges listen()'s async registration to a sync unsubscribe. */
export function onLaunchStatusChanged(
  listener: (status: LaunchStatus) => void
): () => void {
  let unlisten: (() => void) | undefined;
  let cancelled = false;

  listen<LaunchStatus>(LAUNCH_STATUS_EVENT, (event) =>
    listener(event.payload)
  ).then((fn) => {
    if (cancelled) {
      fn();
    } else {
      unlisten = fn;
    }
  });

  return () => {
    cancelled = true;
    unlisten?.();
  };
}
