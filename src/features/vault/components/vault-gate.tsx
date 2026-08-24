import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { useVault } from "@/features/vault/vault-provider";
import { RecoveryKeyScreen } from "./recovery-key-screen";
import { SetupScreen } from "./setup-screen";
import { UnlockScreen } from "./unlock-screen";

/**
 * Shows the first-run setup screen or the unlock screen until the vault is
 * unlocked, then renders the real app. Nothing behind this gate (profiles,
 * settings) ever mounts while the vault is locked.
 */
export function VaultGate({ children }: { children: ReactNode }) {
  const { status } = useVault();

  if (status === "checking") {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (status === "needs-setup") {
    return <SetupScreen />;
  }

  if (status === "show-recovery-key") {
    return <RecoveryKeyScreen />;
  }

  if (status === "locked") {
    return <UnlockScreen />;
  }

  return <>{children}</>;
}
