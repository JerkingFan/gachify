import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { trackKeys } from "@/lib/queryKeys";

export function useFeed(limit = 20) {
  const query = useQuery({
    queryKey: [...trackKeys.lists(), "feed", limit],
    queryFn: () => api.getFeed(limit),
  });
  return {
    tracks: query.data?.items ?? [],
    loading: query.isPending,
    error: query.error instanceof Error ? query.error.message : null,
  };
}
