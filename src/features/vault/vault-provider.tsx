/** Vault state/actions as React context - the single source of truth for whether the app is unlocked. */

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  vaultChangePassphrase,
  vaultDisableStayUnlocked,
  vaultEnableStayUnlocked,
  vaultIsInitialized,
  vaultLock,
  vaultRecover,
  vaultReset,
  vaultResumeFromOs,
  vaultSetup,
  vaultStayUnlockedIsEnabled,
  vaultStayUnlockedIsSupported,
  vaultUnlock,
} from "./api";

type VaultStatus =
  | "checking"
  | "needs-setup"
  | "show-recovery-key"
  | "locked"
  | "unlocked";

interface VaultContextValue {
  changePassphrase: (
    currentPassphrase: string,
    newPassphrase: string
  ) => Promise<void>;
  /** Dismisses the recovery-key screen once the user has confirmed they saved it. */
  confirmRecoveryKeySaved: () => void;
  /** Turns "stay unlocked" back off. */
  disableStayUnlocked: () => Promise<void>;
  /** Re-verifies `passphrase`, then persists an OS-protected copy of the DEK. */
  enableStayUnlocked: (passphrase: string) => Promise<void>;
  lock: () => Promise<void>;
  recover: (recoveryKey: string, newPassphrase: string) => Promise<void>;
  /** Only non-null while status is "show-recovery-key". */
  recoveryKey: string | null;
  reset: () => Promise<void>;
  setup: (passphrase: string) => Promise<void>;
  status: VaultStatus;
  /** Whether an OS-protected DEK is currently persisted. */
  stayUnlockedEnabled: boolean;
  /** Whether this platform's OS-backed storage is actually reachable right now. */
  stayUnlockedSupported: boolean;
  unlock: (passphrase: string) => Promise<void>;
}

const VaultContext = createContext<VaultContextValue | null>(null);

/** Provides vault status and every vault action described in the file header. */
export function VaultProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<VaultStatus>("checking");
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [stayUnlockedEnabled, setStayUnlockedEnabled] = useState(false);
  // Defaults false (not true) so the Linux toggle never flashes visible
  // then disappears while the Secret Service probe is still resolving.
  const [stayUnlockedSupported, setStayUnlockedSupported] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const initialized = await vaultIsInitialized();
      if (cancelled) {
        return;
      }
      if (!initialized) {
        setStatus("needs-setup");
        return;
      }
      // A strict superset of vaultIsUnlocked(): checks the in-memory state
      // first, then falls back to resuming from a persisted OS-protected DEK
      // (a no-op everywhere "stay unlocked" was never enabled).
      const unlocked = await vaultResumeFromOs();
      setStatus(unlocked ? "unlocked" : "locked");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Keeps stayUnlockedEnabled/stayUnlockedSupported in sync with the backend
  // on unlock, rather than threading a refetch through every action that
  // can reach "unlocked" individually.
  useEffect(() => {
    if (status !== "unlocked") {
      return;
    }
    let cancelled = false;
    vaultStayUnlockedIsEnabled().then((enabled) => {
      if (!cancelled) {
        setStayUnlockedEnabled(enabled);
      }
    });
    vaultStayUnlockedIsSupported().then((supported) => {
      if (!cancelled) {
        setStayUnlockedSupported(supported);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [status]);

  const setup = useCallback(async (passphrase: string) => {
    const result = await vaultSetup(passphrase);
    setRecoveryKey(result.recoveryKey);
    setStatus("show-recovery-key");
  }, []);

  const confirmRecoveryKeySaved = useCallback(() => {
    setRecoveryKey(null);
    setStatus("unlocked");
  }, []);

  const unlock = useCallback(async (passphrase: string) => {
    await vaultUnlock(passphrase);
    setStatus("unlocked");
  }, []);

  const recover = useCallback(
    async (recoveryKeyInput: string, newPassphrase: string) => {
      await vaultRecover(recoveryKeyInput, newPassphrase);
      setStatus("unlocked");
    },
    []
  );

  // No status transition - stays "unlocked" before and after. The DEK
  // itself doesn't change (only how it's wrapped), so the in-memory
  // session key on the Rust side is still valid; nothing here needs to
  // re-derive or re-fetch anything.
  const changePassphrase = useCallback(
    async (currentPassphrase: string, newPassphrase: string) => {
      await vaultChangePassphrase(currentPassphrase, newPassphrase);
    },
    []
  );

  const reset = useCallback(async () => {
    await vaultReset();
    setStatus("needs-setup");
  }, []);

  // vaultLock() also clears any persisted "stay unlocked" data server-side
  // (see its own doc comment) - mirrored here so the Settings toggle doesn't
  // show stale "on" state after a manual lock.
  const lock = useCallback(async () => {
    await vaultLock();
    setStatus("locked");
    setStayUnlockedEnabled(false);
  }, []);

  const enableStayUnlocked = useCallback(async (passphrase: string) => {
    await vaultEnableStayUnlocked(passphrase);
    setStayUnlockedEnabled(true);
  }, []);

  const disableStayUnlocked = useCallback(async () => {
    await vaultDisableStayUnlocked();
    setStayUnlockedEnabled(false);
  }, []);

  return (
    <VaultContext.Provider
      value={{
        status,
        recoveryKey,
        confirmRecoveryKeySaved,
        setup,
        unlock,
        recover,
        changePassphrase,
        reset,
        lock,
        stayUnlockedEnabled,
        stayUnlockedSupported,
        enableStayUnlocked,
        disableStayUnlocked,
      }}
    >
      {children}
    </VaultContext.Provider>
  );
}

/** Reads the vault context - throws outside a `VaultProvider`. */
export function useVault(): VaultContextValue {
  const ctx = useContext(VaultContext);
  if (!ctx) {
    throw new Error("useVault must be used within a VaultProvider");
  }
  return ctx;
}
