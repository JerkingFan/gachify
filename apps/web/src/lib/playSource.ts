/** Infer play attribution for creator analytics. */
export function detectPlaySource(): string {
  if (typeof window === "undefined") return "direct";
  const path = window.location.pathname;
  const ref = document.referrer;
  if (path.includes("/embed/") || ref.includes("/embed/")) return "embed";
  if (ref.includes("/share/")) return "share";
  if (path.startsWith("/search")) return "search";
  if (path.startsWith("/discover")) return "discover";
  if (path.startsWith("/playlist")) return "playlist";
  if (path.startsWith("/artist")) return "artist";
  if (path.startsWith("/library")) return "library";
  if (path.startsWith("/following")) return "following";
  if (path === "/" || path.startsWith("/home")) return "home";
  if (path.startsWith("/track")) return "track_page";
  return "direct";
}

const SOURCE_LABELS: Record<string, string> = {
  home: "Home",
  search: "Search",
  discover: "Discover",
  playlist: "Playlist",
  artist: "Artist profile",
  track_page: "Track page",
  share: "Shared link",
  embed: "Embed player",
  library: "Library",
  following: "Following feed",
  radio: "Radio",
  direct: "Direct / other",
};

export function playSourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}
