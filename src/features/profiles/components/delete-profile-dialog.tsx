/** Confirmation dialog gating every profile delete. */

import { LoaderCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { profilesDelete } from "@/features/profiles/api";
import type { Profile } from "@/features/profiles/types";
import { isBackendError } from "@/lib/tauri-errors";

interface DeleteProfileDialogProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  profile: Profile | null;
}

/**
 * The old app deleted a profile on a single click with zero confirmation.
 * This dialog is the fix - every delete goes through here.
 */
export function DeleteProfileDialog({
  open,
  onOpenChange,
  profile,
}: DeleteProfileDialogProps) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!profile) {
      return;
    }
    setDeleting(true);
    try {
      await profilesDelete(profile.email);
      toast.success(`Deleted ${profile.name}`);
      onOpenChange(false);
    } catch (error) {
      toast.error("Couldn't delete profile", {
        description: isBackendError(error) ? error.message : undefined,
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this profile?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete the saved credentials for{" "}
            <span className="font-medium text-foreground">{profile?.name}</span>{" "}
            ({profile?.email}). This can't be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={deleting}
            onClick={(e) => {
              e.preventDefault();
              handleDelete();
            }}
            variant="destructive"
          >
            {deleting && <LoaderCircle className="animate-spin" />}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
