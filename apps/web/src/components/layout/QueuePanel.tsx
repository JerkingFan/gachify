import { ListMusic, X } from "lucide-react";
import { CoverArt } from "@/components/ui/CoverArt";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDuration, getSubtitle } from "@/lib/tracks";
import { usePlayerStore } from "@/store/playerStore";
import { useUIStore } from "@/store/uiStore";

export function QueuePanel() {
  const open = useUIStore((s) => s.queuePanelOpen);
  const setOpen = useUIStore((s) => s.setQueuePanelOpen);
  const queue = usePlayerStore((s) => s.queue);
  const queueIndex = usePlayerStore((s) => s.queueIndex);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const playQueueIndex = usePlayerStore((s) => s.playQueueIndex);
  const removeFromQueue = usePlayerStore((s) => s.removeFromQueue);
  const clearUpcoming = usePlayerStore((s) => s.clearUpcoming);
  const togglePlay = usePlayerStore((s) => s.togglePlay);

  if (!open) return null;

  const upcoming = queue.slice(queueIndex + 1);

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/60"
        aria-label="Close queue"
        onClick={() => setOpen(false)}
      />
      <aside
        className="fixed bottom-[90px] right-0 top-0 z-50 flex w-full max-w-[420px] flex-col border-l border-white/10 bg-spotify-elevated shadow-2xl"
        aria-label="Queue"
      >
        <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <h2 className="text-lg font-bold">Queue</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="btn-icon"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {queue.length === 0 ? (
            <EmptyState
              icon={ListMusic}
              title="Queue is empty"
              description="Play a track or album to build your queue."
            />
          ) : (
            <>
              {currentTrack && (
                <section className="mb-6">
                  <p className="mb-3 text-xs font-semibold uppercase text-spotify-muted">
                    Now playing
                  </p>
                  <button
                    type="button"
                    onClick={togglePlay}
                    className="flex w-full items-center gap-3 rounded-md bg-spotify-highlight/80 p-2 text-left hover:bg-spotify-highlight"
                  >
                    <CoverArt track={currentTrack} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-spotify-green">
                        {currentTrack.title}
                      </p>
                      <p className="truncate text-xs text-spotify-muted">
                        {getSubtitle(currentTrack)}
                      </p>
                    </div>
                    <span className="text-xs text-spotify-muted">
                      {isPlaying ? "▶" : "❚❚"}
                    </span>
                  </button>
                </section>
              )}

              {queue.slice(0, queueIndex).length > 0 && (
                <section className="mb-6">
                  <p className="mb-2 text-xs font-semibold uppercase text-spotify-muted">
                    Previously played
                  </p>
                  <ul className="space-y-1 opacity-60">
                    {queue.slice(0, queueIndex).map((t, i) => (
                      <QueueItem
                        key={`${t.id}-${i}`}
                        track={t}
                        onPlay={() => playQueueIndex(i)}
                        onRemove={() => removeFromQueue(i)}
                      />
                    ))}
                  </ul>
                </section>
              )}

              <section>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase text-spotify-muted">
                    Next up
                  </p>
                  {upcoming.length > 0 && (
                    <button
                      type="button"
                      onClick={clearUpcoming}
                      className="text-xs text-spotify-muted hover:text-white"
                    >
                      Clear
                    </button>
                  )}
                </div>
                {upcoming.length === 0 ? (
                  <p className="py-4 text-sm text-spotify-muted">No more tracks in queue.</p>
                ) : (
                  <ul className="space-y-1">
                    {upcoming.map((t, offset) => {
                      const i = queueIndex + 1 + offset;
                      return (
                        <QueueItem
                          key={`${t.id}-${i}`}
                          track={t}
                          onPlay={() => playQueueIndex(i)}
                          onRemove={() => removeFromQueue(i)}
                        />
                      );
                    })}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

function QueueItem({
  track,
  onPlay,
  onRemove,
}: {
  track: import("@/types").Track;
  onPlay: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="group flex items-center gap-2 rounded-md hover:bg-white/10">
      <button
        type="button"
        onClick={onPlay}
        className="flex min-w-0 flex-1 items-center gap-3 p-2 text-left"
      >
        <CoverArt track={track} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-sm text-white">{track.title}</p>
          <p className="truncate text-xs text-spotify-muted">
            {formatDuration(track.duration_ms)}
          </p>
        </div>
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="btn-icon mr-1 opacity-0 group-hover:opacity-100"
        aria-label="Remove from queue"
      >
        <X className="h-4 w-4" />
      </button>
    </li>
  );
}
