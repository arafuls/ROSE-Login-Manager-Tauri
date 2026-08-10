import { useEffect, useState } from "react";
import { onLaunchStatusChanged } from "@/features/updater/api";
import type { LaunchStatus } from "@/features/updater/types";

/**
 * Real progress now - the update logic runs in-process (see
 * src-tauri/src/rose_update, vendored from rose-updater's own source)
 * instead of shelling out to a separate GUI process, so current/max here
 * are the actual chunk-download counters, not a guess.
 */
export function LaunchStatusBar() {
  const [status, setStatus] = useState<LaunchStatus | null>(null);

  useEffect(
    () =>
      onLaunchStatusChanged((next) => {
        setStatus(next.running ? next : null);
      }),
    []
  );

  if (!status) {
    return <div className="h-1 w-full" />;
  }

  const hasBounds = !!status.max && status.max > 0;
  const percent = hasBounds
    ? Math.min(
        100,
        Math.round(((status.current ?? 0) / (status.max as number)) * 100)
      )
    : null;

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
