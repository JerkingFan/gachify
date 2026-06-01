import { useEffect, useState } from "react";
import { api } from "@/api/client";
import { parseLyricsFromTrack } from "@/lib/lyrics";
import { parseGachiMeta } from "@/lib/tracks";
import type { LyricsDocument, Track } from "@/types";

export function useTrackLyrics(track: Track | null): LyricsDocument | null {
  const [doc, setDoc] = useState<LyricsDocument | null>(null);

  useEffect(() => {
    if (!track) {
      setDoc(null);
      return;
    }
    const fromMeta = parseLyricsFromTrack(parseGachiMeta(track));
    if (fromMeta) {
      setDoc(fromMeta);
      return;
    }
    let cancelled = false;
    void api
      .getTrackLyrics(track.id)
      .then((d) => {
        if (cancelled) return;
        setDoc(d.lines?.length ? d : null);
      })
      .catch(() => {
        if (!cancelled) setDoc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [track?.id]);

  return doc;
}
