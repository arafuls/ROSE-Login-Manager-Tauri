/**
 * Adjusts window min-size based on the Home screen's News panel visibility.
 */

import { LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect } from "react";
import { useSettings } from "@/features/settings/use-settings";

const appWindow = getCurrentWindow();

// WIDTH_WITHOUT_NEWS must match tauri.conf.json minWidth so early session-restore
// doesn't clamp smaller saved sizes before this effect runs.
const WIDTH_WITH_NEWS = 900;
const WIDTH_WITHOUT_NEWS = 550;
const MIN_HEIGHT = 600;

/** Headless component mounted in `AppProvider`. */
export function WindowSizeApplier() {
  const { settings, loading } = useSettings();

  useEffect(() => {
    // Wait for settings to load; applying fallback defaults early causes permanent
    // window growth since this effect only expands, never shrinks.
    if (loading) {
      return;
    }
    const showNews = settings?.showNewsPanel ?? true;
    const width = showNews ? WIDTH_WITH_NEWS : WIDTH_WITHOUT_NEWS;

    (async () => {
      await appWindow.setMinSize(new LogicalSize(width, MIN_HEIGHT));

      // setMinSize doesn't auto-expand windows smaller than the new minimum;
      // explicitly grow dimensions if currently below threshold.
      const [scaleFactor, innerSize] = await Promise.all([
        appWindow.scaleFactor(),
        appWindow.innerSize(),
      ]);
      const current = innerSize.toLogical(scaleFactor);
      if (current.width < width || current.height < MIN_HEIGHT) {
        await appWindow.setSize(
          new LogicalSize(
            Math.max(current.width, width),
            Math.max(current.height, MIN_HEIGHT)
          )
        );
      }
    })();
  }, [loading, settings?.showNewsPanel]);

  return null;
}
