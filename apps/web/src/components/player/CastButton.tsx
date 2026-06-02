import { Cast, Airplay } from "lucide-react";

type CastButtonProps = {
  audio?: HTMLAudioElement | null;
  className?: string;
};

/** AirPlay (Safari) + Chromecast hint via remote playback when available. */
export function CastButton({ audio, className = "" }: CastButtonProps) {
  const remote = audio && "remote" in audio ? (audio as HTMLMediaElement & { remote?: RemotePlayback }).remote : undefined;

  const promptRemote = async () => {
    if (remote && typeof remote.prompt === "function") {
      try {
        await remote.prompt();
      } catch {
        /* user cancelled */
      }
      return;
    }
    if (audio) {
      audio.setAttribute("x-webkit-airplay", "allow");
      audio.setAttribute("airplay", "allow");
    }
  };

  const Icon = remote ? Cast : Airplay;

  return (
    <button
      type="button"
      onClick={() => void promptRemote()}
      className={`btn-icon touch-target text-white/70 hover:text-white ${className}`}
      aria-label="Play on TV or speaker"
      title={remote ? "Cast to device" : "Use AirPlay from browser controls"}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}
