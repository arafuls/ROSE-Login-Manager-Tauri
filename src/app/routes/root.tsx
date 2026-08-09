import { LogOut, Settings as SettingsIcon, Users } from "lucide-react";
import type { ComponentType } from "react";
import { NavLink, Outlet } from "react-router";
import { Button } from "@/components/ui/button";
import { VaultGate } from "@/features/vault/components/vault-gate";
import { useVault, VaultProvider } from "@/features/vault/vault-provider";
import { cn } from "@/lib/utils";

function AppShell() {
  const { lock } = useVault();

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b px-4 py-2">
        <nav className="flex items-center gap-1">
          <NavTab icon={Users} label="Profiles" to="/" />
          <NavTab icon={SettingsIcon} label="Settings" to="/settings" />
        </nav>
        <Button
          onClick={lock}
          size="sm"
          title="Lock the vault (dev convenience - not a backend command yet)"
          variant="ghost"
        >
          <LogOut className="size-4" />
          Lock
        </Button>
      </header>
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}

function NavTab({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <NavLink
      className={({ isActive }) =>
        cn(
          "flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium text-sm transition-colors",
          isActive
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:text-foreground"
        )
      }
      end={to === "/"}
      to={to}
    >
      <Icon className="size-4" />
      {label}
    </NavLink>
  );
}

function Root() {
  return (
    <VaultProvider>
      <VaultGate>
        <AppShell />
      </VaultGate>
    </VaultProvider>
  );
}

// Necessary for react router to lazy load.
export const Component = Root;
