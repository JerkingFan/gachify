import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { queryKeys } from "@/lib/queryKeys";
import type { TrackFilterParams } from "@/lib/trackFilters";
import { useAuthStore } from "@/store/authStore";

export function useFilterPresets() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: queryKeys.filterPresets,
    queryFn: () => api.getFilterPresets(),
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  const create = useMutation({
    mutationFn: (input: { name: string; filters: TrackFilterParams }) =>
      api.createFilterPreset(input.name, input.filters),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.filterPresets }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteFilterPreset(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.filterPresets }),
  });

  return {
    presets: q.data?.items ?? [],
    loading: q.isLoading,
    createPreset: create.mutateAsync,
    deletePreset: remove.mutateAsync,
    creating: create.isPending,
  };
}
