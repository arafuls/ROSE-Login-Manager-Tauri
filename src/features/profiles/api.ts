/**
 * Profiles API layer - see docs/command-contract.md, "Profiles" section.
 * Wired to the real Tauri commands; see git history for the mock this
 * replaced if you need the earlier in-memory version for reference.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isBackendError } from "@/lib/tauri-errors";
import type {
  ExportBundle,
  ImportResult,
  NewProfileInput,
  Profile,
  UpdateProfileInput,
} from "./types";
import { ProfileError, type ProfileErrorKind } from "./types";

const KIND_MAP: Record<string, ProfileErrorKind> = {
  duplicate_email: "duplicate_email",
  profile_not_found: "not_found",
  vault_locked: "vault_locked",
  game_folder_not_set: "game_folder_not_set",
  game_executable_not_found: "game_executable_not_found",
  already_running: "already_running",
};

/** See the equivalent note in features/vault/api.ts - same reasoning. */
function toProfileError(error: unknown): ProfileError {
  if (isBackendError(error)) {
    return new ProfileError(KIND_MAP[error.kind] ?? "unknown", error.message);
  }
  return new ProfileError("unknown");
}

const PROFILES_CHANGED_EVENT = "profiles-changed";

/**
 * Subscribes to the real `profiles-changed` Tauri event. `listen()` is
 * async (it awaits the IPC round-trip that registers the listener), but
 * callers (use-profiles.ts) expect a synchronous unsubscribe function back -
 * this bridges that by queuing the unlisten call if the effect unmounts
 * before `listen()` resolves.
 */
export function onProfilesChanged(listener: () => void): () => void {
  let unlisten: (() => void) | undefined;
  let cancelled = false;

  listen(PROFILES_CHANGED_EVENT, () => listener()).then((fn) => {
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

/** Lists every saved profile (without passwords) in display order. */
export function profilesList(): Promise<Profile[]> {
  return invoke("profiles_list");
}

/** Encrypts the given password under the vault key and saves a new profile. */
export async function profilesCreate(input: NewProfileInput): Promise<Profile> {
  try {
    return await invoke("profiles_create", { input });
  } catch (error) {
    throw toProfileError(error);
  }
}

/** Updates a profile - any field left unset in `input` stays unchanged, including the password. */
export async function profilesUpdate(
  email: string,
  input: UpdateProfileInput
): Promise<Profile> {
  try {
    return await invoke("profiles_update", { email, input });
  } catch (error) {
    throw toProfileError(error);
  }
}

/** Permanently deletes a saved profile. */
export async function profilesDelete(email: string): Promise<void> {
  try {
    await invoke("profiles_delete", { email });
  } catch (error) {
    throw toProfileError(error);
  }
}

/** Persists a new display order (drag-and-drop reorder). */
export async function profilesReorder(orderedEmails: string[]): Promise<void> {
  try {
    await invoke("profiles_reorder", { orderedEmails });
  } catch (error) {
    throw toProfileError(error);
  }
}

/** Syncs game files if needed, then launches the client logged into this profile. */
export async function profilesLaunch(email: string): Promise<void> {
  try {
    await invoke("profiles_launch", { email });
  } catch (error) {
    throw toProfileError(error);
  }
}

/** Builds a password-protected export bundle for the selected profiles. */
export async function profilesExport(
  emails: string[],
  exportPassword: string
): Promise<ExportBundle> {
  try {
    return await invoke("profiles_export", { emails, exportPassword });
  } catch (error) {
    throw toProfileError(error);
  }
}

/** Reads a file the user picked via the native open dialog, for import. */
export function profilesReadExportFile(path: string): Promise<string> {
  return invoke("profiles_read_export_file", { path });
}

/** Writes an export bundle to a path the user picked via the native save dialog. */
export function profilesWriteExportFile(
  bundle: ExportBundle,
  path: string
): Promise<void> {
  return invoke("profiles_write_export_file", { bundle, path });
}

/** Decrypts `bundle` and imports every entry whose email isn't already saved locally. */
export async function profilesImport(
  bundle: ExportBundle,
  exportPassword: string
): Promise<ImportResult> {
  try {
    return await invoke("profiles_import", { bundle, exportPassword });
  } catch (error) {
    throw toProfileError(error);
  }
}
