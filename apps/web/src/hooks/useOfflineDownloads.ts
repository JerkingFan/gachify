import { useCallback, useEffect, useState } from "react";
import { api } from "@/api/client";
import {
  downloadTrackForOffline,
  estimateOfflineBytes,
  formatBytes,
  listOfflineTrackIds,
  OFFLINE_MAX_TRACKS,
  removeOfflineTrack,
} from "@/lib/offlineTracks";

export function useOfflineDownloads() {
  const [ids, setIds] = useState<string[]>([]);
  const [bytes, setBytes] = useState(0);
  const [limit, setLimit] = useState(OFFLINE_MAX_TRACKS);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [localIds, used, server] = await Promise.all([
      listOfflineTrackIds(),
      estimateOfflineBytes(),
      api.getOfflineDownloads().catch(() => ({ track_ids: [] as string[], limit: OFFLINE_MAX_TRACKS })),
    ]);
    setIds(localIds.length ? localIds : server.track_ids);
    setBytes(used);
    setLimit(server.limit ?? OFFLINE_MAX_TRACKS);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const download = useCallback(
    async (trackId: string) => {
      setBusy(trackId);
      setError(null);
      try {
        await downloadTrackForOffline(trackId);
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Download failed");
        throw e;
      } finally {
        setBusy(null);
      }
    },
    [refresh],
  );

  const remove = useCallback(
    async (trackId: string) => {
      setBusy(trackId);
      try {
        await removeOfflineTrack(trackId);
        await refresh();
      } finally {
        setBusy(null);
      }
    },
    [refresh],
  );

  return {
    ids,
    bytes,
    limit,
    busy,
    error,
    refresh,
    download,
    remove,
    formattedSize: formatBytes(bytes),
    canDownloadMore: ids.length < limit,
  };
}
