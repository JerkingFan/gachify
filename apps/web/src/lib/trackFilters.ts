/** Query params for GET /api/v1/tracks metadata filters. */
export type TrackFilterParams = {
  q?: string;
  sort?: string;
  mood?: string;
  sample?: string;
  min_power?: number;
  max_power?: number;
  min_deepness?: number;
  max_deepness?: number;
  min_bpm?: number;
  max_bpm?: number;
  has_lyrics?: boolean;
};

export function filtersToSearchParams(filters: TrackFilterParams): URLSearchParams {
  const p = new URLSearchParams();
  if (filters.q?.trim()) p.set("q", filters.q.trim());
  if (filters.sort) p.set("sort", filters.sort);
  if (filters.mood) p.set("mood", filters.mood);
  if (filters.sample) p.set("sample", filters.sample);
  if (filters.min_power != null) p.set("min_power", String(filters.min_power));
  if (filters.max_power != null) p.set("max_power", String(filters.max_power));
  if (filters.min_deepness != null) p.set("min_deepness", String(filters.min_deepness));
  if (filters.max_deepness != null) p.set("max_deepness", String(filters.max_deepness));
  if (filters.min_bpm != null) p.set("min_bpm", String(filters.min_bpm));
  if (filters.max_bpm != null) p.set("max_bpm", String(filters.max_bpm));
  if (filters.has_lyrics) p.set("karaoke", "1");
  return p;
}

export function searchParamsToFilters(params: URLSearchParams): TrackFilterParams {
  const num = (key: string) => {
    const v = params.get(key);
    if (v == null || v === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  return {
    q: params.get("q") ?? undefined,
    sort: params.get("sort") ?? undefined,
    mood: params.get("mood") ?? undefined,
    sample: params.get("sample") ?? undefined,
    min_power: num("min_power"),
    max_power: num("max_power"),
    min_deepness: num("min_deepness"),
    max_deepness: num("max_deepness"),
    min_bpm: num("min_bpm"),
    max_bpm: num("max_bpm"),
    has_lyrics: params.get("karaoke") === "1" || params.get("has_lyrics") === "1",
  };
}

export function hasActiveFilters(filters: TrackFilterParams): boolean {
  return Boolean(
    filters.mood ||
      filters.sample ||
      filters.min_power != null ||
      filters.max_power != null ||
      filters.min_deepness != null ||
      filters.max_deepness != null ||
      filters.min_bpm != null ||
      filters.max_bpm != null ||
      filters.has_lyrics,
  );
}

/** Human-readable filter summary, e.g. "Dungeon · BPM 120–140 · power 80+". */
export function describeFilters(filters: TrackFilterParams): string {
  const parts: string[] = [];
  if (filters.mood) {
    parts.push(filters.mood.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
  }
  if (filters.sample) {
    parts.push(filters.sample.replace(/_/g, " "));
  }
  if (filters.min_bpm != null || filters.max_bpm != null) {
    if (filters.min_bpm != null && filters.max_bpm != null) {
      parts.push(`BPM ${filters.min_bpm}–${filters.max_bpm}`);
    } else if (filters.min_bpm != null) {
      parts.push(`BPM ${filters.min_bpm}+`);
    } else {
      parts.push(`BPM ≤${filters.max_bpm}`);
    }
  }
  if (filters.min_power != null) {
    parts.push(`power ${filters.min_power}+`);
  } else if (filters.max_power != null) {
    parts.push(`power ≤${filters.max_power}`);
  }
  if (filters.min_deepness != null) {
    parts.push(`deepness ${filters.min_deepness}+`);
  }
  if (filters.has_lyrics) {
    parts.push("karaoke");
  }
  return parts.join(" · ") || "All remixes";
}
