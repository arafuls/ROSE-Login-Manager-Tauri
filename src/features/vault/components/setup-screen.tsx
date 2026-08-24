import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, ShieldCheck } from "lucide-react";
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

const setupSchema = z
  .object({
    passphrase: z.string().min(8, "Passphrase must be at least 8 characters"),
    confirmPassphrase: z.string().min(1, "Confirm your passphrase"),
  })
  .refine((data) => data.passphrase === data.confirmPassphrase, {
    message: "Passphrases don't match",
    path: ["confirmPassphrase"],
  });

type SetupFormValues = z.infer<typeof setupSchema>;

export function SetupScreen() {
  const { setup } = useVault();
  const form = useForm<SetupFormValues>({
    resolver: zodResolver(setupSchema),
    defaultValues: { passphrase: "", confirmPassphrase: "" },
  });

  const onSubmit = async (values: SetupFormValues) => {
    try {
      await setup(values.passphrase);
    } catch (error) {
      const message = isBackendError(error)
        ? error.message
        : "Failed to set up the vault.";
      form.setError("root", { type: "server", message });
    }
  };

  return (
    <div className="flex h-full items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-muted">
            <ShieldCheck className="size-6" />
          </div>
          <CardTitle>Set up your vault</CardTitle>
          <CardDescription>
            Choose a passphrase to encrypt your saved profiles. This replaces
            hardware-derived keys from the old app, so it works across machines
            and survives hardware changes - remember it, it can't be recovered.
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
                        autoComplete="new-password"
                        autoFocus
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
                    <FormLabel>Confirm passphrase</FormLabel>
                    <FormControl>
                      <Input
                        autoComplete="new-password"
                        placeholder="Re-enter your passphrase"
                        type="password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {form.formState.errors.root && (
                <p className="text-destructive text-sm">
                  {form.formState.errors.root.message}
                </p>
              )}
              <Button
                className="w-full"
                disabled={form.formState.isSubmitting}
                type="submit"
              >
                {form.formState.isSubmitting ? (
                  <>
                    <LoaderCircle className="animate-spin" />
                    Setting up...
                  </>
                ) : (
                  "Create vault"
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
