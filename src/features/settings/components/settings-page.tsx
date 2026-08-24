import { FolderSearch, LoaderCircle, RefreshCw, Wand2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { appGetVersion } from "@/features/app-update/api";
import { useManualUpdateCheck } from "@/features/app-update/use-app-update";
import {
  settingsBrowseGameFolder,
  settingsFindGameFolder,
  settingsUpdate,
} from "@/features/settings/api";
import {
  LOGIN_SCREEN_OPTIONS,
  type LoginScreen,
} from "@/features/settings/types";
import { useSettings } from "@/features/settings/use-settings";
import { ChangePassphraseDialog } from "@/features/vault/components/change-passphrase-dialog";
import { isBackendError } from "@/lib/tauri-errors";
import { AppearanceCard } from "./appearance-card";

export function SettingsPage() {
  const { settings, loading } = useSettings();
  const [locating, setLocating] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [changePassphraseOpen, setChangePassphraseOpen] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const { checking, checkNow } = useManualUpdateCheck();
  // The game folder Input is controlled from this, not directly from
  // `settings.roseGameFolder` - a plain `defaultValue` only applies once on
  // mount, so a value set by Find automatically/Browse (which update
  // `settings` after the fact) would never visibly appear in the field even
  // though it was actually saved. Synced below whenever `settings` changes.
  const [folderInput, setFolderInput] = useState("");

  useEffect(() => {
    appGetVersion().then(setVersion);
  }, []);

  useEffect(() => {
    setFolderInput(settings?.roseGameFolder ?? "");
  }, [settings?.roseGameFolder]);

  if (loading || !settings) {
    return (
      <div className="flex h-64 items-center justify-center">
        <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const persist = async (patch: Parameters<typeof settingsUpdate>[0]) => {
    try {
      await settingsUpdate(patch);
    } catch (error) {
      toast.error("Couldn't save that setting", {
        description: isBackendError(error) ? error.message : undefined,
      });
    }
  };

  const handleFindAutomatically = async () => {
    setLocating(true);
    try {
      const found = await settingsFindGameFolder();
      if (found) {
        await persist({ roseGameFolder: found });
        toast.success("Found the ROSE Online folder");
      } else {
        // The old app's registry lookup only checked HKLM and failed
        // silently when it came up empty. This must always be visible.
        toast.error("Couldn't find the ROSE Online folder automatically", {
          description: "Try Browse instead, or enter the path manually.",
        });
      }
    } finally {
      setLocating(false);
    }
  };

  const handleBrowse = async () => {
    setBrowsing(true);
    try {
      const picked = await settingsBrowseGameFolder();
      if (picked) {
        await persist({ roseGameFolder: picked });
      }
    } finally {
      setBrowsing(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-semibold text-2xl">Settings</h1>
          <p className="text-muted-foreground text-sm">
            Configure your ROSE Online client and login manager preferences.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {version && (
            <span className="text-muted-foreground text-xs">v{version}</span>
          )}
          <Button
            disabled={checking}
            onClick={checkNow}
            size="sm"
            variant="ghost"
          >
            {checking ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Check for updates
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
          <CardDescription>
            Change the passphrase that unlocks your vault.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() => setChangePassphraseOpen(true)}
            variant="outline"
          >
            Change passphrase
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Game folder</CardTitle>
          <CardDescription>
            The reference path to your ROSE Online install folder.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Input
            onBlur={(e) => persist({ roseGameFolder: e.target.value || null })}
            onChange={(e) => setFolderInput(e.target.value)}
            placeholder="C:\Program Files (x86)\Rednim Games\ROSE Online"
            value={folderInput}
          />
          <Button
            disabled={browsing}
            onClick={handleBrowse}
            title="Browse for the folder"
            type="button"
            variant="outline"
          >
            {browsing ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <FolderSearch />
            )}
            Browse
          </Button>
          <Button
            disabled={locating}
            onClick={handleFindAutomatically}
            title="Find automatically"
            type="button"
            variant="outline"
          >
            {locating ? <LoaderCircle className="animate-spin" /> : <Wand2 />}
            Find automatically
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <SettingRow
            checked={settings.displayEmail}
            description="Show the email address associated with each profile."
            label="Display emails"
            onCheckedChange={(checked) => {
              // Mirrors the old app: turning display off forces masking off too.
              persist(
                checked
                  ? { displayEmail: true }
                  : { displayEmail: false, maskEmail: false }
              );
            }}
          />
          <SettingRow
            checked={settings.maskEmail}
            description="Mask part of the displayed email with asterisks."
            disabled={!settings.displayEmail}
            label="Mask emails"
            onCheckedChange={(checked) => {
              // Mirrors the old app: masking implies display must be on.
              persist(
                checked
                  ? { maskEmail: true, displayEmail: true }
                  : { maskEmail: false }
              );
            }}
          />
          <SettingRow
            checked={settings.launchClientBehind}
            description="Launches the ROSE client behind the login manager window."
            label="Launch client behind"
            onCheckedChange={(checked) =>
              persist({ launchClientBehind: checked })
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Game settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <SettingRow
            checked={settings.skipPlanetCutscene}
            description="Skips the cutscene when traveling to another planet."
            label="Skip planet cutscene"
            onCheckedChange={(checked) =>
              persist({ skipPlanetCutscene: checked })
            }
          />
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="font-medium" htmlFor="login-screen">
                Login screen
              </Label>
              <p className="text-muted-foreground text-sm">
                Sets the default login scene.
              </p>
            </div>
            <Select
              onValueChange={(value: LoginScreen) =>
                persist({ loginScreen: value })
              }
              value={settings.loginScreen}
            >
              <SelectTrigger className="w-44" id="login-screen">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOGIN_SCREEN_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <AppearanceCard />

      <ChangePassphraseDialog
        onOpenChange={setChangePassphraseOpen}
        open={changePassphraseOpen}
      />
    </div>
  );
}

function SettingRow({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <Label className="font-medium">{label}</Label>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}
