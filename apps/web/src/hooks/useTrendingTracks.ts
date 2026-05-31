import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { trackKeys } from "@/lib/queryKeys";

export function useTrendingTracks(limit = 20) {
  const query = useQuery({
    queryKey: trackKeys.list({ status: "published", sort: "trending" }),
    queryFn: () =>
      api.getTracks({ limit, offset: 0, status: "published", sort: "trending" }),
  });
  return {
    tracks: query.data?.items ?? [],
    loading: query.isPending,
    error: query.error instanceof Error ? query.error.message : null,
  };
}
