/**
 * The `useSettings` hook - a live, auto-updating read of the app's
 * persisted settings, for any component that needs to display or react to
 * them without owning the fetch/subscription logic itself.
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { isBackendError } from "@/lib/tauri-errors";
import { onSettingsChanged, settingsGet } from "./api";
import type { Settings } from "./types";

/**
 * Read-only live view of settings, shared by the settings page (which also
 * writes via `settingsUpdate`) and anything else that needs to react to
 * them, e.g. the profile list respecting `displayEmail` / `maskEmail`.
 *
 * `refetch` exists for callers whose action changes settings.toml without
 * going through `settingsUpdate` (and its `onSettingsChanged` notification)
 * - e.g. `theme_delete` resets `activeThemeId` server-side when the deleted
 * theme was active, which this hook has no other way to learn about.
 */
export function useSettings(): {
  settings: Settings | null;
  loading: boolean;
  refetch: () => Promise<void>;
} {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    const value = await settingsGet();
    setSettings(value);
  }, []);

  useEffect(() => {
    let cancelled = false;
    settingsGet()
      .then((value) => {
        if (!cancelled) {
          setSettings(value);
        }
      })
      .catch((error) => {
        // Previously uncaught: a failed fetch left `loading` stuck `true`
        // forever, since nothing downstream of this call ever ran. Every
        // consumer of `useSettings()` - including `profile-list.tsx`, which
        // gates its whole list render on `settings` being non-null - would
        // silently hang rather than surfacing the failure.
        if (!cancelled) {
          toast.error("Couldn't load settings", {
            description: isBackendError(error) ? error.message : undefined,
          });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    const unsubscribe = onSettingsChanged((value) => {
      if (!cancelled) {
        setSettings(value);
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return { settings, loading, refetch };
}
