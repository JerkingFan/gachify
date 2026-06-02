import { Check, Code2, Share2 } from "lucide-react";
import { useState } from "react";

type ShareButtonProps = {
  path: string;
  label?: string;
  title?: string;
  trackId?: string;
  timeSec?: number;
};

export function ShareButton({ path, label = "Share", title, trackId, timeSec }: ShareButtonProps) {
  const [copied, setCopied] = useState<"link" | "embed" | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const timeQ = timeSec != null && timeSec > 0 ? `?t=${Math.floor(timeSec)}` : "";
  const shareUrl = `${origin}/share${path}${timeQ}`;
  const embedUrl = trackId ? `${origin}/embed/track/${trackId}?autoplay=1` : null;
  const embedSnippet = embedUrl
    ? `<iframe src="${embedUrl}" width="460" height="152" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen loading="lazy" title="${title ?? "Gachify"}"></iframe>`
    : null;

  const copyLink = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          url: shareUrl,
          title: title ?? document.title,
          text: "Listen on Gachify",
        });
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      setCopied("link");
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      /* ignore */
    }
  };

  const copyEmbed = async () => {
    if (!embedSnippet) return;
    try {
      await navigator.clipboard.writeText(embedSnippet);
      setCopied("embed");
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="inline-flex items-center gap-1">
      <button
        type="button"
        className="btn-icon touch-target"
        aria-label={label}
        title={`Share link (Discord, Telegram, forums) — ${shareUrl}`}
        onClick={() => void copyLink()}
      >
        {copied === "link" ? (
          <Check className="h-5 w-5 text-spotify-green" />
        ) : (
          <Share2 className="h-5 w-5" />
        )}
      </button>
      {embedSnippet && (
        <button
          type="button"
          className="btn-icon touch-target"
          aria-label="Copy embed code"
          title="Copy iframe embed for forums / Discord"
          onClick={() => void copyEmbed()}
        >
          {copied === "embed" ? (
            <Check className="h-5 w-5 text-spotify-green" />
          ) : (
            <Code2 className="h-5 w-5" />
          )}
        </button>
      )}
    </div>
  );
}
