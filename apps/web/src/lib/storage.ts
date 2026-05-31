/** Client-only data (not synced to server). */

const RECENT_KEY = "gachify:recent";

export function addRecent(trackId: string): void {
  const ids = getRecentIds().filter((id) => id !== trackId);
  ids.unshift(trackId);
  localStorage.setItem(RECENT_KEY, JSON.stringify(ids.slice(0, 50)));
}

export function getRecentIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}
