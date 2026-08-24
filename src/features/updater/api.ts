/**
 * Game launch/update API layer - bindings for the commands in
 * src-tauri/src/commands/process.rs, which run the vendored update logic in
 * src-tauri/src/rose_update/ in-process rather than shelling out to a
 * separate updater binary.
 */

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isBackendError } from "@/lib/tauri-errors";
import type { LaunchStatus } from "./types";
import { UpdaterError, type UpdaterErrorKind } from "./types";

const KIND_MAP: Record<string, UpdaterErrorKind> = {
  game_folder_not_set: "game_folder_not_set",
  game_executable_not_found: "game_executable_not_found",
  already_running: "already_running",
};

/** See the equivalent note in features/profiles/api.ts's toProfileError. */
function toUpdaterError(error: unknown): UpdaterError {
  if (isBackendError(error)) {
    return new UpdaterError(KIND_MAP[error.kind] ?? "unknown", error.message);
  }
  return new UpdaterError("unknown");
}

/** Syncs game files if needed, then launches the client with no saved profile. */
export async function clientLaunchDefault(): Promise<void> {
  try {
    await invoke("client_launch_default");
  } catch (error) {
    throw toUpdaterError(error);
  }
}

/** "Verify Files": full check-and-repair of every game file against the remote manifest. */
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
