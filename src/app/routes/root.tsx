import { Outlet } from "react-router";
import { AppSidebar } from "@/components/app-sidebar";
import { AppTopbar } from "@/components/app-topbar";
import { SidebarInset } from "@/components/ui/sidebar";
import { useSettings } from "@/features/settings/use-settings";
import { VaultGate } from "@/features/vault/components/vault-gate";

// SidebarProvider itself lives in src/app/index.tsx, wrapping both this
// route tree and the custom TitleBar - the titlebar's sidebar-toggle button
// needs the same useSidebar() context, and TitleBar renders outside the
// router entirely, so the provider has to sit above both. It stays mounted
// unconditionally regardless of navStyle (see index.tsx) - fully inert here
// in Topbar mode, since nothing below renders a <Sidebar>/<SidebarTrigger>.
function AppShell() {
  const { settings } = useSettings();

  // Defaults to Sidebar (matching the backend/type default) while settings
  // are still loading, so there's no layout flash-then-swap for the common
  // case of an install with no explicit preference yet.
  if (settings?.navStyle === "Topbar") {
    return (
      <div className="flex h-full w-full flex-col">
        <AppTopbar />
        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    );
  }

  return (
    <>
      <AppSidebar />
      <SidebarInset className="min-h-0 overflow-y-auto overflow-x-hidden">
        <Outlet />
      </SidebarInset>
    </>
  );
}

function Root() {
  return (
    <VaultGate>
      <AppShell />
    </VaultGate>
  );
}

// Necessary for react router to lazy load.
export const Component = Root;
