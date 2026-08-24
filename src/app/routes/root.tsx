/**
 * The root route: gates everything behind the vault (VaultGate), then
 * renders the nav chrome (sidebar or topbar, per the navStyle setting)
 * around whichever child route (Home/Profiles/Settings) is active.
 */

import { useLayoutEffect, useRef } from "react";
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
//
// SidebarInset + Outlet always render through the same ancestor structure
// in both modes, with only AppTopbar/AppSidebar swapped in/out as siblings,
// rather than returning two differently-shaped trees from an if/else -
// react-router can't tell "the same route, different chrome around it"
// from "a different tree" when the JSX shape itself changes, so the
// earlier if/else remounted whatever route was showing (losing scroll
// position and any in-progress state) every time this setting flipped.
function AppShell() {
  const { settings } = useSettings();
  // Defaults to Sidebar (matching the backend/type default) while settings
  // are still loading, so there's no layout flash-then-swap for the common
  // case of an install with no explicit preference yet.
  const isTopbar = settings?.navStyle === "Topbar";

  const insetRef = useRef<HTMLElement>(null);
  const prevTopRef = useRef<number | null>(null);

  // Switching nav style shifts SidebarInset both vertically (AppTopbar
  // mounting/unmounting above it) and horizontally (AppSidebar taking or
  // freeing width) without touching scrollTop, and the width change alone
  // can reflow the page content to a different height. Anchoring to the
  // page's own root element - not remounted across this switch, so it's
  // the same node before and after - captures both effects in one
  // measurement, rather than only compensating for the container's own
  // shift and missing whatever the content did in response to it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally re-measures only when isTopbar changes (the only thing that shifts this element's own screen position) - the effect reads the DOM directly rather than isTopbar itself.
  useLayoutEffect(() => {
    const el = insetRef.current;
    if (!el) {
      return;
    }
    const anchor = el.firstElementChild ?? el;
    const top = anchor.getBoundingClientRect().top;
    if (prevTopRef.current !== null) {
      el.scrollTop += top - prevTopRef.current;
    }
    prevTopRef.current = top;
  }, [isTopbar]);

  return (
    <div className="flex h-full w-full flex-col">
      {isTopbar && <AppTopbar />}
      <div className="flex min-h-0 flex-1">
        {!isTopbar && <AppSidebar />}
        <SidebarInset
          className="min-h-0 overflow-y-auto overflow-x-hidden"
          ref={insetRef}
        >
          <Outlet />
        </SidebarInset>
      </div>
    </div>
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
