/** The "/" route's screen: quick-launch profile list, news panel, and PLAY/Verify Files controls. */

import { DndContext } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { LoaderCircle, Play, RefreshCw, UserRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { NewsPanel } from "@/features/news/components/news-panel";
import { profilesLaunch } from "@/features/profiles/api";
import { HomeProfileRow } from "@/features/profiles/components/home-profile-row";
import type { Profile } from "@/features/profiles/types";
import { useProfileReorder } from "@/features/profiles/use-profile-reorder";
import { useProfiles } from "@/features/profiles/use-profiles";
import { useSettings } from "@/features/settings/use-settings";
import {
  clientLaunchDefault,
  updaterForceRecheck,
} from "@/features/updater/api";
import { LaunchStatusBar } from "@/features/updater/components/launch-status-bar";
import { isBackendError } from "@/lib/tauri-errors";
import { cn } from "@/lib/utils";

/** Renders the screen described in the file header. */
export function HomeScreen() {
  const { profiles, loading, refetch } = useProfiles();
  const { settings } = useSettings();
  const {
    displayedProfiles,
    sensors,
    collisionDetection,
    handleDragEnd,
    modifiers,
  } = useProfileReorder(profiles, refetch);

  const [playing, setPlaying] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const handleLaunch = async (profile: Profile) => {
    try {
      await profilesLaunch(profile.email);
    } catch (error) {
      toast.error(`Couldn't launch ${profile.name}`, {
        description: isBackendError(error) ? error.message : undefined,
      });
    }
  };

  const handlePlay = async () => {
    setPlaying(true);
    try {
      await clientLaunchDefault();
    } catch (error) {
      toast.error("Couldn't launch ROSE Online", {
        description: isBackendError(error) ? error.message : undefined,
      });
    } finally {
      setPlaying(false);
    }
  };

  const handleForceRecheck = async () => {
    setVerifying(true);
    try {
      await updaterForceRecheck();
      toast.success("Game files verified");
    } catch (error) {
      toast.error("Couldn't verify game files", {
        description: isBackendError(error) ? error.message : undefined,
      });
    } finally {
      setVerifying(false);
    }
  };

  const showNews = settings?.showNewsPanel ?? true;

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div
        className={cn(
          "grid min-h-0 flex-1 gap-4",
          showNews ? "grid-cols-[320px_1fr]" : "grid-cols-1"
        )}
      >
        <div className="flex min-h-0 flex-col gap-2 overflow-y-auto overflow-x-hidden px-1">
          {loading && (
            <div className="flex h-40 items-center justify-center">
              <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loading && profiles.length === 0 && (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center">
              <UserRound className="size-8 text-muted-foreground" />
              <p className="font-medium text-sm">No profiles yet</p>
              <p className="max-w-[220px] text-muted-foreground text-xs">
                Add a profile on the Profiles page to see it here.
              </p>
            </div>
          )}

          {!loading && profiles.length > 0 && (
            <DndContext
              collisionDetection={collisionDetection}
              modifiers={modifiers}
              onDragEnd={handleDragEnd}
              sensors={sensors}
            >
              <SortableContext
                items={displayedProfiles.map((p) => p.email)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {displayedProfiles.map((profile) => (
                    <HomeProfileRow
                      key={profile.email}
                      onLaunch={() => handleLaunch(profile)}
                      profile={profile}
                      settings={settings}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>

        {showNews && <NewsPanel />}
      </div>

      <div
        className={cn(
          "grid gap-4",
          showNews ? "grid-cols-[320px_1fr]" : "grid-cols-1"
        )}
      >
        {showNews && <div />}
        <div className="space-y-2">
          <LaunchStatusBar />
          <div className="flex items-center justify-end gap-2">
            {settings?.linuxLaunchMode !== "Native" && (
              <Button
                disabled={verifying}
                onClick={handleForceRecheck}
                size="sm"
                variant="outline"
              >
                {verifying ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                Verify Files
              </Button>
            )}
            <Button
              className="w-28"
              disabled={playing}
              onClick={handlePlay}
              size="sm"
            >
              {playing ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Play className="size-4" />
              )}
              PLAY
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
