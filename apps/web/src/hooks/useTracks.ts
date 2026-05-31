import { useCallback, useEffect, useState } from "react";
import { api } from "@/api/client";
import type { Track } from "@/types";

const PAGE_SIZE = 50;

export function useTracks() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(async (offset: number, append: boolean) => {
    if (append) setLoadingMore(true);
    else {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await api.getTracks({
        limit: PAGE_SIZE,
        offset,
        status: "published",
      });
      setTracks((prev) => (append ? [...prev, ...res.items] : res.items));
      setTotal(res.total);
      setHasMore(res.has_more);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tracks");
      if (!append) setTracks([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  const refresh = useCallback(() => fetchPage(0, false), [fetchPage]);

  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore) return;
    void fetchPage(tracks.length, true);
  }, [hasMore, loadingMore, tracks.length, fetchPage]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { tracks, total, hasMore, loading, loadingMore, error, refresh, loadMore };
}
