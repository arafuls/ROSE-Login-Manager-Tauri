import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
import { profilesImport } from "@/features/profiles/api";
import type { ExportBundle, ImportResult } from "@/features/profiles/types";

const importSchema = z.object({
  exportPassword: z.string().min(1, "Enter the export password"),
});

async function parseExportFile(file: File): Promise<ExportBundle> {
  const text = await file.text();
  return JSON.parse(text);
}

function notifyImportResult(result: ImportResult): void {
  if (result.imported > 0) {
    toast.success(
      `Imported ${result.imported} profile${result.imported === 1 ? "" : "s"}`
    );
  }
  if (result.skipped.length > 0) {
    toast.warning(
      `Skipped ${result.skipped.length} profile${result.skipped.length === 1 ? "" : "s"} (email already exists)`,
      { description: result.skipped.join(", ") }
    );
  }
  if (result.imported === 0 && result.skipped.length === 0) {
    toast.info("Nothing to import");
  }
}

type ImportFormValues = z.infer<typeof importSchema>;

interface ImportDialogProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function ImportDialog({ open, onOpenChange }: ImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<ImportFormValues>({
    resolver: zodResolver(importSchema),
    defaultValues: { exportPassword: "" },
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally only reacts to `open` - `form` is stable from useForm.
  useEffect(() => {
    if (open) {
      setFile(null);
      setFileError(null);
      form.reset({ exportPassword: "" });
    }
  }, [open]);

  const onSubmit = async (values: ImportFormValues) => {
    if (!file) {
      setFileError("Choose an export file to import");
      return;
    }
    setFileError(null);

    let bundle: ExportBundle;
    try {
      bundle = await parseExportFile(file);
    } catch {
      setFileError("That file isn't a valid export bundle");
      return;
    }

    try {
      const result = await profilesImport(bundle, values.exportPassword);
      notifyImportResult(result);
      onOpenChange(false);
    } catch (error) {
      // Wrong export password or a corrupted bundle must be visible inline,
      // not swallowed - same principle as the duplicate-email fix.
      form.setError("exportPassword", {
        type: "server",
        message: error instanceof Error ? error.message : "Import failed.",
      });
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import profiles</DialogTitle>
          <DialogDescription>
            Choose an export file and enter the password it was protected with.
            Profiles whose email already exists locally are skipped, never
            overwritten.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <div className="space-y-2">
              <Button
                className="w-full justify-start"
                onClick={() => fileInputRef.current?.click()}
                type="button"
                variant="outline"
              >
                <Upload className="size-4" />
                {file ? file.name : "Choose export file..."}
              </Button>
              <input
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setFileError(null);
                }}
                ref={fileInputRef}
                type="file"
              />
              {fileError && (
                <p className="text-destructive text-sm">{fileError}</p>
              )}
            </div>

            <FormField
              control={form.control}
              name="exportPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Export password</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Password used at export time"
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
                Import
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
