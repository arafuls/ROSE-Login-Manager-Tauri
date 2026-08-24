/** Mirrors `src-tauri/src/models.rs`'s `ThemeColors`/`Theme`/`ThemeInput`. */

export interface ThemeColors {
  accent: string;
  accentForeground: string;
  background: string;
  border: string;
  card: string;
  cardForeground: string;
  destructive: string;
  foreground: string;
  input: string;
  muted: string;
  mutedForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  ring: string;
  secondary: string;
  secondaryForeground: string;
}

export interface Theme {
  builtIn: boolean;
  colors: ThemeColors;
  id: string;
  name: string;
}

export interface ThemeInput {
  colors: ThemeColors;
  id?: string;
  name: string;
}

/** Reserved id for the built-in palette - mirrors `theme::ROSE_DEFAULT_THEME_ID`. */
export const ROSE_DEFAULT_THEME_ID = "rose-default";

interface ThemeColorField {
  key: keyof ThemeColors;
  label: string;
}

interface ThemeColorGroup {
  fields: ThemeColorField[];
  title: string;
}

/** Grouping for the theme editor form - purely a presentation concern. */
export const THEME_COLOR_GROUPS: ThemeColorGroup[] = [
  {
    title: "Base",
    fields: [
      { key: "background", label: "Background" },
      { key: "foreground", label: "Foreground" },
    ],
  },
  {
    title: "Surfaces",
    fields: [
      { key: "card", label: "Card" },
      { key: "cardForeground", label: "Card text" },
      { key: "popover", label: "Popover" },
      { key: "popoverForeground", label: "Popover text" },
      { key: "secondary", label: "Secondary" },
      { key: "secondaryForeground", label: "Secondary text" },
      { key: "muted", label: "Muted" },
      { key: "mutedForeground", label: "Muted text" },
    ],
  },
  {
    title: "Accent",
    fields: [
      { key: "accent", label: "Accent" },
      { key: "accentForeground", label: "Accent text" },
    ],
  },
  {
    title: "Brand",
    fields: [
      { key: "primary", label: "Primary" },
      { key: "primaryForeground", label: "Primary text" },
      { key: "ring", label: "Focus ring" },
    ],
  },
  {
    title: "Status",
    fields: [{ key: "destructive", label: "Destructive" }],
  },
  {
    title: "Borders",
    fields: [
      { key: "border", label: "Border" },
      { key: "input", label: "Input border" },
    ],
  },
];
