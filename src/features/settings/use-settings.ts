import { useEffect, useState } from "react";
import { onSettingsChanged, settingsGet } from "./api";
import type { Settings } from "./types";

/**
 * Read-only live view of settings, shared by the settings page (which also
 * writes via `settingsUpdate`) and anything else that needs to react to
 * them, e.g. the profile list respecting `displayEmail` / `maskEmail`.
 */
export function useSettings(): { settings: Settings | null; loading: boolean } {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    settingsGet().then((value) => {
      if (!cancelled) {
        setSettings(value);
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

  return { settings, loading };
}
