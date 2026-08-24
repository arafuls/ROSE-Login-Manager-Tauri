/**
 * Renders a single saved profile as a row in the Profiles page's list
 * (see profile-list.tsx, which owns drag-reorder state and the delete
 * confirmation flow this component's buttons trigger).
 */

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, LoaderCircle, Pencil, Play, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { getEmailText } from "@/features/profiles/mask-email";
import type { Profile } from "@/features/profiles/types";
import type { Settings } from "@/features/settings/types";
import { cn } from "@/lib/utils";

interface ProfileCardProps {
  onDelete: () => void;
  onEdit: () => void;
  onLaunch: () => Promise<void>;
  onSelectedChange?: (selected: boolean) => void;
  profile: Profile;
  selectable?: boolean;
  selected?: boolean;
  settings: Settings;
}

/**
 * One draggable, actionable row - status dot, name/email (respecting
 * displayEmail/maskEmail), and launch/edit/delete controls for a single
 * saved login.
 */
export function ProfileCard({
  profile,
  settings,
  selectable = false,
  selected = false,
  onSelectedChange,
  onEdit,
  onDelete,
  onLaunch,
}: ProfileCardProps) {
  const [launching, setLaunching] = useState(false);

  const handleLaunch = async () => {
    setLaunching(true);
    try {
      await onLaunch();
    } finally {
      setLaunching(false);
    }
  };
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: profile.email });

  // dnd-kit requires the drag transform/transition applied as an inline
  // style on the sortable element itself - it can't be expressed as a
  // Tailwind class since the values are computed per-drag, not static.
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
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
      {selectable && (
        <Checkbox
          aria-label={`Select ${profile.name}`}
          checked={selected}
          onCheckedChange={(checked) => onSelectedChange?.(checked === true)}
        />
      )}

      <button
        aria-label="Drag to reorder"
        className="-m-3 cursor-grab touch-none p-3 text-muted-foreground hover:text-foreground active:cursor-grabbing"
        type="button"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>

      <span
        aria-label={profile.status ? "Client running" : "Client not running"}
        className={cn(
          "size-2.5 shrink-0 rounded-full",
          profile.status ? "bg-emerald-500" : "bg-muted-foreground/40"
        )}
        role="img"
        title={profile.status ? "Client running" : "Client not running"}
      />

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

      <div className="flex shrink-0 items-center gap-1">
        <Button
          aria-label="Launch client"
          disabled={launching || profile.status}
          onClick={handleLaunch}
          size="icon-sm"
          title={profile.status ? "Already running" : "Launch"}
          variant="ghost"
        >
          {launching ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Play className="size-4" />
          )}
        </Button>
        <Button
          aria-label="Edit profile"
          onClick={onEdit}
          size="icon-sm"
          variant="ghost"
        >
          <Pencil className="size-4" />
        </Button>
        <Button
          aria-label="Delete profile"
          onClick={onDelete}
          size="icon-sm"
          variant="ghost"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </Card>
  );
}
