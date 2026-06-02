import { X } from "lucide-react";
import { useUIStore } from "@/store/uiStore";

const ROWS: Array<{ keys: string; action: string }> = [
  { keys: "Space", action: "Play / pause" },
  { keys: "← / →", action: "Previous / next track" },
  { keys: "M", action: "Like current track" },
  { keys: "L", action: "Lyrics / karaoke" },
  { keys: "?", action: "This cheat sheet" },
  { keys: "Esc", action: "Close cheat sheet" },
];

export function KeyboardShortcutsModal() {
  const open = useUIStore((s) => s.shortcutsHelpOpen);
  const setOpen = useUIStore((s) => s.setShortcutsHelpOpen);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal
      aria-labelledby="shortcuts-title"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-md rounded-xl bg-spotify-elevated p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="shortcuts-title" className="text-xl font-bold">
              Keyboard shortcuts
            </h2>
            <p className="mt-1 text-sm text-spotify-muted">
              Works when you are not typing in a field.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-full p-2 text-spotify-muted hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <ul className="space-y-3">
          {ROWS.map((row) => (
            <li key={row.keys} className="flex items-center justify-between gap-4 text-sm">
              <kbd className="rounded-md bg-spotify-black px-2.5 py-1 font-mono text-xs font-semibold text-white">
                {row.keys}
              </kbd>
              <span className="text-spotify-muted">{row.action}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
