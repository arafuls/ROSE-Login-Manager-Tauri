/**
 * Vault API layer - see docs/command-contract.md, "Vault" section.
 *
 * Every exported function here has the exact name/signature the real Tauri
 * commands will have once the backend lands (camelCase wrapper around
 * `invoke("vault_xxx", ...)`). Today each function body is a mock; swapping
 * to the real backend is a one-line change per function, e.g.:
 *
 *   export async function vaultUnlock(passphrase: string): Promise<void> {
 *     await invoke("vault_unlock", { passphrase });
 *   }
 *
 * Nothing outside this file should know or care that it's a mock.
 */
import { mockDelay, readMockState, writeMockState } from "@/lib/mock-storage";
import { VaultError } from "./types";

interface MockVaultState {
  initialized: boolean;
  // NOTE: a real backend never stores/compares the passphrase itself - it
  // derives an Argon2id key and verifies via the encrypted vault payload.
  // The mock stores a plain value purely to simulate that check.
  passphrase: string | null;
}

const STORAGE_KEY = "vault";

function loadState(): MockVaultState {
  return readMockState<MockVaultState>(STORAGE_KEY, {
    initialized: false,
    passphrase: null,
  });
}

function saveState(state: MockVaultState): void {
  writeMockState(STORAGE_KEY, state);
}

// Unlocked status is intentionally NOT persisted across reloads - a page
// refresh should always require re-entering the passphrase, same as the
// real app re-prompting after the process restarts.
let unlockedThisSession = false;

export async function vaultIsInitialized(): Promise<boolean> {
  await mockDelay();
  return loadState().initialized;
}

export async function vaultSetup(passphrase: string): Promise<void> {
  await mockDelay();
  const state = loadState();
  if (state.initialized) {
    throw new VaultError("already_initialized");
  }
  saveState({ initialized: true, passphrase });
  unlockedThisSession = true;
}

export async function vaultUnlock(passphrase: string): Promise<void> {
  await mockDelay();
  const state = loadState();
  if (!state.initialized) {
    throw new VaultError("not_initialized");
  }
  if (state.passphrase !== passphrase) {
    throw new VaultError("wrong_passphrase");
  }
  unlockedThisSession = true;
}

export async function vaultIsUnlocked(): Promise<boolean> {
  await mockDelay(30);
  return unlockedThisSession;
}

/**
 * Frontend-only convenience, NOT part of the command contract (Phase 1 has
 * no `vault_lock` command). Included so the mock is actually testable across
 * repeated unlock attempts without a full page reload. Drop this or wire it
 * to a future `vault_lock` command once the backend defines one.
 */
export function devOnlyRelock(): void {
  unlockedThisSession = false;
}
