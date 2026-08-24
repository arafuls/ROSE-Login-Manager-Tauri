import { useCallback, useEffect, useState } from "react";
import { onProfilesChanged, profilesList } from "./api";
import type { Profile } from "./types";

export function useProfiles() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    const list = await profilesList();
    setProfiles(list);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await profilesList();
      if (!cancelled) {
        setProfiles(list);
        setLoading(false);
      }
    })();

    // Mirrors `listen("profiles-changed", refetch)` from the contract's
    // events section - see the note in api.ts's onProfilesChanged.
    const unsubscribe = onProfilesChanged(() => {
      if (!cancelled) {
        refetch();
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [refetch]);

  return { profiles, loading, refetch };
}
