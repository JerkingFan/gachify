import { Check, MessageCircle } from "lucide-react";
import { useState } from "react";
import { copyDiscordStatus } from "@/hooks/useDiscordStatus";
import { usePlayerStore } from "@/store/playerStore";

export function DiscordStatusButton() {
  const track = usePlayerStore((s) => s.currentTrack);
  const [copied, setCopied] = useState(false);

  if (!track) return null;

  return (
    <button
      type="button"
      className="btn-icon touch-target text-white/70 hover:text-[#5865F2]"
      aria-label="Copy Discord status"
      title="Copy «Listening on Gachify» for Discord custom status"
      onClick={() => {
        void copyDiscordStatus(track.title, track.id).then((ok) => {
          if (ok) {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
          }
        });
      }}
    >
      {copied ? <Check className="h-5 w-5 text-spotify-green" /> : <MessageCircle className="h-5 w-5" />}
    </button>
  );
}
