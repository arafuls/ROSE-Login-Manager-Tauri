/** The Settings page's Appearance card: theme picker/editor and the navigation-style toggle. */

import { open, save } from "@tauri-apps/plugin-dialog";
import { Copy, Download, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { settingsUpdate } from "@/features/settings/api";
import { NAV_STYLE_OPTIONS, type NavStyle } from "@/features/settings/types";
import { useSettings } from "@/features/settings/use-settings";
import {
  themeDelete,
  themeExportToFile,
  themeImportFromFile,
} from "@/features/themes/api";
import { ROSE_DEFAULT_THEME_ID, type Theme } from "@/features/themes/types";
import { useThemes } from "@/features/themes/use-themes";
import { isBackendError } from "@/lib/tauri-errors";
import { ThemeEditorDialog, type ThemeEditorSeed } from "./theme-editor-dialog";

/** Renders the card described in the file header. */
export function AppearanceCard() {
  const { settings, refetch: refetchSettings } = useSettings();
  const { themes } = useThemes();
  const [editorSeed, setEditorSeed] = useState<ThemeEditorSeed | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Theme | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const activeId = settings?.activeThemeId ?? ROSE_DEFAULT_THEME_ID;
  const activeTheme = themes.find((t) => t.id === activeId) ?? themes[0];

  const activate = async (id: string) => {
    try {
      await settingsUpdate({ activeThemeId: id });
    } catch (error) {
      toast.error("Couldn't switch theme", {
        description: isBackendError(error) ? error.message : undefined,
      });
    }
  };

  const setNavStyle = async (navStyle: NavStyle) => {
    try {
      await settingsUpdate({ navStyle });
    } catch (error) {
      toast.error("Couldn't switch navigation style", {
        description: isBackendError(error) ? error.message : undefined,
      });
    }
  };

  const openNewTheme = () => {
    if (!activeTheme) {
      return;
    }
    setEditorSeed({ colors: activeTheme.colors, name: "" });
    setEditorOpen(true);
  };

  const openEditTheme = () => {
    if (!activeTheme || activeTheme.builtIn) {
      return;
    }
    setEditorSeed({
      id: activeTheme.id,
      colors: activeTheme.colors,
      name: activeTheme.name,
    });
    setEditorOpen(true);
  };

  const openDuplicateTheme = () => {
    if (!activeTheme) {
      return;
    }
    setEditorSeed({
      colors: activeTheme.colors,
      name: `${activeTheme.name} copy`,
    });
    setEditorOpen(true);
  };

  const handleSaved = async (theme: Theme) => {
    // themeSave (in api.ts) already broadcasts the updated list to every
    // useThemes() instance, including this one - no manual refetch needed.
    // Only the create/duplicate flows (no pre-existing id) benefit from
    // instant feedback here - editing the already-active theme in place
    // doesn't need a redundant activate call, and editing an *inactive*
    // theme must never silently switch what's applied.
    if (!editorSeed?.id) {
      await activate(theme.id);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }
    try {
      await themeDelete(deleteTarget.id);
      setDeleteTarget(null);
      // themeDelete already broadcasts the updated list; settings still
      // needs an explicit refetch since a delete-while-active doesn't go
      // through settingsUpdate's own notification.
      await refetchSettings();
      toast.success(`Deleted "${deleteTarget.name}"`);
    } catch (error) {
      toast.error("Couldn't delete theme", {
        description: isBackendError(error) ? error.message : undefined,
      });
    }
  };

  const handleExport = async () => {
    if (!activeTheme) {
      return;
    }
    setExporting(true);
    try {
      const path = await save({
        defaultPath: `${activeTheme.name}.json`,
        filters: [{ extensions: ["json"], name: "ROSE theme" }],
      });
      if (path) {
        await themeExportToFile(activeTheme.id, path);
        toast.success(`Exported "${activeTheme.name}"`);
      }
    } catch (error) {
      toast.error("Couldn't export theme", {
        description: isBackendError(error) ? error.message : undefined,
      });
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const selected = await open({
        filters: [{ extensions: ["json"], name: "ROSE theme" }],
      });
      const path = Array.isArray(selected) ? selected[0] : selected;
      if (path) {
        const imported = await themeImportFromFile(path);
        await activate(imported.id);
        toast.success(`Imported "${imported.name}"`);
      }
    } catch (error) {
      toast.error("Couldn't import theme", {
        description: isBackendError(error)
          ? error.message
          : "That file isn't a valid theme.",
      });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>
          Choose or create a color theme for the app.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Select onValueChange={activate} value={activeId}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {themes.map((theme) => (
                <SelectItem key={theme.id} value={theme.id}>
                  {theme.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            onClick={openNewTheme}
            size="sm"
            title="New theme"
            variant="outline"
          >
            <Plus className="size-4" />
            New
          </Button>
          <Button
            disabled={!activeTheme || activeTheme.builtIn}
            onClick={openEditTheme}
            size="icon-sm"
            title="Edit theme"
            variant="outline"
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            disabled={!activeTheme}
            onClick={openDuplicateTheme}
            size="icon-sm"
            title="Duplicate theme"
            variant="outline"
          >
            <Copy className="size-4" />
          </Button>
          <Button
            disabled={!activeTheme || activeTheme.builtIn}
            onClick={() => activeTheme && setDeleteTarget(activeTheme)}
            size="icon-sm"
            title="Delete theme"
            variant="outline"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">
            Navigation style
          </span>
          <Select
            onValueChange={(value) => setNavStyle(value as NavStyle)}
            value={settings?.navStyle ?? "Sidebar"}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NAV_STYLE_OPTIONS.map((style) => (
                <SelectItem key={style} value={style}>
                  {style}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          <Button
            disabled={!activeTheme || exporting}
            onClick={handleExport}
            size="sm"
            variant="outline"
          >
            <Download className="size-4" />
            Export
          </Button>
          <Button
            disabled={importing}
            onClick={handleImport}
            size="sm"
            variant="outline"
          >
            <Upload className="size-4" />
            Import
          </Button>
        </div>
      </CardContent>

      <ThemeEditorDialog
        onOpenChange={setEditorOpen}
        onSaved={handleSaved}
        open={editorOpen}
        seed={editorSeed}
      />

      <AlertDialog
        onOpenChange={(next) => {
          if (!next) {
            setDeleteTarget(null);
          }
        }}
        open={deleteTarget !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this theme?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes "{deleteTarget?.name}". If it's the
              active theme, the app switches back to Dark Theme.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              variant="destructive"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
