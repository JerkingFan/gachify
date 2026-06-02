import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { queryKeys } from "@/lib/queryKeys";
import { useAuthStore } from "@/store/authStore";

export function useForYou(limit = 20) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const q = useQuery({
    queryKey: queryKeys.forYou(limit),
    queryFn: () => api.getForYou(),
    enabled: isAuthenticated,
    staleTime: 60_000,
  });

  return {
    tracks: (q.data?.items ?? []).slice(0, limit),
    loading: q.isLoading,
    error: q.error instanceof Error ? q.error.message : null,
    refresh: () => void q.refetch(),
  };
}
