/**
 * Vault API layer - see docs/command-contract.md, "Vault" section.
 * Wired to the real Tauri commands; see git history for the mock this
 * replaced if you need the earlier in-memory version for reference.
 */
import { invoke } from "@tauri-apps/api/core";
import { isBackendError } from "@/lib/tauri-errors";
import {
  VaultError,
  type VaultErrorKind,
  type VaultSetupResult,
} from "./types";

const KIND_MAP: Record<string, VaultErrorKind> = {
  wrong_passphrase: "wrong_passphrase",
  vault_already_initialized: "already_initialized",
  vault_not_initialized: "not_initialized",
  invalid_recovery_key: "invalid_recovery_key",
};

/** Maps a rejected invoke() error to our typed VaultError. Unrecognized
 * backend error kinds (e.g. passphrase_too_short, db_error) fall through to
 * "unknown" but keep Rust's human-readable message rather than a generic one. */
function toVaultError(error: unknown): VaultError {
  if (isBackendError(error)) {
    return new VaultError(KIND_MAP[error.kind] ?? "unknown", error.message);
  }
  return new VaultError("unknown");
}

export function vaultIsInitialized(): Promise<boolean> {
  return invoke("vault_is_initialized");
}

export async function vaultSetup(
  passphrase: string
): Promise<VaultSetupResult> {
  try {
    return await invoke("vault_setup", { passphrase });
  } catch (error) {
    throw toVaultError(error);
  }
}

export async function vaultUnlock(passphrase: string): Promise<void> {
  try {
    await invoke("vault_unlock", { passphrase });
  } catch (error) {
    throw toVaultError(error);
  }
}

export async function vaultRecover(
  recoveryKey: string,
  newPassphrase: string
): Promise<void> {
  try {
    await invoke("vault_recover", { newPassphrase, recoveryKey });
  } catch (error) {
    throw toVaultError(error);
  }
}

export async function vaultReset(): Promise<void> {
  await invoke("vault_reset");
}

export function vaultIsUnlocked(): Promise<boolean> {
  return invoke("vault_is_unlocked");
}

export async function vaultLock(): Promise<void> {
  await invoke("vault_lock");
}
