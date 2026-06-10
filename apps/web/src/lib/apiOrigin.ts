/** Backend origin for native builds (Capacitor). Empty = same-origin (web). */
export function getApiOrigin(): string {
  const raw = import.meta.env.VITE_API_ORIGIN?.trim() ?? "";
  return raw.replace(/\/$/, "");
}

/** Resolve API/media path or passthrough absolute URL. */
export function apiUrl(pathOrUrl: string): string {
  if (!pathOrUrl) return pathOrUrl;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const origin = getApiOrigin();
  if (!origin) return pathOrUrl;
  return `${origin}${pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`}`;
}

export function isMobileBuild(): boolean {
  return import.meta.env.VITE_MOBILE === "true";
}
