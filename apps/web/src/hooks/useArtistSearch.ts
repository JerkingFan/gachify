import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { artistKeys } from "@/lib/queryKeys";

export function useArtistSearch(query: string, debounceMs = 300) {
  const q = useDebouncedValue(query.trim(), debounceMs);

  const result = useQuery({
    queryKey: artistKeys.search(q),
    queryFn: () => api.searchArtists({ q, limit: 20 }),
    enabled: q.length > 0,
  });

  return {
    results: result.data?.items ?? [],
    total: result.data?.total ?? 0,
    loading: q.length > 0 && result.isFetching,
    error: result.error instanceof Error ? result.error.message : null,
  };
}
