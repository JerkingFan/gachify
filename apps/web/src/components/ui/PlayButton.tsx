import { Pause, Play } from "lucide-react";

interface PlayButtonProps {
  isPlaying?: boolean;
  size?: "sm" | "lg";
  onClick: (e: React.MouseEvent) => void;
  className?: string;
}

export function PlayButton({
  isPlaying,
  size = "lg",
  onClick,
  className = "",
}: PlayButtonProps) {
  const dim =
    size === "lg"
      ? "h-14 w-14 opacity-0 group-hover:opacity-100 hover:scale-105"
      : "h-8 w-8";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center rounded-full bg-spotify-green text-black shadow-xl transition hover:scale-105 hover:bg-spotify-green-hover ${dim} ${className}`}
      aria-label={isPlaying ? "Pause" : "Play"}
    >
      {isPlaying ? (
        <Pause className={size === "lg" ? "h-7 w-7" : "h-4 w-4"} fill="currentColor" />
      ) : (
        <Play className={`${size === "lg" ? "h-7 w-7" : "h-4 w-4"} ml-0.5`} fill="currentColor" />
      )}
    </button>
  );
}
