import { useCallback, useEffect, useState } from "react";
import { isBackendError } from "@/lib/tauri-errors";
import { newsFetch } from "./api";
import type { NewsItem } from "./types";

export function useNews() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const result = await newsFetch();
      setItems(result);
      setError(null);
    } catch (err) {
      setError(isBackendError(err) ? err.message : "Couldn't load news");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { items, loading, error, refetch };
}
