/**
 * App root: mounts the global providers (theme, vault, sidebar context),
 * the custom titlebar, and the router - everything else in the app renders
 * beneath this.
 */

import "./global.css";

import { platform } from "@tauri-apps/plugin-os";
import type { CSSProperties } from "react";
import AppProvider from "@/app/provider";
import AppRouter from "@/app/router";
import { TitleBar } from "@/components/title-bar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { VaultProvider } from "@/features/vault/vault-provider";
import { cn } from "@/lib/utils";

// Windows 11 already rounds this window's own corners via DWM by default,
// even for a custom-chrome/transparent window like this one (decorations:
// false + transparent: true in tauri.conf.json) - adding our own CSS-level
// rounding on top double-rounds, and the two don't quite agree on radius,
// producing a visible seam/outline artifact around the corners. Linux has
// no DWM-equivalent, so it still needs the CSS-level clip below to get
// rounded corners at all.
const isWindows = platform() === "windows";

/** Top-level component - see the file header. */
export default function App() {
  return (
    <AppProvider>
      <VaultProvider>
        {/* SidebarProvider lives here (not down in root.tsx) so TitleBar's
            sidebar-toggle button can reach the same useSidebar() context as
            the sidebar itself, even though TitleBar renders outside the
            router entirely. Its own wrapper div still needs to be the
            direct flex-row parent of <AppSidebar>/<SidebarInset> for their
            layout CSS to work - the div below (flex, not flex-col) is what
            makes that true despite TitleBar/AppRouter sitting in between. */}
        <SidebarProvider
          className={cn(
            "h-screen flex-col overflow-hidden bg-background",
            !isWindows && "rounded-xl"
          )}
          // Overrides the primitive's own 16rem default (shadcn's documented
          // customization point, via SidebarProvider's style prop) - our
          // nav's longest label ("Settings") doesn't need nearly that much
          // width, and the default left a lot of empty space next to it.
          style={{ "--sidebar-width": "10rem" } as CSSProperties}
        >
          <TitleBar />
          {/* contain-layout makes this div (not the true window) the
              containing block for the sidebar's `fixed inset-y-0`
              positioning - without it, "fixed" is relative to the whole
              window and the sidebar renders from y=0, covering TitleBar
              instead of starting below it. */}
          <div className="flex min-h-0 flex-1 contain-layout">
            <AppRouter />
          </div>
        </SidebarProvider>
      </VaultProvider>
    </AppProvider>
  );
}
