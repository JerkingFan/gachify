import { Link } from "react-router-dom";
import { usePlayerStore } from "@/store/playerStore";
import type { Track } from "@/types";
import { getArtistName } from "@/lib/tracks";
import { CoverArt } from "./CoverArt";
import { PlayButton } from "./PlayButton";

interface TrackCardProps {
  track: Track;
  queue: Track[];
}

export function TrackCard({ track, queue }: TrackCardProps) {
  const current = usePlayerStore((s) => s.currentTrack);
  const playing = usePlayerStore((s) => s.isPlaying);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const togglePlay = usePlayerStore((s) => s.togglePlay);

  const isCurrent = current?.id === track.id;
  const isActive = isCurrent && playing;

  return (
    <div className="group card-hover">
      <Link to={`/track/${track.id}`} className="block">
        <div className="relative mb-4">
          <CoverArt track={track} size="lg" className="!h-auto !w-full aspect-square" />
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
      </Link>
    </div>
  );
}
