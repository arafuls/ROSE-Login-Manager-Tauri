import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { profilesExport } from "@/features/profiles/api";
import type { Profile } from "@/features/profiles/types";

const exportSchema = z.object({
  exportPassword: z
    .string()
    .min(8, "Export password must be at least 8 characters"),
});

type ExportFormValues = z.infer<typeof exportSchema>;

interface ExportDialogProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  profiles: Profile[];
}

export function ExportDialog({
  open,
  onOpenChange,
  profiles,
}: ExportDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const form = useForm<ExportFormValues>({
    resolver: zodResolver(exportSchema),
    defaultValues: { exportPassword: "" },
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally re-seeds only when `open` changes, using whatever `profiles`/`form` are current at that moment - re-running on every `profiles` update would wipe the user's in-progress selection.
  useEffect(() => {
    if (open) {
      setSelected(new Set(profiles.map((p) => p.email)));
      form.reset({ exportPassword: "" });
    }
  }, [open]);

  const toggle = (email: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(email);
      } else {
        next.delete(email);
      }
      return next;
    });
  };

  const onSubmit = async (values: ExportFormValues) => {
    if (selected.size === 0) {
      toast.error("Select at least one profile to export");
      return;
    }
    try {
      const bundle = await profilesExport(
        Array.from(selected),
        values.exportPassword
      );
      downloadBundle(bundle);
      toast.success(
        `Exported ${selected.size} profile${selected.size === 1 ? "" : "s"}`
      );
      onOpenChange(false);
    } catch (error) {
      toast.error("Export failed", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export profiles</DialogTitle>
          <DialogDescription>
            Choose which profiles to export and set a password to protect the
            export file. You'll need this password to import it elsewhere.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border p-2">
          {profiles.length === 0 && (
            <p className="p-2 text-muted-foreground text-sm">
              No profiles to export.
            </p>
          )}
          {profiles.map((profile) => (
            <label
              className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-accent"
              htmlFor={`export-${profile.email}`}
              key={profile.email}
            >
              <Checkbox
                checked={selected.has(profile.email)}
                id={`export-${profile.email}`}
                onCheckedChange={(checked) =>
                  toggle(profile.email, checked === true)
                }
              />
              <span className="text-sm">
                {profile.name}{" "}
                <span className="text-muted-foreground">({profile.email})</span>
              </span>
            </label>
          ))}
        </div>

        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name="exportPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Export password</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="At least 8 characters"
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
                Export
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function downloadBundle(bundle: { version: number; ciphertext: string }): void {
  // DEVIATION: the real app will use a native save dialog
  // (`@tauri-apps/plugin-dialog` + `@tauri-apps/plugin-fs`) to write the
  // file to disk. That plugin isn't wired up yet and has no equivalent in a
  // plain browser preview, so this mock triggers a normal browser file
  // download instead - the `ExportBundle` shape/content is identical either
  // way, only the "how it reaches disk" part differs.
  const blob = new Blob([JSON.stringify(bundle, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "rose-profiles-export.json";
  a.click();
  URL.revokeObjectURL(url);
}
