import { House, LogOut, Settings as SettingsIcon, Users } from "lucide-react";
import type { ComponentType } from "react";
import { NavLink } from "react-router";
import { Button } from "@/components/ui/button";
import { useVault } from "@/features/vault/vault-provider";
import { cn } from "@/lib/utils";

/**
 * The original top-nav layout, kept alongside AppSidebar (app-sidebar.tsx)
 * as an equally supported alternative - see the `navStyle` setting - rather
 * than one having replaced the other outright.
 */
export function AppTopbar() {
  const { lock } = useVault();

  return (
    <header className="flex items-center justify-between border-b px-4 py-2">
      <nav className="flex items-center gap-1">
        <NavTab icon={House} label="Home" to="/" />
        <NavTab icon={Users} label="Profiles" to="/profiles" />
        <NavTab icon={SettingsIcon} label="Settings" to="/settings" />
      </nav>
      <Button onClick={lock} size="sm" title="Lock the vault" variant="ghost">
        <LogOut className="size-4" />
        Lock
      </Button>
    </header>
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
            ? "bg-primary text-primary-foreground"
            : "text-nav-foreground hover:text-foreground"
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
