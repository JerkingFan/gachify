import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useTrackSearch } from "@/hooks/useTrackSearch";
import { api } from "@/api/client";

vi.mock("@/api/client", () => ({
  api: {
    getTracks: vi.fn(),
  },
}));

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

describe("useTrackSearch", () => {
  beforeEach(() => {
    vi.mocked(api.getTracks).mockReset();
  });

  it("returns empty results for blank query", () => {
    const client = new QueryClient();
    const { result } = renderHook(() => useTrackSearch(""), {
      wrapper: wrapper(client),
    });
    expect(result.current.results).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it("debounces and fetches tracks", async () => {
    vi.mocked(api.getTracks).mockResolvedValue({
      items: [{ id: "t1", title: "Test" } as never],
      total: 1,
      limit: 50,
      offset: 0,
      has_more: false,
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useTrackSearch("dungeon", false, 50), {
      wrapper: wrapper(client),
    });

    await waitFor(
      () => {
        expect(result.current.results).toHaveLength(1);
      },
      { timeout: 2000 },
    );
    expect(api.getTracks).toHaveBeenCalledWith(
      expect.objectContaining({ q: "dungeon", status: "published" }),
    );
  });

  it("fetches karaoke-only without query text", async () => {
    vi.mocked(api.getTracks).mockResolvedValue({
      items: [],
      total: 0,
      limit: 50,
      offset: 0,
      has_more: false,
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useTrackSearch("", true, 10), {
      wrapper: wrapper(client),
    });

    await waitFor(() => {
      expect(api.getTracks).toHaveBeenCalledWith(
        expect.objectContaining({ has_lyrics: true, status: "published" }),
      );
    });
    expect(result.current.loading).toBe(false);
  });
});
