import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, LoaderCircle } from "lucide-react";
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

const unlockSchema = z.object({
  passphrase: z.string().min(1, "Enter your passphrase"),
});

type UnlockFormValues = z.infer<typeof unlockSchema>;

export function UnlockScreen() {
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
      const message =
        error instanceof Error ? error.message : "Failed to unlock the vault.";
      form.setError("passphrase", { type: "server", message });
      form.setValue("passphrase", "");
    }
  };

  return (
    <div className="flex h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex size-12 items-center justify-center rounded-full bg-muted">
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
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
