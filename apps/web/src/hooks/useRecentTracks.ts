import { useCallback, useEffect, useState } from "react";
import { api } from "@/api/client";
import {
  getRecentIds,
  RECENT_UPDATED_EVENT,
  syncRecentFromServer,
} from "@/lib/storage";
import type { Track } from "@/types";
import { useAuthStore } from "@/store/authStore";

/**
 * Resolves recently played IDs to tracks (catalog + on-demand fetch).
 * Re-syncs from server on login so Home is populated on a new device.
 */
export function useRecentTracks(catalog: Track[], limit = 5): {
  tracks: Track[];
  loading: boolean;
} {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [ids, setIds] = useState(getRecentIds);
  const [fetched, setFetched] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshIds = useCallback(() => setIds(getRecentIds()), []);

  useEffect(() => {
    const onUpdate = () => refreshIds();
    window.addEventListener(RECENT_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(RECENT_UPDATED_EVENT, onUpdate);
  }, [refreshIds]);

  useEffect(() => {
    if (!isAuthenticated) {
      refreshIds();
      return;
    }
    let cancelled = false;
    setLoading(true);
    void syncRecentFromServer()
      .then(() => {
        if (!cancelled) refreshIds();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, refreshIds]);

  const sliceIds = ids.slice(0, limit);
  const catalogById = new Map(catalog.map((t) => [t.id, t]));
  const missing = sliceIds.filter((id) => !catalogById.has(id));

  useEffect(() => {
    if (!missing.length) {
      setFetched([]);
      return;
    }
    let cancelled = false;
    void Promise.all(
      missing.map((id) =>
        api.getTrack(id).catch(() => null),
      ),
    ).then((results) => {
      if (!cancelled) {
        setFetched(results.filter(Boolean) as Track[]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [missing.join(",")]);

  const extraById = new Map(fetched.map((t) => [t.id, t]));
  const tracks = sliceIds
    .map((id) => catalogById.get(id) ?? extraById.get(id))
    .filter(Boolean) as Track[];

  return { tracks, loading };
}
