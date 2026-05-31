import { useEffect, useState } from "react";
import { api } from "@/api/client";
import type { Track } from "@/types";

export function useTrackSearch(query: string, debounceMs = 300) {
  const [results, setResults] = useState<Track[]>([]);
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
          const res = await api.getTracks({
            q,
            limit: 50,
            offset: 0,
            status: "published",
          });
          setResults(res.items);
          setTotal(res.total);
          setError(null);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Search failed");
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
