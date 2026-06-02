import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { TrackFilterParams } from "@/lib/trackFilters";
import { trackKeys } from "@/lib/queryKeys";

export function useFilteredTracks(filters: TrackFilterParams, limit = 40) {
  const result = useQuery({
    queryKey: trackKeys.list({ status: "published", ...filters }),
    queryFn: () =>
      api.getTracks({
        status: "published",
        limit,
        offset: 0,
        ...filters,
      }),
  });

  return {
    tracks: result.data?.items ?? [],
    total: result.data?.total ?? 0,
    loading: result.isLoading,
    error: result.error instanceof Error ? result.error.message : null,
  };
}
