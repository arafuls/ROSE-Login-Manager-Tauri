import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, LoaderCircle, Play, UserRound } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Profile } from "@/features/profiles/types";
import { cn } from "@/lib/utils";

interface HomeProfileRowProps {
  onLaunch: () => Promise<void>;
  profile: Profile;
}

/**
 * Lean quick-launch row for the Home screen - just drag-to-reorder, status,
 * and Play. Full management (edit/delete/export/import) lives on the
 * Profiles page instead; this intentionally doesn't duplicate that chrome.
 */
export function HomeProfileRow({ profile, onLaunch }: HomeProfileRowProps) {
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

  return (
    <Card
      className={cn(
        "flex flex-row items-center gap-3 p-3",
        isDragging && "opacity-50"
      )}
      ref={setNodeRef}
      style={style}
    >
      <button
        aria-label="Drag to reorder"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
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
      </div>

      <Button
        disabled={launching || profile.status}
        onClick={handleLaunch}
        size="sm"
      >
        {launching ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : (
          <Play className="size-4" />
        )}
        Play
      </Button>
    </Card>
  );
}
