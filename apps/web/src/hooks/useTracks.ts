import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { api } from "@/api/client";
import { trackKeys } from "@/lib/queryKeys";
import { dedupeTracks } from "@/lib/tracksQuery";

const PAGE_SIZE = 50;

export function useTracks() {
  const query = useInfiniteQuery({
    queryKey: trackKeys.list({ status: "published" }),
    queryFn: ({ pageParam }) =>
      api.getTracks({
        limit: PAGE_SIZE,
        offset: pageParam,
        status: "published",
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.has_more) return undefined;
      return allPages.reduce((n, p) => n + p.items.length, 0);
    },
  });

  const tracks = useMemo(
    () => dedupeTracks(query.data?.pages.flatMap((p) => p.items) ?? []),
    [query.data],
  );

  const total = query.data?.pages[0]?.total ?? 0;
  const hasMore = query.hasNextPage ?? false;

  return {
    tracks,
    total,
    hasMore,
    loading: query.isPending,
    loadingMore: query.isFetchingNextPage,
    error: query.error instanceof Error ? query.error.message : null,
    refresh: () => void query.refetch(),
    loadMore: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) {
        void query.fetchNextPage();
      }
    },
  };
}
