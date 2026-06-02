/** Recently played — localStorage fallback + server sync when logged in. */

import { api } from "@/api/client";
import { getStoredTokens } from "@/api/client";

const RECENT_KEY = "gachify:recent";
export const RECENT_UPDATED_EVENT = "gachify:recent-updated";

function notifyRecentUpdated(): void {
  window.dispatchEvent(new Event(RECENT_UPDATED_EVENT));
}

export function addRecent(trackId: string): void {
  const ids = getRecentIds().filter((id) => id !== trackId);
  ids.unshift(trackId);
  localStorage.setItem(RECENT_KEY, JSON.stringify(ids.slice(0, 50)));
  notifyRecentUpdated();

  if (getStoredTokens().access) {
    void api.addRecent(trackId).catch(() => {});
  }
}

export function getRecentIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

export async function syncRecentFromServer(): Promise<void> {
  if (!getStoredTokens().access) return;
  try {
    const { track_ids } = await api.getRecent();
    if (track_ids.length) {
      localStorage.setItem(RECENT_KEY, JSON.stringify(track_ids.slice(0, 50)));
      notifyRecentUpdated();
    }
  } catch {
    // keep local fallback
  }
}
