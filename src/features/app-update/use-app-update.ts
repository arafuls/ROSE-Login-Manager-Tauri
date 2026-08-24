/**
 * App (not game) update checking - a silent check on launch plus a
 * manual "Check for updates" button, both funneling into the same
 * download/install/relaunch flow.
 */

import { relaunch } from "@tauri-apps/plugin-process";
import type { Update } from "@tauri-apps/plugin-updater";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { appCheckForUpdate } from "./api";

const TOAST_ID = "app-update";

/** Downloads and installs `update`, surfacing live progress via a toast, then relaunches. */
async function downloadAndInstall(update: Update) {
  let downloaded = 0;
  let total: number | undefined;

  await update.downloadAndInstall((event) => {
    if (event.event === "Started") {
      total = event.data.contentLength;
      toast.loading("Downloading update…", { id: TOAST_ID });
    } else if (event.event === "Progress") {
      downloaded += event.data.chunkLength;
      const percent = total ? Math.round((downloaded / total) * 100) : null;
      toast.loading(
        percent === null
          ? "Downloading update…"
          : `Downloading update… ${percent}%`,
        { id: TOAST_ID }
      );
    } else if (event.event === "Finished") {
      toast.loading("Installing update…", { id: TOAST_ID });
    }
  });

  toast.success("Update installed — restarting…", { id: TOAST_ID });
  await relaunch();
}

/** Shows a toast offering to install `update`, wired to `downloadAndInstall`. */
function offerUpdate(update: Update) {
  toast(`Update available: v${update.version}`, {
    id: TOAST_ID,
    description: "Downloads and restarts the app once installed.",
    action: {
      label: "Update",
      onClick: () => {
        downloadAndInstall(update).catch((error) => {
          toast.error("Couldn't install update", {
            id: TOAST_ID,
            description: error instanceof Error ? error.message : undefined,
          });
        });
      },
    },
  });
}

/**
 * Silently checks for an app update once on mount - matches the original
 * ROSE Login Manager's own "checks on launch, doesn't auto-download"
 * behavior (see the forum thread this app's feature set was compared
 * against). A failed check (network issue, or the updater's pubkey/
 * endpoint not configured yet) is swallowed rather than surfaced - this is
 * a best-effort background check, not a user-initiated action, so it
 * shouldn't interrupt anyone with an error toast for something they didn't
 * ask for.
 */
export function useAppUpdateCheck() {
  const checked = useRef(false);

  useEffect(() => {
    if (checked.current) {
      return;
    }
    checked.current = true;

    appCheckForUpdate()
      .then((update) => {
        if (update) {
          offerUpdate(update);
        }
      })
      .catch((error) => {
        console.error("Update check failed:", error);
      });
  }, []);
}

/**
 * User-initiated check (Settings' "Check for updates" button) - unlike the
 * silent on-mount check above, this always gives feedback either way, since
 * the user explicitly asked for it.
 */
export function useManualUpdateCheck() {
  const [checking, setChecking] = useState(false);

  const checkNow = useCallback(async () => {
    setChecking(true);
    try {
      const update = await appCheckForUpdate();
      if (update) {
        offerUpdate(update);
      } else {
        toast.success("You're on the latest version");
      }
    } catch (error) {
      toast.error("Couldn't check for updates", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setChecking(false);
    }
  }, []);

  return { checking, checkNow };
}

/**
 * Renders nothing - mounted once in `AppProvider` (same spot as
 * `ThemeApplier`) so the silent on-launch check runs regardless of which
 * screen the app opens to.
 */
export function AppUpdateChecker() {
  useAppUpdateCheck();
  return null;
}
