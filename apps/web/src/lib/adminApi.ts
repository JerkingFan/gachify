const STORAGE_KEY = "gachify:admin-key";

export function getAdminKey(): string | null {
  return sessionStorage.getItem(STORAGE_KEY);
}

export function setAdminKey(key: string) {
  sessionStorage.setItem(STORAGE_KEY, key);
}

export function clearAdminKey() {
  sessionStorage.removeItem(STORAGE_KEY);
}

async function adminRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const key = getAdminKey();
  if (!key) {
    throw new Error("Admin key not set");
  }
  const res = await fetch(`/internal/admin${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Gachify-Admin-Key": key,
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 401) {
    clearAdminKey();
    throw new Error("Invalid admin key");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `Admin API error ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export type AdminTrack = {
  id: string;
  title: string;
  status: string;
  creator?: { handle: string; display_name: string };
  created_at: string;
};

export type DLQEntry = {
  job: { track_id: string; job_id: string };
  error: string;
  failed_at: string;
};

export type QueueDepths = {
  pending: number;
  processing: number;
  retry: number;
  dlq: number;
};

export const adminApi = {
  async verifyKey(key: string): Promise<boolean> {
    const res = await fetch("/internal/admin/queue/depths", {
      headers: { "X-Gachify-Admin-Key": key },
    });
    return res.ok;
  },

  listPending(): Promise<{ items: AdminTrack[]; total: number }> {
    return adminRequest("/tracks?status=pending_review");
  },

  approveTrack(id: string): Promise<void> {
    return adminRequest(`/tracks/${id}/approve`, { method: "POST" });
  },

  rejectTrack(id: string, reason?: string): Promise<void> {
    return adminRequest(`/tracks/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason: reason ?? "" }),
    });
  },

  listDLQ(): Promise<{ items: DLQEntry[] }> {
    return adminRequest("/queue/dlq");
  },

  queueDepths(): Promise<QueueDepths> {
    return adminRequest("/queue/depths");
  },

  retryDLQ(trackId: string): Promise<void> {
    return adminRequest("/queue/dlq/retry", {
      method: "POST",
      body: JSON.stringify({ track_id: trackId }),
    });
  },
};
