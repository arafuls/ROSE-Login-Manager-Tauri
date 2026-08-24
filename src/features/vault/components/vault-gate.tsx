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

  if (status === "unlocked") {
    return <>{children}</>;
  }

  // Shared w-full/h-full wrapper: these screens all render as the sole
  // child of app/index.tsx's flex *row* div (there so AppSidebar/
  // SidebarInset can sit side-by-side once authenticated) - without an
  // explicit width, a lone flex-row item shrinks to its content instead of
  // spanning the row, so each screen's own internal centering has nothing
  // to center within and sits flush-left instead.
  return (
    <div className="h-full w-full">
      {status === "checking" && (
        <div className="flex h-full items-center justify-center">
          <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {status === "needs-setup" && <SetupScreen />}
      {status === "show-recovery-key" && <RecoveryKeyScreen />}
      {status === "locked" && <UnlockScreen />}
    </div>
  );
}
