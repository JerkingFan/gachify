import { Share2 } from "lucide-react";

type ShareButtonProps = {
  path: string;
  label?: string;
};

export function ShareButton({ path, label = "Share" }: ShareButtonProps) {
  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/share${path}`
      : `/share${path}`;

  const copy = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ url: shareUrl, title: document.title });
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      /* ignore */
    }
  };

  return (
    <button
      type="button"
      className="btn-icon touch-target"
      aria-label={label}
      title={label}
      onClick={() => void copy()}
    >
      <Share2 className="h-5 w-5" />
    </button>
  );
}
