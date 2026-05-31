import { useEffect, useState } from "react";
import { api } from "@/api/client";
import type { ArtistSearchResult } from "@/types";

export function useArtistSearch(query: string, debounceMs = 300) {
  const [results, setResults] = useState<ArtistSearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setTotal(0);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await api.searchArtists({ q, limit: 20 });
          setResults(res.items);
          setTotal(res.total);
          setError(null);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Artist search failed");
          setResults([]);
          setTotal(0);
        } finally {
          setLoading(false);
        }
      })();
    }, debounceMs);

    return () => window.clearTimeout(timer);
  }, [query, debounceMs]);

  return { results, total, loading, error };
}
