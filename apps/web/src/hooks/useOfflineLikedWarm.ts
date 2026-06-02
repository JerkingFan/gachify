import { useEffect, useRef } from "react";
import { warmLikedPreviewCache } from "@/lib/offlineLiked";
import { useAuthStore } from "@/store/authStore";
import { useLibraryStore } from "@/store/libraryStore";
import { useTracks } from "@/hooks/useTracks";

/** Prefetch liked preview audio into Cache Storage when online. */
export function useOfflineLikedWarm() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const likedIds = useLibraryStore((s) => s.likedIds);
  const loaded = useLibraryStore((s) => s.loaded);
  const { tracks } = useTracks();
  const warmed = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || !loaded || !tracks.length || warmed.current) return;
    if (!navigator.onLine) return;

    warmed.current = true;
    void warmLikedPreviewCache(tracks, likedIds);
  }, [isAuthenticated, loaded, tracks, likedIds]);
}
