import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
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

const changePassphraseSchema = z
  .object({
    currentPassphrase: z.string().min(1, "Enter your current passphrase"),
    newPassphrase: z
      .string()
      .min(8, "Passphrase must be at least 8 characters"),
    confirmPassphrase: z.string().min(1, "Confirm your new passphrase"),
  })
  .refine((data) => data.newPassphrase === data.confirmPassphrase, {
    message: "Passphrases don't match",
    path: ["confirmPassphrase"],
  });

type ChangePassphraseFormValues = z.infer<typeof changePassphraseSchema>;

interface ChangePassphraseDialogProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function ChangePassphraseDialog({
  open,
  onOpenChange,
}: ChangePassphraseDialogProps) {
  const { changePassphrase } = useVault();
  const [showPasswords, setShowPasswords] = useState(false);

  const form = useForm<ChangePassphraseFormValues>({
    resolver: zodResolver(changePassphraseSchema),
    defaultValues: {
      currentPassphrase: "",
      newPassphrase: "",
      confirmPassphrase: "",
    },
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: `form` is stable from useForm and intentionally excluded to avoid resetting on every keystroke.
  useEffect(() => {
    if (open) {
      form.reset({
        currentPassphrase: "",
        newPassphrase: "",
        confirmPassphrase: "",
      });
      setShowPasswords(false);
    }
  }, [open]);

  const onSubmit = async (values: ChangePassphraseFormValues) => {
    try {
      await changePassphrase(values.currentPassphrase, values.newPassphrase);
      toast.success("Passphrase changed");
      onOpenChange(false);
    } catch (error) {
      // Wrong current passphrase must be visible inline, same principle as
      // the unlock screen's own wrong-passphrase handling - not a silent
      // no-op, and not a generic toast that leaves the user guessing which
      // field was the problem.
      if (error instanceof VaultError && error.kind === "wrong_passphrase") {
        form.setError("currentPassphrase", {
          type: "server",
          message: error.message,
        });
        return;
      }
      toast.error("Couldn't change passphrase", {
        description: error instanceof VaultError ? error.message : undefined,
      });
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change passphrase</DialogTitle>
          <DialogDescription>
            Your saved profiles stay exactly as they are - only the passphrase
            that unlocks them changes. Your recovery key keeps working
            afterward.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name="currentPassphrase"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Current passphrase</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete="current-password"
                      autoFocus
                      type={showPasswords ? "text" : "password"}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="newPassphrase"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New passphrase</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        autoComplete="new-password"
                        placeholder="At least 8 characters"
                        type={showPasswords ? "text" : "password"}
                        {...field}
                      />
                      <Button
                        aria-label={
                          showPasswords
                            ? "Hide passphrases"
                            : "Show passphrases"
                        }
                        className="absolute top-1/2 right-1 -translate-y-1/2"
                        onClick={() => setShowPasswords((v) => !v)}
                        size="icon-sm"
                        tabIndex={-1}
                        type="button"
                        variant="ghost"
                      >
                        {showPasswords ? <EyeOff /> : <Eye />}
                      </Button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmPassphrase"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm new passphrase</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete="new-password"
                      type={showPasswords ? "text" : "password"}
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
                Change passphrase
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
