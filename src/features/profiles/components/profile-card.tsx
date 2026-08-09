import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { maskEmail } from "@/features/profiles/mask-email";
import type { Profile } from "@/features/profiles/types";
import type { Settings } from "@/features/settings/types";
import { cn } from "@/lib/utils";

interface ProfileCardProps {
  onDelete: () => void;
  onEdit: () => void;
  onSelectedChange?: (selected: boolean) => void;
  profile: Profile;
  selectable?: boolean;
  selected?: boolean;
  settings: Settings;
}

export function ProfileCard({
  profile,
  settings,
  selectable = false,
  selected = false,
  onSelectedChange,
  onEdit,
  onDelete,
}: ProfileCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: profile.email });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const emailText = getEmailText(profile.email, settings);

  return (
    <Card
      className={cn(
        "flex flex-row items-center gap-3 p-3",
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
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
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

function getEmailText(email: string, settings: Settings): string | null {
  if (!settings.displayEmail) {
    return null;
  }
  return settings.maskEmail ? maskEmail(email) : email;
}
