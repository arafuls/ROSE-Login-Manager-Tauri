/** Live list of themes, refetching automatically after any save/delete/import from any instance. */

import { useCallback, useEffect, useState } from "react";
import { onThemesChanged, themeList } from "./api";
import type { Theme } from "./types";

/** The `useThemes` hook - see the file header. */
export function useThemes() {
  const [themes, setThemes] = useState<Theme[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const result = await themeList();
      setThemes(result);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    refetch();
    // Keeps every independent `useThemes()` instance in sync after a
    // save/delete/import from *any* of them - see `onThemesChanged`'s doc
    // comment in api.ts for why this is needed.
    const unsubscribe = onThemesChanged((list) => {
      if (!cancelled) {
        setThemes(list);
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [refetch]);

  return { themes, loading, refetch };
}
