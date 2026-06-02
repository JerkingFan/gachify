import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { trackKeys } from "@/lib/queryKeys";

export function useTrackSearch(query: string, karaokeOnly = false, debounceMs = 300) {
  const q = useDebouncedValue(query.trim(), debounceMs);
  const enabled = q.length > 0 || karaokeOnly;

  const result = useQuery({
    queryKey: trackKeys.list({
      status: "published",
      q: q || undefined,
      has_lyrics: karaokeOnly || undefined,
    }),
    queryFn: () =>
      api.getTracks({
        q: q || undefined,
        limit: 50,
        offset: 0,
        status: "published",
        has_lyrics: karaokeOnly || undefined,
      }),
    enabled,
  });

  return {
    results: result.data?.items ?? [],
    total: result.data?.total ?? 0,
    loading: enabled && result.isFetching,
    error: result.error instanceof Error ? result.error.message : null,
  };
}
