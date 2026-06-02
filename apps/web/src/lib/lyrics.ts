import { parseGachiMeta } from "@/lib/tracks";
import type { GachiMetadata, LyricsDocument, LyricsLine, Track } from "@/types";

const lrcTime = /\[(\d{1,2}):(\d{2})(?:[.:](\d{2,3}))?\]/g;

export function parseLRC(raw: string): LyricsDocument {
  const lines: LyricsLine[] = [];
  for (const row of raw.split("\n")) {
    const trimmed = row.trim();
    if (!trimmed) continue;
    const stamps: RegExpExecArray[] = [];
    let m: RegExpExecArray | null;
    lrcTime.lastIndex = 0;
    while ((m = lrcTime.exec(trimmed)) !== null) {
      stamps.push(m);
    }
    if (!stamps.length) continue;
    const text = trimmed.replace(lrcTime, "").trim();
    if (!text) continue;
    for (const match of stamps) {
      const min = Number(match[1]);
      const sec = Number(match[2]);
      let ms = 0;
      if (match[3]) {
        const frac = Number(match[3]);
        ms = match[3].length === 3 ? frac : frac * 10;
      }
      lines.push({ start_ms: (min * 60 + sec) * 1000 + ms, text });
    }
  }
  lines.sort((a, b) => a.start_ms - b.start_ms);
  return { lines, format: "lrc", source: "lrc" };
}

export function trackHasLyrics(meta: GachiMetadata | Record<string, unknown>): boolean {
  const doc = parseLyricsFromTrack(meta);
  return Boolean(doc?.lines?.length);
}

export function trackHasLyricsFromTrack(track: Track | null): boolean {
  if (!track) return false;
  return trackHasLyrics(parseGachiMeta(track));
}

export function parseLyricsFromTrack(meta: GachiMetadata | Record<string, unknown>): LyricsDocument | null {
  const raw = meta as Record<string, unknown>;
  const lyrics = raw.lyrics;
  if (!lyrics || typeof lyrics !== "object") return null;
  const doc = lyrics as LyricsDocument;
  if (!Array.isArray(doc.lines) || doc.lines.length === 0) return null;
  return doc;
}

export function activeLyricIndex(lines: LyricsLine[], positionMs: number): number {
  let active = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].start_ms <= positionMs) active = i;
    else break;
  }
  return active;
}

export async function readLrcFile(file: File): Promise<string> {
  return file.text();
}
