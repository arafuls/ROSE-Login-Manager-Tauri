/** Drag-and-drop reorder logic shared by every profile list in the app. */

import {
  closestCenter,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  restrictToParentElement,
  restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useState } from "react";
import { toast } from "sonner";
import { isBackendError } from "@/lib/tauri-errors";
import { profilesReorder } from "./api";
import type { Profile } from "./types";

/**
 * Shared drag-reorder behavior for any profile list (the full management
 * list and the lean Home quick-launch list both use this) - extracted so
 * the optimistic-update-then-rollback-on-error logic only exists once.
 */
export function useProfileReorder(
  profiles: Profile[],
  refetch: () => Promise<void>
) {
  const [orderedEmails, setOrderedEmails] = useState<string[] | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // While a reorder is in flight we show the optimistic local order instead
  // of whatever the last fetch returned, so the list doesn't jump back and
  // forth before the round-trip resolves.
  const displayedProfiles = orderedEmails
    ? orderedEmails
        .map((email) => profiles.find((p) => p.email === email))
        .filter((p): p is Profile => p !== undefined)
    : profiles;

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    const currentOrder = displayedProfiles.map((p) => p.email);
    const oldIndex = currentOrder.indexOf(String(active.id));
    const newIndex = currentOrder.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) {
      return;
    }
    const next = arrayMove(currentOrder, oldIndex, newIndex);
    setOrderedEmails(next);
    try {
      await profilesReorder(next);
    } catch (error) {
      toast.error("Couldn't save the new order", {
        description: isBackendError(error) ? error.message : undefined,
      });
      await refetch();
    } finally {
      setOrderedEmails(null);
    }
  };

  return {
    displayedProfiles,
    sensors,
    collisionDetection: closestCenter,
    handleDragEnd,
    // Both consumers render a single vertical column (verticalListSortingStrategy),
    // but dnd-kit's default drag transform follows the pointer on both axes -
    // any diagonal pointer movement drags the item sideways too, which can push
    // a scrollable ancestor into horizontal overflow and visibly shove the rest
    // of the list over. Restricting to the vertical axis (and keeping the item
    // within its list container) matches the layout these are actually used in.
    modifiers: [restrictToVerticalAxis, restrictToParentElement],
  };
}
