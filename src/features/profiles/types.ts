/** Mirrors the `Profile` / input / export types in docs/command-contract.md exactly. */

/** A profile as seen by the frontend - password is intentionally absent. */
export interface Profile {
  email: string;
  name: string;
  order: number;
  status: boolean; // true = client currently running for this profile
  // Note: password never leaves Rust in plaintext. Frontend never sees it.
}

/** `profilesCreate`'s payload for a new saved login. */
export interface NewProfileInput {
  email: string;
  name: string;
  password: string; // plaintext in-memory only, sent once over invoke(), never logged
}

/** `profilesUpdate`'s payload - every field optional, missing ones left unchanged. */
export interface UpdateProfileInput {
  email?: string;
  name?: string;
  password?: string; // omit to leave password unchanged
}

/** A password-protected snapshot of selected profiles, from `profilesExport`. */
export interface ExportBundle {
  ciphertext: string; // base64, re-encrypted under the export password, not the vault key
  version: 1;
}

/** Returned by `profilesImport` after processing an `ExportBundle`. */
export interface ImportResult {
  imported: number;
  skipped: string[];
}

export type ProfileErrorKind =
  | "duplicate_email"
  | "not_found"
  | "vault_locked"
  | "game_folder_not_set"
  | "game_executable_not_found"
  | "already_running"
  | "unknown";

/**
 * Typed error so the UI can show a field-level message (e.g. on the email
 * field for `duplicate_email`) instead of a generic toast - the old app
 * only logged validation failures to a file the user never saw.
 */
export class ProfileError extends Error {
  readonly kind: ProfileErrorKind;

  constructor(kind: ProfileErrorKind, message?: string) {
    super(message ?? defaultMessageFor(kind));
    this.name = "ProfileError";
    this.kind = kind;
  }
}

/** The generic message shown when a `ProfileError` is constructed without an explicit one. */
function defaultMessageFor(kind: ProfileErrorKind): string {
  switch (kind) {
    case "duplicate_email":
      return "A profile with this email already exists.";
    case "not_found":
      return "That profile no longer exists.";
    case "vault_locked":
      return "The vault is locked.";
    case "game_folder_not_set":
      return "Set your ROSE Online folder in Settings first.";
    case "game_executable_not_found":
      return "trose.exe wasn't found in the configured game folder.";
    case "already_running":
      return "This profile's client is already running.";
    default:
      return "Something went wrong.";
  }
}
