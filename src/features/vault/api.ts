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

/** Whether `vaultSetup` has ever run. */
export function vaultIsInitialized(): Promise<boolean> {
  return invoke("vault_is_initialized");
}

/** First-run setup: generates and wraps the DEK, returning the one-time recovery key. */
export async function vaultSetup(
  passphrase: string
): Promise<VaultSetupResult> {
  try {
    return await invoke("vault_setup", { passphrase });
  } catch (error) {
    throw toVaultError(error);
  }
}

/** Unlocks the vault with its passphrase. */
export async function vaultUnlock(passphrase: string): Promise<void> {
  try {
    await invoke("vault_unlock", { passphrase });
  } catch (error) {
    throw toVaultError(error);
  }
}

/** Unlocks with the recovery key and sets a new passphrase in the same step. */
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

/** Rotates the passphrase while it's still known - doesn't need the recovery key. */
export async function vaultChangePassphrase(
  currentPassphrase: string,
  newPassphrase: string
): Promise<void> {
  try {
    await invoke("vault_change_passphrase", {
      currentPassphrase,
      newPassphrase,
    });
  } catch (error) {
    throw toVaultError(error);
  }
}

/** Last resort when both the passphrase and recovery key are lost: wipes the vault. */
export async function vaultReset(): Promise<void> {
  await invoke("vault_reset");
}

/** Whether this session currently has the vault unlocked. */
export function vaultIsUnlocked(): Promise<boolean> {
  return invoke("vault_is_unlocked");
}

/** Re-locks the vault for this session and clears any "stay unlocked" data. */
export async function vaultLock(): Promise<void> {
  await invoke("vault_lock");
}

/** Whether an OS-protected copy of the DEK is currently persisted ("stay unlocked" is on). */
export function vaultStayUnlockedIsEnabled(): Promise<boolean> {
  return invoke("vault_stay_unlocked_is_enabled");
}

/** Re-verifies the passphrase, then persists an OS-protected copy of the DEK. */
export async function vaultEnableStayUnlocked(
  passphrase: string
): Promise<void> {
  try {
    await invoke("vault_enable_stay_unlocked", { passphrase });
  } catch (error) {
    throw toVaultError(error);
  }
}

/** Turns "stay unlocked" back off. */
export async function vaultDisableStayUnlocked(): Promise<void> {
  await invoke("vault_disable_stay_unlocked");
}

/** Attempts to unlock from a persisted OS-protected DEK, without a passphrase. */
export function vaultResumeFromOs(): Promise<boolean> {
  return invoke("vault_resume_from_os");
}
