/**
 * Keeps the window's minimum size in sync with whether the Home screen's
 * News panel is shown - lets the window get visibly narrower when the
 * panel is off, instead of always reserving space for a column that isn't
 * there.
 */

import { LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect } from "react";
import { useSettings } from "@/features/settings/use-settings";

const appWindow = getCurrentWindow();

// WIDTH_WITH_NEWS matches tauri.conf.json's own static minWidth, so the
// common case (news on, matching the shipped default) never actually
// changes the window's constraint - only turning news off narrows it.
const WIDTH_WITH_NEWS = 900;
const WIDTH_WITHOUT_NEWS = 550;
const MIN_HEIGHT = 600;

/** Renders nothing - mounted once in `AppProvider`, alongside `ThemeApplier`. */
export function WindowSizeApplier() {
  const { settings } = useSettings();

  useEffect(() => {
    const showNews = settings?.showNewsPanel ?? true;
    const width = showNews ? WIDTH_WITH_NEWS : WIDTH_WITHOUT_NEWS;

    (async () => {
      await appWindow.setMinSize(new LogicalSize(width, MIN_HEIGHT));

      // setMinSize only constrains future resizes - it doesn't grow a
      // window that's already smaller than the new minimum (e.g. the user
      // shrank it while news was off, then turned news back on), so that
      // case needs an explicit check-and-grow here. Never shrinks the
      // window; only grows whichever dimension is now under its minimum.
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
  }, [settings?.showNewsPanel]);

  return null;
}
