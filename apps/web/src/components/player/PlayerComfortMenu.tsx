import { Gauge, Moon, Timer, VenetianMask } from "lucide-react";
import { useState } from "react";
import { usePlayerStore, type PlaybackRate } from "@/store/playerStore";

const RATES: PlaybackRate[] = [0.75, 1, 1.25, 1.5];
const SLEEP_PRESETS = [15, 30, 45, 60];

export function PlayerComfortMenu() {
  const incognito = usePlayerStore((s) => s.incognito);
  const toggleIncognito = usePlayerStore((s) => s.toggleIncognito);
  const playbackRate = usePlayerStore((s) => s.playbackRate);
  const setPlaybackRate = usePlayerStore((s) => s.setPlaybackRate);
  const sleepTimerEndsAt = usePlayerStore((s) => s.sleepTimerEndsAt);
  const setSleepTimer = usePlayerStore((s) => s.setSleepTimer);
  const [open, setOpen] = useState(false);

  const sleepLeftMin =
    sleepTimerEndsAt != null
      ? Math.max(0, Math.ceil((sleepTimerEndsAt - Date.now()) / 60_000))
      : null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`btn-icon touch-target ${incognito || sleepTimerEndsAt ? "text-spotify-green" : "text-white/70 hover:text-white"}`}
        aria-label="Listening options"
        title="Speed, sleep timer, incognito"
      >
        <Gauge className="h-5 w-5" />
      </button>
      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <div className="absolute bottom-full right-0 z-50 mb-2 w-56 rounded-lg border border-white/10 bg-spotify-elevated p-3 shadow-xl">
            <p className="mb-2 text-xs font-semibold uppercase text-spotify-muted">Speed</p>
            <div className="mb-3 flex flex-wrap gap-1">
              {RATES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setPlaybackRate(r)}
                  className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                    playbackRate === r ? "bg-spotify-green text-black" : "bg-white/10"
                  }`}
                >
                  {r}×
                </button>
              ))}
            </div>
            <p className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase text-spotify-muted">
              <Timer className="h-3.5 w-3.5" /> Sleep timer
            </p>
            <div className="mb-3 flex flex-wrap gap-1">
              {SLEEP_PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSleepTimer(m)}
                  className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold hover:bg-white/20"
                >
                  {m}m
                </button>
              ))}
              {sleepLeftMin != null && (
                <button
                  type="button"
                  onClick={() => setSleepTimer(null)}
                  className="rounded-full bg-spotify-green/20 px-2.5 py-1 text-xs font-semibold text-spotify-green"
                >
                  {sleepLeftMin}m left · off
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => toggleIncognito()}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm ${
                incognito ? "bg-spotify-green/20 text-spotify-green" : "hover:bg-white/10"
              }`}
            >
              <VenetianMask className="h-4 w-4 shrink-0" />
              <span>
                Incognito
                <span className="block text-xs text-spotify-muted">No recent · no play stats</span>
              </span>
            </button>
            {incognito && (
              <p className="mt-2 flex items-center gap-1 text-[10px] text-spotify-muted">
                <Moon className="h-3 w-3" /> For You unaffected this session
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
