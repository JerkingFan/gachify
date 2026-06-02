import { Radio } from "lucide-react";
import { usePlayerStore } from "@/store/playerStore";
import type { Track } from "@/types";

type RadioStartButtonProps = {
  track: Track;
  queue?: Track[];
  variant?: "primary" | "ghost" | "icon";
  className?: string;
  label?: string;
};

export function RadioStartButton({
  track,
  queue,
  variant = "ghost",
  className = "",
  label = "Radio",
}: RadioStartButtonProps) {
  const startRadio = usePlayerStore((s) => s.startRadio);
  const radioMode = usePlayerStore((s) => s.radioMode);
  const current = usePlayerStore((s) => s.currentTrack);
  const isSeed = current?.id === track.id && radioMode;

  const base =
    variant === "primary"
      ? "inline-flex items-center gap-2 rounded-full bg-spotify-highlight px-5 py-2.5 text-sm font-bold text-white hover:bg-spotify-elevated"
      : variant === "icon"
        ? "flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur hover:bg-spotify-green hover:text-black"
        : "inline-flex items-center gap-2 rounded-full border border-white/30 px-4 py-2 text-sm font-semibold text-white hover:border-white hover:bg-white/10";

  return (
    <button
      type="button"
      aria-label={`Start radio from ${track.title}`}
      title="Start radio — similar tracks play automatically"
      className={`${base} ${isSeed ? "border-spotify-green text-spotify-green" : ""} ${className}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void startRadio(track, queue);
      }}
    >
      <Radio className={variant === "icon" ? "h-4 w-4" : "h-4 w-4 shrink-0"} />
      {variant !== "icon" && <span>{label}</span>}
    </button>
  );
}
