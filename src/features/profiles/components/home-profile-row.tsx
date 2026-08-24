import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, LoaderCircle, UserRound } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getEmailText } from "@/features/profiles/mask-email";
import type { Profile } from "@/features/profiles/types";
import type { Settings } from "@/features/settings/types";
import { cn } from "@/lib/utils";

interface HomeProfileRowProps {
  onLaunch: () => Promise<void>;
  profile: Profile;
  /**
   * `null` while settings are still loading (or failed to load) - email
   * display just stays off rather than the row being gated on it, so a
   * settings hiccup can't hide the whole list the way it once did on the
   * Profiles page.
   */
  settings: Settings | null;
}

/**
 * Lean quick-launch row for the Home screen - just drag-to-reorder, status,
 * and Play. Full management (edit/delete/export/import) lives on the
 * Profiles page instead; this intentionally doesn't duplicate that chrome.
 */
export function HomeProfileRow({
  profile,
  onLaunch,
  settings,
}: HomeProfileRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: profile.email });
  const [launching, setLaunching] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleLaunch = async () => {
    setLaunching(true);
    try {
      await onLaunch();
    } finally {
      setLaunching(false);
    }
  };

  const emailText = getEmailText(profile.email, settings);

  return (
    <Card
      className={cn(
        "flex flex-row items-center gap-3 p-3 transition-colors hover:bg-primary/15",
        isDragging && "opacity-50"
      )}
      ref={setNodeRef}
      style={style}
    >
      <button
        aria-label="Drag to reorder"
        className="-m-3 cursor-grab touch-none p-3 text-muted-foreground hover:text-foreground active:cursor-grabbing"
        type="button"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>

      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
        <UserRound className="size-4 text-muted-foreground" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium">{profile.name}</p>
          {profile.status && (
            <Badge className="shrink-0" variant="secondary">
              Running
            </Badge>
          )}
        </div>
        {emailText && (
          <p className="truncate text-muted-foreground text-sm">{emailText}</p>
        )}
      </div>

      <Button
        disabled={launching || profile.status}
        onClick={handleLaunch}
        size="sm"
      >
        {launching ? <LoaderCircle className="size-4 animate-spin" /> : null}
        PLAY
      </Button>
    </Card>
  );
}
