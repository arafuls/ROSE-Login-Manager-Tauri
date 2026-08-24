/** Dialog for importing a password-protected profile export bundle. */

import { zodResolver } from "@hookform/resolvers/zod";
import { downloadDir } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { LoaderCircle, Upload } from "lucide-react";
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
import {
  profilesImport,
  profilesReadExportFile,
} from "@/features/profiles/api";
import type { ExportBundle, ImportResult } from "@/features/profiles/types";
import { isBackendError } from "@/lib/tauri-errors";

const importSchema = z.object({
  exportPassword: z.string().min(1, "Enter the export password"),
});

interface PickedFile {
  name: string;
  path: string;
}

const PATH_SEPARATOR = /[/\\]/;

/**
 * Opens a native "Open File" dialog defaulting to the OS Downloads folder -
 * where export-dialog.tsx's downloadBundle() currently sends every export,
 * since it doesn't offer a save-location picker yet. If that ever changes,
 * this default should track wherever exports actually land.
 */
async function pickExportFile(): Promise<PickedFile | null> {
  const selected = await open({
    defaultPath: await downloadDir(),
    filters: [{ extensions: ["json"], name: "ROSE export" }],
  });
  if (!selected) {
    return null;
  }
  const path = Array.isArray(selected) ? selected[0] : selected;
  const name = path.split(PATH_SEPARATOR).pop() ?? path;
  return { name, path };
}

/** Reads and parses the picked file's contents as an `ExportBundle`. */
async function parseExportFile(file: PickedFile): Promise<ExportBundle> {
  const text = await profilesReadExportFile(file.path);
  return JSON.parse(text);
}

/** Toasts a summary of what an import actually did. */
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

/** Renders the dialog described in the file header. */
export function ImportDialog({
  open: dialogOpen,
  onOpenChange,
}: ImportDialogProps) {
  const [file, setFile] = useState<PickedFile | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  const form = useForm<ImportFormValues>({
    resolver: zodResolver(importSchema),
    defaultValues: { exportPassword: "" },
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally only reacts to `dialogOpen` - `form` is stable from useForm.
  useEffect(() => {
    if (dialogOpen) {
      setFile(null);
      setFileError(null);
      form.reset({ exportPassword: "" });
    }
  }, [dialogOpen]);

  const handlePickFile = async () => {
    setPicking(true);
    try {
      const picked = await pickExportFile();
      if (picked) {
        setFile(picked);
        setFileError(null);
        // Move straight to the next thing the user needs to type, rather
        // than making them click into the password field themselves.
        form.setFocus("exportPassword");
      }
    } catch (error) {
      setFileError(
        isBackendError(error) ? error.message : "Couldn't open that file."
      );
    } finally {
      setPicking(false);
    }
  };

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
        message: isBackendError(error) ? error.message : "Import failed.",
      });
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={dialogOpen}>
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
                disabled={picking}
                onClick={handlePickFile}
                type="button"
                variant="outline"
              >
                {picking ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Upload className="size-4" />
                )}
                {file ? file.name : "Choose export file..."}
              </Button>
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
