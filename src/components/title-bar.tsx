import { getCurrentWindow } from "@tauri-apps/api/window";
import { Copy, Minus, Square, X } from "lucide-react";
import { type ButtonHTMLAttributes, useEffect, useState } from "react";
import { toast } from "sonner";
import roseLogo from "@/assets/rose-logo.webp";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useSettings } from "@/features/settings/use-settings";
import { useVault } from "@/features/vault/vault-provider";
import { isBackendError } from "@/lib/tauri-errors";
import { cn } from "@/lib/utils";

const appWindow = getCurrentWindow();

/**
 * Window-control commands (close/minimize/toggleMaximize/startDragging)
 * need explicit permissions in src-tauri/capabilities/*.json beyond
 * `core:default` - without them, these calls fail silently (the exact bug
 * that shipped here the first time: titlebar rendered fine, but dragging
 * and every button did nothing, with no visible error at all). Wrapping
 * every call so a future regression - a missing permission on a new
 * platform, a Tauri upgrade that changes defaults - surfaces immediately
 * instead of going unnoticed again.
 */
function runWindowCommand(action: () => Promise<void>, label: string) {
  action().catch((error) => {
    toast.error(`Couldn't ${label} the window`, {
      description: isBackendError(error) ? error.message : undefined,
    });
  });
}

/**
 * Fully custom titlebar, replacing the OS-native one (`decorations: false`
 * in tauri.conf.json) so the app looks the same on Windows/macOS/Linux
 * instead of whatever chrome each OS happens to draw. Mounted once at the
 * very top of the app (src/app/index.tsx), outside the router and outside
 * VaultGate, so it's present on every screen - lock, setup, and the
 * authenticated app alike. Still inside VaultProvider (also elevated to
 * app/index.tsx) purely to read `status` - just enough to hide the sidebar
 * trigger on the lock/setup screens (where no sidebar is mounted to react
 * to it) and in Topbar mode (where AppTopbar, not AppSidebar, is mounted).
 *
 * Known tradeoff of going fully custom: this app loses the OS's own
 * drop-shadow treatment and native Aero Snap/window-menu integration on
 * Windows. Accepted for a consistent cross-platform look, same tradeoff
 * apps like VS Code and Discord make. Corner rounding itself is restored
 * via CSS (transparent window + rounded/clipped wrapper in
 * src/app/index.tsx) rather than relying on the OS's own treatment, since
 * that's Windows-only (DWM) and wouldn't render on Linux.
 */
export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const { status } = useVault();
  const { settings } = useSettings();

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    const syncMaximized = () => {
      appWindow.isMaximized().then((maximized) => {
        if (!cancelled) {
          setIsMaximized(maximized);
        }
      });
    };

    syncMaximized();

    appWindow.onResized(syncMaximized).then((fn) => {
      if (cancelled) {
        fn();
      } else {
        unlisten = fn;
      }
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  return (
    // OS titlebar drag/double-click-to-maximize region - no keyboard
    // equivalent needed, window move/maximize already have OS shortcuts.
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: see above.
    // biome-ignore lint/a11y/noStaticElementInteractions: see above.
    <div
      className="flex h-8 shrink-0 select-none items-center justify-between border-b bg-card"
      data-tauri-drag-region
      onDoubleClick={() =>
        runWindowCommand(() => appWindow.toggleMaximize(), "maximize")
      }
    >
      {/* Not itself a drag region (matches how the window-control buttons
          below already opt out) so the trigger stays clickable instead of
          initiating a window drag. Grouped with the logo/title in one flex
          container so they stick together at the left edge rather than
          `justify-between` spreading three top-level items apart. */}
      <div className="flex items-center">
        {status === "unlocked" && settings?.navStyle === "Sidebar" && (
          <SidebarTrigger
            className="ml-1"
            // Without this, a fast double-click on the trigger also
            // bubbles a native dblclick up to the outer bar's own
            // onDoubleClick, triggering maximize/restore at the same time.
            onDoubleClick={(event) => event.stopPropagation()}
          />
        )}
        <div className="flex items-center gap-2 px-3" data-tauri-drag-region>
          <img
            alt=""
            className="h-4 w-auto"
            height={187}
            src={roseLogo}
            width={331}
          />
          <span className="font-medium text-xs">ROSE Login Manager</span>
        </div>
      </div>

      <div className="flex h-full items-center">
        <TitleBarButton
          aria-label="Minimize"
          onClick={() =>
            runWindowCommand(() => appWindow.minimize(), "minimize")
          }
        >
          <Minus className="size-3.5" />
        </TitleBarButton>
        <TitleBarButton
          aria-label={isMaximized ? "Restore" : "Maximize"}
          onClick={() =>
            runWindowCommand(() => appWindow.toggleMaximize(), "maximize")
          }
        >
          {isMaximized ? (
            <Copy className="size-3.5" />
          ) : (
            <Square className="size-3.5" />
          )}
        </TitleBarButton>
        <TitleBarButton
          aria-label="Close"
          className="hover:bg-destructive hover:text-foreground"
          onClick={() => runWindowCommand(() => appWindow.close(), "close")}
        >
          <X className="size-3.5" />
        </TitleBarButton>
      </div>
    </div>
  );
}

function TitleBarButton({
  className,
  onDoubleClick,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "flex h-full w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        className
      )}
      // Same reasoning as the sidebar trigger's own onDoubleClick guard -
      // without this, double-clicking Minimize/Maximize/Close also bubbles
      // a dblclick to the bar's own maximize-on-double-click handler.
      onDoubleClick={(event) => {
        event.stopPropagation();
        onDoubleClick?.(event);
      }}
      type="button"
      {...props}
    />
  );
}
