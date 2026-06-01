import type { GachiMetadata, LyricsDocument, LyricsLine } from "@/types";

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
