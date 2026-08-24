/** The locked-vault screen: unlock with a passphrase, or switch to recovery-key mode. */

import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useVault } from "@/features/vault/vault-provider";
import { isBackendError } from "@/lib/tauri-errors";
import { ResetVaultDialog } from "./reset-vault-dialog";

const unlockSchema = z.object({
  passphrase: z.string().min(1, "Enter your passphrase"),
});
type UnlockFormValues = z.infer<typeof unlockSchema>;

const recoverSchema = z
  .object({
    recoveryKey: z.string().min(1, "Enter your recovery key"),
    newPassphrase: z
      .string()
      .min(8, "Passphrase must be at least 8 characters"),
    confirmPassphrase: z.string().min(1, "Confirm your new passphrase"),
  })
  .refine((data) => data.newPassphrase === data.confirmPassphrase, {
    message: "Passphrases don't match",
    path: ["confirmPassphrase"],
  });
type RecoverFormValues = z.infer<typeof recoverSchema>;

/** Switches between the unlock form and the recovery form described in the file header. */
export function UnlockScreen() {
  const [mode, setMode] = useState<"unlock" | "recover">("unlock");
  const [resetOpen, setResetOpen] = useState(false);

  return (
    <div className="flex h-full items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        {mode === "unlock" ? (
          <UnlockForm onForgotPassphrase={() => setMode("recover")} />
        ) : (
          <RecoverForm
            onBack={() => setMode("unlock")}
            onLostRecoveryKey={() => setResetOpen(true)}
          />
        )}
      </Card>
      <ResetVaultDialog onOpenChange={setResetOpen} open={resetOpen} />
    </div>
  );
}

/** The passphrase-unlock form. */
function UnlockForm({
  onForgotPassphrase,
}: {
  onForgotPassphrase: () => void;
}) {
  const { unlock } = useVault();
  const form = useForm<UnlockFormValues>({
    resolver: zodResolver(unlockSchema),
    defaultValues: { passphrase: "" },
  });

  const onSubmit = async (values: UnlockFormValues) => {
    try {
      await unlock(values.passphrase);
    } catch (error) {
      // Wrong-passphrase (or any other unlock failure) MUST be visible to
      // the user, not a silent no-op - this is one of the two UX bugs from
      // the old app's design review that we are explicitly fixing.
      const message = isBackendError(error)
        ? error.message
        : "Failed to unlock the vault.";
      form.setError("passphrase", { type: "server", message });
      form.setValue("passphrase", "");
    }
  };

  return (
    <>
      <CardHeader className="items-center text-center">
        <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-muted">
          <KeyRound className="size-6" />
        </div>
        <CardTitle>Unlock your vault</CardTitle>
        <CardDescription>
          Enter your passphrase to access your saved profiles.
        </CardDescription>
      </CardHeader>
      <CardContent>
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
                      placeholder="Enter your passphrase"
                      type="password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              className="w-full"
              disabled={form.formState.isSubmitting}
              type="submit"
            >
              {form.formState.isSubmitting ? (
                <>
                  <LoaderCircle className="animate-spin" />
                  Unlocking...
                </>
              ) : (
                "Unlock"
              )}
            </Button>
            <button
              className="w-full text-center text-muted-foreground text-sm hover:text-foreground"
              onClick={onForgotPassphrase}
              type="button"
            >
              Forgot your passphrase?
            </button>
          </form>
        </Form>
      </CardContent>
    </>
  );
}

/** The recovery-key + new-passphrase form. */
function RecoverForm({
  onBack,
  onLostRecoveryKey,
}: {
  onBack: () => void;
  onLostRecoveryKey: () => void;
}) {
  const { recover } = useVault();
  const form = useForm<RecoverFormValues>({
    resolver: zodResolver(recoverSchema),
    defaultValues: {
      recoveryKey: "",
      newPassphrase: "",
      confirmPassphrase: "",
    },
  });

  const onSubmit = async (values: RecoverFormValues) => {
    try {
      await recover(values.recoveryKey, values.newPassphrase);
    } catch (error) {
      const message = isBackendError(error)
        ? error.message
        : "Recovery failed.";
      form.setError("recoveryKey", { type: "server", message });
    }
  };

  return (
    <>
      <CardHeader className="items-center text-center">
        <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-muted">
          <KeyRound className="size-6" />
        </div>
        <CardTitle>Recover your vault</CardTitle>
        <CardDescription>
          Enter your recovery key and choose a new passphrase.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name="recoveryKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Recovery key</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete="off"
                      autoFocus
                      placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
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
                    <Input
                      autoComplete="new-password"
                      placeholder="At least 8 characters"
                      type="password"
                      {...field}
                    />
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
                      type="password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              className="w-full"
              disabled={form.formState.isSubmitting}
              type="submit"
            >
              {form.formState.isSubmitting ? (
                <>
                  <LoaderCircle className="animate-spin" />
                  Recovering...
                </>
              ) : (
                "Recover vault"
              )}
            </Button>
            <div className="flex justify-between text-sm">
              <button
                className="text-muted-foreground hover:text-foreground"
                onClick={onBack}
                type="button"
              >
                Back to unlock
              </button>
              <button
                className="text-muted-foreground hover:text-foreground"
                onClick={onLostRecoveryKey}
                type="button"
              >
                Lost your recovery key too?
              </button>
            </div>
          </form>
        </Form>
      </CardContent>
    </>
  );
}
