import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { trackKeys } from "@/lib/queryKeys";

export function useTrackSearch(query: string, debounceMs = 300) {
  const q = useDebouncedValue(query.trim(), debounceMs);

  const result = useQuery({
    queryKey: trackKeys.list({ status: "published", q: q || undefined }),
    queryFn: () =>
      api.getTracks({
        q,
        limit: 50,
        offset: 0,
        status: "published",
      }),
    enabled: q.length > 0,
  });

  return {
    results: result.data?.items ?? [],
    total: result.data?.total ?? 0,
    loading: q.length > 0 && result.isFetching,
    error: result.error instanceof Error ? result.error.message : null,
  };
}
