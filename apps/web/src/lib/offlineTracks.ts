import { api } from "@/api/client";

const DB_NAME = "gachify-offline-v1";
const STORE = "tracks";
const DB_VERSION = 1;

export type OfflineTrackRecord = {
  trackId: string;
  format: "mp3" | "hls_local";
  /** Serialized playlist for hls_local */
  playlist?: string;
  mp3?: ArrayBuffer;
  segments?: ArrayBuffer[];
  downloadedAt: number;
  expiresAt: number;
  sizeBytes: number;
};

export const OFFLINE_MAX_TRACKS = 25;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "trackId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/i, "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function b64ToBytes(b64: string): Uint8Array {
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function decryptAes128Cbc(data: ArrayBuffer, key: Uint8Array, iv: Uint8Array): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "AES-CBC" }, false, ["decrypt"]);
  return crypto.subtle.decrypt({ name: "AES-CBC", iv }, cryptoKey, data);
}

function buildLocalPlaylist(segmentBlobUrls: string[], targetDuration = 6): string {
  const lines = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    `#EXT-X-TARGETDURATION:${targetDuration}`,
    "#EXT-X-MEDIA-SEQUENCE:0",
  ];
  for (const url of segmentBlobUrls) {
    lines.push(`#EXTINF:${targetDuration}.0,`, url);
  }
  lines.push("#EXT-X-ENDLIST");
  return lines.join("\n") + "\n";
}

export async function listOfflineTrackIds(): Promise<string[]> {
  if (!("indexedDB" in window)) return [];
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAllKeys();
    req.onsuccess = () => resolve((req.result as string[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

export async function getOfflineRecord(trackId: string): Promise<OfflineTrackRecord | null> {
  if (!("indexedDB" in window)) return null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(trackId);
    req.onsuccess = () => resolve((req.result as OfflineTrackRecord) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function removeOfflineTrack(trackId: string): Promise<void> {
  if (!("indexedDB" in window)) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(trackId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  try {
    await api.removeOfflineTrack(trackId);
  } catch {
    /* server sync optional */
  }
}

export async function estimateOfflineBytes(): Promise<number> {
  if (!("indexedDB" in window)) return 0;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      const rows = (req.result as OfflineTrackRecord[]) ?? [];
      resolve(rows.reduce((s, r) => s + (r.sizeBytes ?? 0), 0));
    };
    req.onerror = () => reject(req.error);
  });
}

export async function downloadTrackForOffline(trackId: string): Promise<void> {
  if (!("indexedDB" in window)) throw new Error("Offline storage not supported");

  const existing = await listOfflineTrackIds();
  if (!existing.includes(trackId) && existing.length >= OFFLINE_MAX_TRACKS) {
    throw new Error(`Offline limit: ${OFFLINE_MAX_TRACKS} tracks`);
  }

  const pkg = await api.getOfflinePackage(trackId);
  const expiresAt = new Date(pkg.expires_at).getTime();

  if (pkg.format === "mp3" && pkg.audio_url) {
    const res = await fetch(pkg.audio_url);
    if (!res.ok) throw new Error("Failed to fetch audio");
    const mp3 = await res.arrayBuffer();
    await saveRecord({
      trackId,
      format: "mp3",
      mp3,
      downloadedAt: Date.now(),
      expiresAt,
      sizeBytes: mp3.byteLength,
    });
    return;
  }

  if (pkg.format === "hls_offline" && pkg.segments?.length && pkg.aes_key) {
    const key = b64ToBytes(pkg.aes_key);
    const iv = pkg.aes_iv ? hexToBytes(pkg.aes_iv) : new Uint8Array(16);
    const segments: ArrayBuffer[] = [];
    let total = 0;
    for (const seg of pkg.segments) {
      const res = await fetch(seg.url);
      if (!res.ok) throw new Error(`Failed to fetch segment ${seg.name}`);
      const enc = await res.arrayBuffer();
      const dec = await decryptAes128Cbc(enc, key, iv);
      segments.push(dec);
      total += dec.byteLength;
    }
    const blobUrls = segments.map((buf) => URL.createObjectURL(new Blob([buf], { type: "video/mp2t" })));
    const playlist = buildLocalPlaylist(blobUrls);
    await saveRecord({
      trackId,
      format: "hls_local",
      playlist,
      segments,
      downloadedAt: Date.now(),
      expiresAt,
      sizeBytes: total,
    });
    return;
  }

  throw new Error("Track cannot be downloaded for offline");
}

async function saveRecord(record: OfflineTrackRecord): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Returns a playback URL if track is available offline and not expired. */
export async function getOfflinePlayback(
  trackId: string,
): Promise<{ format: "mp3" | "hls"; url: string } | null> {
  const rec = await getOfflineRecord(trackId);
  if (!rec) return null;
  if (rec.expiresAt && Date.now() > rec.expiresAt) {
    await removeOfflineTrack(trackId);
    return null;
  }

  if (rec.format === "mp3" && rec.mp3) {
    return { format: "mp3", url: URL.createObjectURL(new Blob([rec.mp3], { type: "audio/mpeg" })) };
  }

  if (rec.format === "hls_local" && rec.segments?.length) {
    const blobUrls = rec.segments.map((buf) =>
      URL.createObjectURL(new Blob([buf], { type: "video/mp2t" })),
    );
    const playlist = rec.playlist ?? buildLocalPlaylist(blobUrls);
    const blob = new Blob([playlist], { type: "application/vnd.apple.mpegurl" });
    return { format: "hls", url: URL.createObjectURL(blob) };
  }

  return null;
}

export function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
