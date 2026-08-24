import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, UserRound } from "lucide-react";
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

            <div className="grid gap-4 sm:grid-cols-2">
              {THEME_COLOR_GROUPS.map((group) => (
                <div
                  className="space-y-3 rounded-lg border p-3"
                  key={group.title}
                >
                  <p className="font-medium text-sm">{group.title}</p>
                  {preview && (
                    <GroupPreview colors={preview} title={group.title} />
                  )}
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

/**
 * Replaces the old single preview card at the top of the form - it scrolled
 * out of view alongside the fields it was meant to demonstrate, defeating
 * the point. Each color group instead gets its own small demo, scoped to
 * exactly what that group's fields affect, so it stays visible right next
 * to the inputs being edited.
 */
function GroupPreview({
  colors,
  title,
}: {
  colors: ThemeColors;
  title: string;
}) {
  switch (title) {
    case "Base":
      return (
        <div
          className="rounded-md border p-3 text-sm"
          style={{
            background: colors.background,
            borderColor: colors.border,
            color: colors.foreground,
          }}
        >
          Sample text on background
        </div>
      );
    case "Surfaces":
      return (
        <div
          className="space-y-2 rounded-md border p-3"
          style={{ background: colors.background, borderColor: colors.border }}
        >
          <ProfileCardReference colors={colors} />
          <NewsCardReference colors={colors} />
          <span
            className="inline-block rounded-md border px-2 py-1 text-xs"
            style={{
              background: colors.popover,
              borderColor: colors.border,
              color: colors.popoverForeground,
            }}
          >
            Popover
          </span>
        </div>
      );
    case "Accent":
      return (
        <div
          className="rounded-md px-3 py-2 text-sm"
          style={{ background: colors.accent, color: colors.accentForeground }}
        >
          Highlighted / hovered item
        </div>
      );
    case "Brand":
      return (
        <div className="flex items-center gap-2">
          <span
            className="rounded-md px-3 py-1.5 text-sm"
            style={{
              background: colors.primary,
              color: colors.primaryForeground,
            }}
          >
            Primary button
          </span>
          <span
            className="rounded-md border-2 px-2 py-1.5 text-xs"
            style={{ borderColor: colors.ring }}
          >
            Focus ring
          </span>
        </div>
      );
    case "Status":
      return (
        <span
          className="rounded-md px-3 py-1.5 text-sm text-white"
          style={{ background: colors.destructive }}
        >
          Destructive action
        </span>
      );
    case "Borders":
      return (
        <div className="flex gap-2">
          <div
            className="flex h-9 w-20 items-center justify-center rounded-md border-2 text-xs"
            style={{ borderColor: colors.border }}
          >
            Border
          </div>
          <div
            className="flex h-9 w-20 items-center justify-center rounded-md border-2 text-xs"
            style={{ borderColor: colors.input }}
          >
            Input
          </div>
        </div>
      );
    case "Navigation":
      return (
        <div className="flex items-center gap-3">
          <span className="text-sm" style={{ color: colors.navForeground }}>
            Idle nav item
          </span>
          <div
            className="flex size-8 shrink-0 items-center justify-center rounded-full"
            style={{ background: colors.avatarBackground }}
          >
            <UserRound
              className="size-4"
              style={{ color: colors.avatarForeground }}
            />
          </div>
        </div>
      );
    default:
      return null;
  }
}

/**
 * Miniature, non-interactive recreation of the Home screen's profile row
 * (home-profile-row.tsx) - real layout/content, but every semantic color
 * comes from the in-progress form values via inline style instead of the
 * bg-card/text-muted-foreground-style classes the real component uses,
 * since those resolve against the currently-*applied* theme, not whatever
 * is being edited here before Save.
 */
function ProfileCardReference({ colors }: { colors: ThemeColors }) {
  return (
    <div
      className="flex items-center gap-3 rounded-xl border p-3 shadow-sm"
      style={{
        background: colors.card,
        borderColor: colors.border,
        color: colors.cardForeground,
      }}
    >
      <div
        className="flex size-8 shrink-0 items-center justify-center rounded-full"
        style={{ background: colors.avatarBackground }}
      >
        <UserRound
          className="size-4"
          style={{ color: colors.avatarForeground }}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-sm">Ghidorah</span>
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-xs"
            style={{
              background: colors.secondary,
              color: colors.secondaryForeground,
            }}
          >
            Running
          </span>
        </div>
        <p
          className="truncate text-xs"
          style={{ color: colors.mutedForeground }}
        >
          yumiitf2@gmail.com
        </p>
      </div>
    </div>
  );
}

/** Same idea as ProfileCardReference, recreating the News panel's card (news-panel.tsx). */
function NewsCardReference({ colors }: { colors: ThemeColors }) {
  return (
    <div
      className="flex gap-3 rounded-lg border p-3"
      style={{ borderColor: colors.border, color: colors.foreground }}
    >
      <div
        className="h-16 w-16 shrink-0 rounded-md border"
        style={{ background: colors.muted, borderColor: colors.border }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className="font-heading font-semibold text-xs uppercase tracking-wide"
            style={{ color: colors.primary }}
          >
            News
          </span>
          <span className="text-xs" style={{ color: colors.mutedForeground }}>
            May 31, 2026
          </span>
        </div>
        <p className="mt-1 truncate font-medium text-sm">
          New patch notes released
        </p>
        <p
          className="mt-1 truncate text-xs"
          style={{ color: colors.mutedForeground }}
        >
          Read the full patch notes for details on today's update.
        </p>
      </div>
    </div>
  );
}
