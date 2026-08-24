import { DndContext } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Download, LoaderCircle, Plus, Upload, UserRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { profilesLaunch } from "@/features/profiles/api";
import type { Profile } from "@/features/profiles/types";
import { useProfileReorder } from "@/features/profiles/use-profile-reorder";
import { useProfiles } from "@/features/profiles/use-profiles";
import { useSettings } from "@/features/settings/use-settings";
import { isBackendError } from "@/lib/tauri-errors";
import { DeleteProfileDialog } from "./delete-profile-dialog";
import { ExportDialog } from "./export-dialog";
import { ImportDialog } from "./import-dialog";
import { ProfileCard } from "./profile-card";
import { ProfileFormDialog } from "./profile-form-dialog";

export function ProfileList() {
  const { profiles, loading, refetch } = useProfiles();
  const { settings } = useSettings();
  const {
    displayedProfiles,
    sensors,
    collisionDetection,
    handleDragEnd,
    modifiers,
  } = useProfileReorder(profiles, refetch);

  const [formOpen, setFormOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | undefined>();
  const [deletingProfile, setDeletingProfile] = useState<Profile | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const handleLaunch = async (profile: Profile) => {
    try {
      await profilesLaunch(profile.email);
    } catch (error) {
      toast.error(`Couldn't launch ${profile.name}`, {
        description: isBackendError(error) ? error.message : undefined,
      });
    }
  };

  const openCreate = () => {
    setEditingProfile(undefined);
    setFormOpen(true);
  };

  const openEdit = (profile: Profile) => {
    setEditingProfile(profile);
    setFormOpen(true);
  };

  return (
    // w-full matters here, not just max-w-2xl/mx-auto: SidebarInset (this
    // div's parent in Sidebar mode) is itself flex/flex-col, which makes
    // this a flex item - without an explicit width, a flex item with auto
    // margins shrinks to fit its content instead of filling the parent, so
    // the max-w cap was never actually being reached. Topbar mode's <main>
    // is a plain block element, where mx-auto/max-w-2xl alone already work
    // as expected - w-full makes this div behave the same in both.
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-4">
        {/* min-w-0 lets this block shrink/wrap its text instead of a flex
            item's default min-width:auto forcing the row to overflow (and
            squeeze the button) when the available width is narrower, e.g.
            in Sidebar nav mode. */}
        <div className="min-w-0">
          <h1 className="font-semibold text-2xl">Profiles</h1>
          <p className="text-muted-foreground text-sm">
            Manage your saved login profiles.
          </p>
        </div>
        <Button className="shrink-0" onClick={openCreate}>
          <Plus className="size-4" />
          Add profile
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Button
          disabled={profiles.length === 0}
          onClick={() => setExportOpen(true)}
          size="sm"
          variant="outline"
        >
          <Download className="size-4" />
          Export
        </Button>
        <Button onClick={() => setImportOpen(true)} size="sm" variant="outline">
          <Upload className="size-4" />
          Import
        </Button>
      </div>

      {loading && (
        <div className="flex h-40 items-center justify-center">
          <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && profiles.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center">
          <UserRound className="size-8 text-muted-foreground" />
          <p className="font-medium">No profiles yet</p>
          <p className="max-w-xs text-muted-foreground text-sm">
            Add your first profile to save login credentials for the ROSE Online
            client.
          </p>
          <Button className="mt-2" onClick={openCreate} size="sm">
            <Plus className="size-4" />
            Add profile
          </Button>
        </div>
      )}

      {!loading && profiles.length > 0 && settings && (
        <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border p-2">
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
                  <ProfileCard
                    key={profile.email}
                    onDelete={() => setDeletingProfile(profile)}
                    onEdit={() => openEdit(profile)}
                    onLaunch={() => handleLaunch(profile)}
                    profile={profile}
                    settings={settings}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}

      <ProfileFormDialog
        onOpenChange={setFormOpen}
        open={formOpen}
        profile={editingProfile}
      />
      <DeleteProfileDialog
        onOpenChange={(open) => {
          if (!open) {
            setDeletingProfile(null);
          }
        }}
        open={deletingProfile !== null}
        profile={deletingProfile}
      />
      <ExportDialog
        onOpenChange={setExportOpen}
        open={exportOpen}
        profiles={profiles}
        settings={settings}
      />
      <ImportDialog onOpenChange={setImportOpen} open={importOpen} />
    </div>
  );
}
