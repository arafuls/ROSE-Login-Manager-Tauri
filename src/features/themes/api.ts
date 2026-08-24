import { invoke } from "@tauri-apps/api/core";
import type { Theme, ThemeInput } from "./types";

export function themeList(): Promise<Theme[]> {
  return invoke("theme_list");
}

type Listener = (themes: Theme[]) => void;
const listeners = new Set<Listener>();

/**
 * NOT a real Tauri event, mirroring `settings/api.ts`'s `onSettingsChanged`
 * for the same reason: every consumer lives in this same webview/JS
 * runtime, so an in-process pub-sub is enough. Needed because `useThemes()`
 * is called independently in more than one place (the Settings page's
 * editor/library UI, and `ThemeApplier` mounted once near the app root) -
 * without this, saving/deleting/importing a theme in one instance left
 * every other instance's list stale, so e.g. a newly created theme could
 * be set active but `ThemeApplier` wouldn't find it in its own (stale)
 * list and would silently fall back to the built-in default instead of
 * applying it.
 */
export function onThemesChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function notifyThemesChanged(): Promise<void> {
  const list = await themeList();
  for (const listener of listeners) {
    listener(list);
  }
}

export async function themeSave(input: ThemeInput): Promise<Theme> {
  const saved = await invoke<Theme>("theme_save", { input });
  await notifyThemesChanged();
  return saved;
}

export async function themeDelete(id: string): Promise<void> {
  await invoke("theme_delete", { id });
  await notifyThemesChanged();
}

export function themeExportToFile(id: string, path: string): Promise<void> {
  return invoke("theme_export_to_file", { id, path });
}

export async function themeImportFromFile(path: string): Promise<Theme> {
  const imported = await invoke<Theme>("theme_import_from_file", { path });
  await notifyThemesChanged();
  return imported;
}
