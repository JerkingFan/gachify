import type { TrackFilterParams } from "@/lib/trackFilters";

export const trackKeys = {
  all: ["tracks"] as const,
  lists: () => [...trackKeys.all, "list"] as const,
  list: (params: { status?: string } & TrackFilterParams) =>
    [...trackKeys.lists(), params] as const,
};

export const artistKeys = {
  all: ["artists"] as const,
  search: (q: string) => [...artistKeys.all, "search", q] as const,
};

export const queryKeys = {
  forYou: (limit: number) => ["for-you", limit] as const,
  filterPresets: ["filter-presets"] as const,
};
