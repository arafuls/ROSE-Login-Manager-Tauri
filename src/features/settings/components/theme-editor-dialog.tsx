import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useEffect } from "react";
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
import { themeSave } from "@/features/themes/api";
import {
  THEME_COLOR_GROUPS,
  type Theme,
  type ThemeColors,
} from "@/features/themes/types";
import { isBackendError } from "@/lib/tauri-errors";
import { cn } from "@/lib/utils";

const ALL_COLOR_KEYS = THEME_COLOR_GROUPS.flatMap((group) =>
  group.fields.map((field) => field.key)
);

// `CSS.supports` is a real WebView2/Chromium API - this catches an invalid
// value (empty string, a typo, anything CSS can't parse as a color) inline,
// before it's ever sent to `theme_save`, rather than corrupting a saved
// theme with a value that would later fail to apply.
const cssColorSchema = z
  .string()
  .trim()
  .min(1, "Required")
  .refine((value) => CSS.supports("color", value), "Enter a valid CSS color");

const colorsShape = Object.fromEntries(
  ALL_COLOR_KEYS.map((key) => [key, cssColorSchema])
) as Record<keyof ThemeColors, typeof cssColorSchema>;

const themeFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  colors: z.object(colorsShape),
});

type ThemeFormValues = z.infer<typeof themeFormSchema>;

export interface ThemeEditorSeed {
  colors: ThemeColors;
  id?: string;
  name: string;
}

interface ThemeEditorDialogProps {
  onOpenChange: (open: boolean) => void;
  onSaved: (theme: Theme) => void;
  open: boolean;
  seed: ThemeEditorSeed | null;
}

/**
 * Create/edit form for a custom theme. Edits are local to this dialog's
 * form state until Save - the real app's CSS variables are never touched
 * here (that's `ThemeApplier`'s job, reacting to the activeThemeId setting
 * after this dialog's caller explicitly activates a theme). Save only
 * persists the theme; it does not activate it, matching this app's
 * "no surprising side effects" convention (an "Edit" on an inactive saved
 * theme, or a "Duplicate," shouldn't silently switch what's currently applied).
 */
export function ThemeEditorDialog({
  open,
  onOpenChange,
  seed,
  onSaved,
}: ThemeEditorDialogProps) {
  const form = useForm<ThemeFormValues>({
    resolver: zodResolver(themeFormSchema),
    defaultValues: { name: "", colors: seed?.colors },
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally re-seeds only when `open`/`seed` change - re-running on every form update would fight the user's in-progress edits.
  useEffect(() => {
    if (open && seed) {
      form.reset({ name: seed.name, colors: seed.colors });
    }
  }, [open, seed]);

  const onSubmit = async (values: ThemeFormValues) => {
    try {
      const saved = await themeSave({
        id: seed?.id,
        name: values.name,
        colors: values.colors,
      });
      toast.success(`Saved "${saved.name}"`);
      onSaved(saved);
      onOpenChange(false);
    } catch (error) {
      toast.error("Couldn't save theme", {
        description: isBackendError(error) ? error.message : undefined,
      });
    }
  };

  const preview = form.watch("colors");

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{seed?.id ? "Edit theme" : "New theme"}</DialogTitle>
          <DialogDescription>
            Choose colors for every part of the app. Changes here only apply
            once saved and selected as the active theme.
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
                    <Input autoFocus placeholder="My theme" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {preview && <ThemePreview colors={preview} />}

            <div className="grid gap-4 sm:grid-cols-2">
              {THEME_COLOR_GROUPS.map((group) => (
                <div
                  className="space-y-3 rounded-lg border p-3"
                  key={group.title}
                >
                  <p className="font-medium text-sm">{group.title}</p>
                  {group.fields.map((colorField) => (
                    <FormField
                      control={form.control}
                      key={colorField.key}
                      name={`colors.${colorField.key}`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-normal text-muted-foreground text-xs">
                            {colorField.label}
                          </FormLabel>
                          <div className="flex gap-2">
                            <FormControl>
                              <Input
                                className="size-9 shrink-0 p-1"
                                onChange={(e) => field.onChange(e.target.value)}
                                type="color"
                                value={toSwatchValue(field.value)}
                              />
                            </FormControl>
                            <FormControl>
                              <Input {...field} className="font-mono text-xs" />
                            </FormControl>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ))}
                </div>
              ))}
            </div>

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
                Save
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

/**
 * `<input type="color">` only accepts a strict `#rrggbb` value - an
 * `oklch(...)` or otherwise-invalid in-progress value is ignored by the
 * browser (falls back to black) rather than throwing, but this keeps the
 * swatch from visibly flashing black while the paired text field holds a
 * non-hex value.
 */
function toSwatchValue(value: string): string {
  return HEX_COLOR_PATTERN.test(value) ? value : "#000000";
}

function ThemePreview({ colors }: { colors: ThemeColors }) {
  return (
    <div
      className="space-y-2 rounded-lg border p-4"
      style={{ background: colors.background, color: colors.foreground }}
    >
      <div
        className="rounded-md border p-3"
        style={{
          background: colors.card,
          color: colors.cardForeground,
          borderColor: colors.border,
        }}
      >
        <p className="font-medium text-sm">Card preview</p>
        <p className="text-xs" style={{ color: colors.mutedForeground }}>
          Muted text on a card surface.
        </p>
        <div className="mt-2 flex gap-2">
          <span
            className={cn("rounded-md px-3 py-1.5 text-sm")}
            style={{
              background: colors.primary,
              color: colors.primaryForeground,
            }}
          >
            Primary
          </span>
          <span
            className={cn("rounded-md px-3 py-1.5 text-sm")}
            style={{
              background: colors.secondary,
              color: colors.secondaryForeground,
            }}
          >
            Secondary
          </span>
          <span
            className={cn("rounded-md px-3 py-1.5 text-sm")}
            style={{ background: colors.destructive, color: "#fff" }}
          >
            Destructive
          </span>
        </div>
      </div>
    </div>
  );
}
