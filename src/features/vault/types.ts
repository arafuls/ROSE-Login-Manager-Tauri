/**
 * Mirrors the "Vault" section of docs/command-contract.md.
 * Vault commands don't carry a typed payload beyond the passphrase string,
 * but unlock/setup can fail in ways the UI needs to distinguish, so we model
 * those failures as a discriminated error type instead of a bare string.
 */

export type VaultErrorKind =
  | "wrong_passphrase"
  | "already_initialized"
  | "not_initialized"
  | "invalid_recovery_key"
  | "unknown";

/** Returned once by vaultSetup - never retrievable again after this. */
export interface VaultSetupResult {
  recoveryKey: string;
}

/** Typed error so the UI can distinguish specific vault failures from a generic one. */
export class VaultError extends Error {
  readonly kind: VaultErrorKind;

  constructor(kind: VaultErrorKind, message?: string) {
    super(message ?? defaultMessageFor(kind));
    this.name = "VaultError";
    this.kind = kind;
  }
}

/** The generic message shown when a `VaultError` is constructed without an explicit one. */
function defaultMessageFor(kind: VaultErrorKind): string {
  switch (kind) {
    case "wrong_passphrase":
      return "That passphrase doesn't match. Please try again.";
    case "already_initialized":
      return "The vault has already been set up.";
    case "not_initialized":
      return "The vault hasn't been set up yet.";
    case "invalid_recovery_key":
      return "That recovery key doesn't match.";
    default:
      return "Something went wrong with the vault.";
  }
}
