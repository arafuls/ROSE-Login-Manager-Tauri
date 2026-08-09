import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  vaultIsInitialized,
  vaultIsUnlocked,
  vaultLock,
  vaultSetup,
  vaultUnlock,
} from "./api";

type VaultStatus = "checking" | "needs-setup" | "locked" | "unlocked";

interface VaultContextValue {
  lock: () => Promise<void>;
  setup: (passphrase: string) => Promise<void>;
  status: VaultStatus;
  unlock: (passphrase: string) => Promise<void>;
}

const VaultContext = createContext<VaultContextValue | null>(null);

export function VaultProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<VaultStatus>("checking");

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
    await vaultSetup(passphrase);
    setStatus("unlocked");
  }, []);

  const unlock = useCallback(async (passphrase: string) => {
    await vaultUnlock(passphrase);
    setStatus("unlocked");
  }, []);

  const lock = useCallback(async () => {
    await vaultLock();
    setStatus("locked");
  }, []);

  return (
    <VaultContext.Provider value={{ status, setup, unlock, lock }}>
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
