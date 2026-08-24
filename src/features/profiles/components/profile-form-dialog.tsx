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
import { profilesCreate, profilesUpdate } from "@/features/profiles/api";
import type { Profile } from "@/features/profiles/types";
import { ProfileError } from "@/features/profiles/types";
import { isBackendError } from "@/lib/tauri-errors";

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

// Editing allows leaving the password blank to keep it unchanged, matching
// `UpdateProfileInput.password?` in the contract - but if the user does
// type something, it still has to clear the 8-character bar.
const editSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
  password: z
    .string()
    .refine((value) => value.length === 0 || value.length >= 8, {
      message: "Password must be at least 8 characters",
    }),
});

type ProfileFormValues = z.infer<typeof createSchema>;

interface ProfileFormDialogProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  profile?: Profile;
}

export function ProfileFormDialog({
  open,
  onOpenChange,
  profile,
}: ProfileFormDialogProps) {
  const mode = profile ? "edit" : "create";
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(mode === "create" ? createSchema : editSchema),
    defaultValues: { name: "", email: "", password: "" },
  });

  // Reset the form whenever the dialog is (re)opened for a different profile
  // (or a fresh "create"), so stale values/errors don't leak between opens.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `form` is stable from useForm and intentionally excluded to avoid resetting on every keystroke.
  useEffect(() => {
    if (open) {
      form.reset({
        name: profile?.name ?? "",
        email: profile?.email ?? "",
        password: "",
      });
      setShowPassword(false);
    }
  }, [open, profile]);

  const onSubmit = async (values: ProfileFormValues) => {
    try {
      if (mode === "create") {
        await profilesCreate({
          name: values.name,
          email: values.email,
          password: values.password,
        });
        toast.success(`Added ${values.name}`);
      } else if (profile) {
        await profilesUpdate(profile.email, {
          name: values.name,
          email: values.email,
          password: values.password.length > 0 ? values.password : undefined,
        });
        toast.success(`Updated ${values.name}`);
      }
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ProfileError && error.kind === "duplicate_email") {
        // Duplicate-email must be a visible, field-level error - the old
        // app silently swallowed this and just logged it to a file.
        form.setError("email", { type: "server", message: error.message });
        return;
      }
      const message = isBackendError(error)
        ? error.message
        : "Something went wrong.";
      toast.error(
        mode === "create" ? "Couldn't add profile" : "Couldn't update profile",
        {
          description: message,
        }
      );
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Add profile" : "Edit profile"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Add a new saved login profile."
              : `Update details for ${profile?.name}.`}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      autoFocus
                      placeholder="Character or account name"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete="off"
                      placeholder="you@example.com"
                      type="email"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        autoComplete="new-password"
                        placeholder={
                          mode === "edit"
                            ? "Leave blank to keep current password"
                            : "At least 8 characters"
                        }
                        type={showPassword ? "text" : "password"}
                        {...field}
                      />
                      <Button
                        aria-label={
                          showPassword ? "Hide password" : "Show password"
                        }
                        className="absolute top-1/2 right-1 -translate-y-1/2"
                        onClick={() => setShowPassword((v) => !v)}
                        size="icon-sm"
                        tabIndex={-1}
                        type="button"
                        variant="ghost"
                      >
                        {showPassword ? <EyeOff /> : <Eye />}
                      </Button>
                    </div>
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
                {mode === "create" ? "Add profile" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
