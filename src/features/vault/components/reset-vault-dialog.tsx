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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useVault } from "@/features/vault/vault-provider";
import { isBackendError } from "@/lib/tauri-errors";

const CONFIRMATION_PHRASE = "RESET";

interface ResetVaultDialogProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

/**
 * Last-resort escape hatch when both the passphrase and the recovery key
 * are lost. This permanently deletes every saved profile with no undo, so
 * unlike the profile delete confirmation (a click), this requires typing a
 * confirmation phrase - the stakes here are the whole vault, not one profile.
 */
export function ResetVaultDialog({
  open,
  onOpenChange,
}: ResetVaultDialogProps) {
  const { reset } = useVault();
  const [confirmation, setConfirmation] = useState("");
  const [resetting, setResetting] = useState(false);

  const canConfirm = confirmation.trim().toUpperCase() === CONFIRMATION_PHRASE;

  const handleReset = async () => {
    setResetting(true);
    try {
      await reset();
    } catch (error) {
      toast.error("Couldn't reset the vault", {
        description: isBackendError(error) ? error.message : undefined,
      });
      setResetting(false);
    }
  };

  return (
    <AlertDialog
      onOpenChange={(next) => {
        if (!next) {
          setConfirmation("");
        }
        onOpenChange(next);
      }}
      open={open}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reset your vault?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes every saved profile. There is no undo, and
            no way to recover them afterward - only do this if you've lost both
            your passphrase and your recovery key.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2">
          <Label htmlFor="reset-confirmation">
            Type {CONFIRMATION_PHRASE} to confirm
          </Label>
          <Input
            autoComplete="off"
            id="reset-confirmation"
            onChange={(e) => setConfirmation(e.target.value)}
            value={confirmation}
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={resetting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={!canConfirm || resetting}
            onClick={(e) => {
              e.preventDefault();
              handleReset();
            }}
            variant="destructive"
          >
            {resetting && <LoaderCircle className="animate-spin" />}
            Reset vault
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
