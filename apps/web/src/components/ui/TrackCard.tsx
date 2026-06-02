import { Link } from "react-router-dom";
import { usePlayerStore } from "@/store/playerStore";
import type { Track } from "@/types";
import { getArtistName, parseGachiMeta } from "@/lib/tracks";
import { CoverArt } from "./CoverArt";
import { PlayButton } from "./PlayButton";
import { RadioStartButton } from "./RadioStartButton";

interface TrackCardProps {
  track: Track;
  queue: Track[];
  /** Show a radio CTA on the cover (Discover, track grids). */
  showRadio?: boolean;
}

export function TrackCard({ track, queue, showRadio }: TrackCardProps) {
  const current = usePlayerStore((s) => s.currentTrack);
  const playing = usePlayerStore((s) => s.isPlaying);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const togglePlay = usePlayerStore((s) => s.togglePlay);

  const isCurrent = current?.id === track.id;
  const isActive = isCurrent && playing;
  const meta = parseGachiMeta(track);
  const metaHint =
    meta.gachi_power_level != null
      ? `♂️ ${meta.gachi_power_level}`
      : meta.mood_tags?.[0]?.replace(/_/g, " ");

  return (
    <div className="group card-hover" data-testid="track-card">
      <Link to={`/track/${track.id}`} className="block">
        <div className="relative mb-4">
          <CoverArt track={track} size="lg" className="!h-auto !w-full aspect-square" />
          {showRadio && (
            <div className="absolute bottom-2 left-2 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
              <RadioStartButton track={track} queue={queue} variant="icon" />
            </div>
          )}
          <div className="absolute bottom-2 right-2">
            <PlayButton
              size="lg"
              className="!opacity-100 shadow-2xl"
              isPlaying={isActive}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (isCurrent) togglePlay();
                else playTrack(track, queue);
              }}
            />
          </div>
        </div>
        <p className="truncate font-semibold text-white">{track.title}</p>
        <p className="truncate text-sm text-spotify-muted">{getArtistName(track)}</p>
        {metaHint && (
          <p className="mt-0.5 truncate text-xs text-spotify-subtle">{metaHint}</p>
        )}
      </Link>
    </div>
  );
}
