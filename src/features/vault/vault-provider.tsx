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
  vaultIsInitialized,
  vaultIsUnlocked,
  vaultLock,
  vaultRecover,
  vaultReset,
  vaultSetup,
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
  lock: () => Promise<void>;
  recover: (recoveryKey: string, newPassphrase: string) => Promise<void>;
  /** Only non-null while status is "show-recovery-key". */
  recoveryKey: string | null;
  reset: () => Promise<void>;
  setup: (passphrase: string) => Promise<void>;
  status: VaultStatus;
  unlock: (passphrase: string) => Promise<void>;
}

const VaultContext = createContext<VaultContextValue | null>(null);

export function VaultProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<VaultStatus>("checking");
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);

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
      const unlocked = await vaultIsUnlocked();
      setStatus(unlocked ? "unlocked" : "locked");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const lock = useCallback(async () => {
    await vaultLock();
    setStatus("locked");
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
      }}
    >
      {children}
    </VaultContext.Provider>
  );
}

export function useVault(): VaultContextValue {
  const ctx = useContext(VaultContext);
  if (!ctx) {
    throw new Error("useVault must be used within a VaultProvider");
  }
  return ctx;
}
