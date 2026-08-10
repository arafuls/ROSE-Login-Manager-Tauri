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
import {
  clientLaunchDefault,
  updaterForceRecheck,
} from "@/features/updater/api";
import { LaunchStatusBar } from "@/features/updater/components/launch-status-bar";

export function HomeScreen() {
  const { profiles, loading, refetch } = useProfiles();
  const { displayedProfiles, sensors, collisionDetection, handleDragEnd } =
    useProfileReorder(profiles, refetch);

  const [playing, setPlaying] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const handleLaunch = async (profile: Profile) => {
    try {
      await profilesLaunch(profile.email);
    } catch (error) {
      toast.error(`Couldn't launch ${profile.name}`, {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const handlePlay = async () => {
    setPlaying(true);
    try {
      await clientLaunchDefault();
    } catch (error) {
      toast.error("Couldn't launch ROSE Online", {
        description: error instanceof Error ? error.message : undefined,
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
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="grid min-h-0 flex-1 grid-cols-[320px_1fr] gap-4">
        <div className="flex flex-col gap-2 overflow-y-auto overflow-x-hidden px-1">
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
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>

        <NewsPanel />
      </div>

      <div className="space-y-2">
        <LaunchStatusBar />
        <div className="flex items-center gap-2">
          <Button
            disabled={verifying}
            onClick={handleForceRecheck}
            variant="outline"
          >
            {verifying ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Verify Files
          </Button>
          <Button className="ml-auto" disabled={playing} onClick={handlePlay}>
            {playing ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Play className="size-4" />
            )}
            Play
          </Button>
        </div>
      </div>
    </div>
  );
}
