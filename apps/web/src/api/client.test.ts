import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  api,
  clearTokens,
  setOnUnauthorized,
  setTokenProvider,
  storeTokens,
} from "@/api/client";

describe("api refresh on 401", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    clearTokens();
    setTokenProvider(() => ({
      access: localStorage.getItem("gachify:access_token"),
      refresh: localStorage.getItem("gachify:refresh_token"),
    }));
    setOnUnauthorized(() => clearTokens());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retries authenticated request after refresh", async () => {
    storeTokens("old-access", "refresh-token");

    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: "new-access",
          refresh_token: "new-refresh",
          expires_in: 900,
          token_type: "Bearer",
          user: { id: "u1", handle: "test" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ track_ids: [] }),
      });

    const data = await api.getRecent();

    expect(data.track_ids).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(localStorage.getItem("gachify:access_token")).toBe("new-access");
  });
});
