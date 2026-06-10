import { Music2 } from "lucide-react";
import { coverGradient, getCoverImageUrl } from "@/lib/tracks";
import type { Track } from "@/types";

interface CoverArtProps {
  track?: Track | null;
  seed?: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizes = {
  sm: "h-10 w-10",
  md: "h-12 w-12",
  lg: "h-32 w-32",
  xl: "h-56 w-56",
};

export function CoverArt({ track, seed, size = "md", className = "" }: CoverArtProps) {
  const coverUrl = track ? getCoverImageUrl(track) : null;
  const gradient = track
    ? coverGradient(track)
    : `linear-gradient(135deg, #1ed76033, #282828)`;

  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded shadow-lg ${sizes[size]} ${className}`}
      style={coverUrl ? undefined : { background: gradient }}
      title={track?.title ?? seed}
    >
      {coverUrl ? (
        <img src={coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <Music2
          className={`text-white/40 ${size === "sm" ? "h-4 w-4" : size === "xl" ? "h-16 w-16" : "h-6 w-6"}`}
        />
      )}
      {track && (
        <span className="absolute bottom-1 right-1 text-xs opacity-60">♂</span>
      )}
    </div>
  );
}
