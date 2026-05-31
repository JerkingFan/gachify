export const trackKeys = {
  all: ["tracks"] as const,
  lists: () => [...trackKeys.all, "list"] as const,
  list: (params: { status?: string; q?: string }) =>
    [...trackKeys.lists(), params] as const,
};

export const artistKeys = {
  all: ["artists"] as const,
  search: (q: string) => [...artistKeys.all, "search", q] as const,
};
