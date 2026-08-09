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
  | "unknown";

export class VaultError extends Error {
  readonly kind: VaultErrorKind;

  constructor(kind: VaultErrorKind, message?: string) {
    super(message ?? defaultMessageFor(kind));
    this.name = "VaultError";
    this.kind = kind;
  }
}

function defaultMessageFor(kind: VaultErrorKind): string {
  switch (kind) {
    case "wrong_passphrase":
      return "That passphrase doesn't match. Please try again.";
    case "already_initialized":
      return "The vault has already been set up.";
    case "not_initialized":
      return "The vault hasn't been set up yet.";
    default:
      return "Something went wrong with the vault.";
  }
}
