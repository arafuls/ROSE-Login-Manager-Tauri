/** The Home screen's live launch/sync/verify progress bar. */

import { useEffect, useState } from "react";
import { onLaunchStatusChanged } from "@/features/updater/api";
import type { LaunchStatus } from "@/features/updater/types";

/**
 * Always rendered with real content, not hidden when idle: shows "Idle"
 * before anything has ever run, then stays on whatever the last event said
 * (typically "Done" at 100%) once a launch/verify finishes, instead of
 * reverting to a blank placeholder. Real progress, not a guess - the update
 * logic runs in-process (src-tauri/src/rose_update, vendored from
 * rose-updater's own source) instead of shelling out to a separate GUI
 * process, so current/max are the actual chunk-download counters.
 */
export function LaunchStatusBar() {
  const [status, setStatus] = useState<LaunchStatus | null>(null);

  useEffect(() => onLaunchStatusChanged(setStatus), []);

  if (!status) {
    return (
      <div className="space-y-1">
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted" />
        <p className="text-muted-foreground text-xs">Idle</p>
      </div>
    );
  }

  const hasBounds = !!status.max && status.max > 0;
  // While running with no known bounds yet (still fetching metadata), show
  // an indeterminate animation. Finished with no bounds (a throttled skip -
  // nothing needed downloading, so max never left 0) reads as complete, not
  // "still going," so it fills to 100% instead of freezing empty.
  let percent: number | null;
  if (hasBounds) {
    percent = Math.min(
      100,
      Math.round(((status.current ?? 0) / (status.max as number)) * 100)
    );
  } else if (status.running) {
    percent = null;
  } else {
    percent = 100;
  }

  return (
    <div className="space-y-1">
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
        {percent === null ? (
          <div className="h-full w-1/3 animate-[indeterminate_1.2s_ease-in-out_infinite] rounded-full bg-primary" />
        ) : (
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${percent}%` }}
          />
        )}
      </div>
      <p className="text-muted-foreground text-xs">
        {status.stage ?? "Working..."}
        {percent !== null && ` — ${percent}%`}
      </p>
    </div>
  );
}
