/** Settings' "Stay unlocked" confirmation dialog - re-verifies the passphrase before persisting an OS-protected DEK. */

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { VaultError } from "@/features/vault/types";
import { useVault } from "@/features/vault/vault-provider";

const stayUnlockedSchema = z.object({
  passphrase: z.string().min(1, "Enter your passphrase"),
});
type StayUnlockedFormValues = z.infer<typeof stayUnlockedSchema>;

interface StayUnlockedDialogProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

/** Renders the dialog described in the file header. */
export function StayUnlockedDialog({
  open,
  onOpenChange,
}: StayUnlockedDialogProps) {
  const { enableStayUnlocked } = useVault();

  const form = useForm<StayUnlockedFormValues>({
    resolver: zodResolver(stayUnlockedSchema),
    defaultValues: { passphrase: "" },
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: `form` is stable from useForm and intentionally excluded to avoid resetting on every keystroke.
  useEffect(() => {
    if (open) {
      form.reset({ passphrase: "" });
    }
  }, [open]);

  const onSubmit = async (values: StayUnlockedFormValues) => {
    try {
      await enableStayUnlocked(values.passphrase);
      onOpenChange(false);
    } catch (error) {
      if (error instanceof VaultError && error.kind === "wrong_passphrase") {
        form.setError("passphrase", {
          type: "server",
          message: error.message,
        });
        return;
      }
      form.setError("passphrase", {
        type: "server",
        message:
          error instanceof VaultError
            ? error.message
            : "Couldn't enable stay unlocked.",
      });
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Stay unlocked</DialogTitle>
          <DialogDescription>
            Future launches will skip your passphrase entirely. Anyone who can
            log into this account will be able to open your vault without it.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name="passphrase"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Passphrase</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete="current-password"
                      autoFocus
                      type="password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                onClick={() => onOpenChange(false)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={form.formState.isSubmitting} type="submit">
                {form.formState.isSubmitting && (
                  <LoaderCircle className="animate-spin" />
                )}
                Enable
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
