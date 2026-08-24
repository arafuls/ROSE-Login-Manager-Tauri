import { useEffect } from "react";
import { useSettings } from "@/features/settings/use-settings";
import { ROSE_DEFAULT_THEME_ID, type ThemeColors } from "./types";
import { useThemes } from "./use-themes";

const CSS_VAR_NAMES: Record<keyof ThemeColors, string> = {
  background: "--background",
  foreground: "--foreground",
  card: "--card",
  cardForeground: "--card-foreground",
  popover: "--popover",
  popoverForeground: "--popover-foreground",
  primary: "--primary",
  primaryForeground: "--primary-foreground",
  secondary: "--secondary",
  secondaryForeground: "--secondary-foreground",
  muted: "--muted",
  mutedForeground: "--muted-foreground",
  accent: "--accent",
  accentForeground: "--accent-foreground",
  destructive: "--destructive",
  border: "--border",
  input: "--input",
  ring: "--ring",
  navForeground: "--nav-foreground",
  avatarBackground: "--avatar-background",
  avatarForeground: "--avatar-foreground",
};

/**
 * Applies the active theme app-wide by setting inline CSS custom properties
 * on `document.documentElement` - inline style on `<html>` always wins over
 * global.css's `:root{}` rule, and Tailwind v4's `--color-background:
 * var(--background)` indirection stays a live reference chain rather than a
 * baked value, so this correctly flows through to every `bg-background`
 * -style utility (confirmed by a live spike before this was built - same
 * mechanism shadcn's light/dark class-swap relies on).
 *
 * Renders nothing - mounted once in `AppProvider`, outside the router and
 * outside vault-gating, so the active theme applies on the lock/setup
 * screens too, not just after unlock.
 */
export function ThemeApplier() {
  const { settings } = useSettings();
  const { themes } = useThemes();

  useEffect(() => {
    const root = document.documentElement.style;
    const activeId = settings?.activeThemeId ?? ROSE_DEFAULT_THEME_ID;
    const theme = themes.find((t) => t.id === activeId);

    // Falls back to clearing every override (rather than setting the
    // built-in theme's own hex-approximated colors) whenever the built-in
    // is active, or whenever the active id isn't found yet - a stale
    // reference, a deleted theme, or simply themes/settings still loading.
    // Clearing restores global.css's exact stylesheet values, including
    // `destructive`'s real `oklch()` value that the built-in's editable
    // hex approximation can't reproduce exactly.
    if (!theme || activeId === ROSE_DEFAULT_THEME_ID) {
      for (const varName of Object.values(CSS_VAR_NAMES)) {
        root.removeProperty(varName);
      }
      return;
    }

    for (const [key, varName] of Object.entries(CSS_VAR_NAMES) as [
      keyof ThemeColors,
      string,
    ][]) {
      const value = theme.colors[key];
      // Graceful per-field degradation: a hand-edited themes.json or an
      // imported file could carry a value that slipped past the editor's
      // own validation. One bad token falls back to the stylesheet default
      // instead of the whole app (including Settings, where the user would
      // need to go to fix it) becoming illegible.
      if (CSS.supports("color", value)) {
        root.setProperty(varName, value);
      } else {
        root.removeProperty(varName);
      }
    }
  }, [settings?.activeThemeId, themes]);

  return null;
}
