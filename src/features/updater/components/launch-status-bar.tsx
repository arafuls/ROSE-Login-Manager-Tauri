import { useEffect, useState } from "react";
import { onLaunchStatusChanged } from "@/features/updater/api";
import type { LaunchContext } from "@/features/updater/types";

const LABELS: Record<LaunchContext, string> = {
  default: "Launching ROSE Online...",
  profile: "Launching ROSE Online...",
  verify: "Verifying game files...",
};

/**
 * Reflects "a launch/update process is currently alive," not real download
 * progress - rose-updater's own progress-reporting format isn't verified
 * yet (see src-tauri/src/updater.rs), so this is an honest indeterminate
 * bar rather than a fake percentage.
 */
export function LaunchStatusBar() {
  const [active, setActive] = useState<Set<LaunchContext>>(new Set());

  useEffect(
    () =>
      onLaunchStatusChanged(({ context, running }) => {
        setActive((prev) => {
          const next = new Set(prev);
          if (running) {
            next.add(context);
          } else {
            next.delete(context);
          }
          return next;
        });
      }),
    []
  );

  if (active.size === 0) {
    return <div className="h-1 w-full" />;
  }

  const label = LABELS[active.values().next().value as LaunchContext];

  return (
    <div className="space-y-1">
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full w-1/3 animate-[indeterminate_1.2s_ease-in-out_infinite] rounded-full bg-primary" />
      </div>
      <p className="text-muted-foreground text-xs">{label}</p>
    </div>
  );
}
