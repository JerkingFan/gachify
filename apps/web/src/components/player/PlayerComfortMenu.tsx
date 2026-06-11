import { Gauge, Moon, Timer, VenetianMask } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePlayerStore, type PlaybackRate } from "@/store/playerStore";

const RATES: PlaybackRate[] = [0.75, 1, 1.25, 1.5];
const SLEEP_PRESETS = [15, 30, 45, 60];

function menuPosition(btn: HTMLButtonElement) {
  const rect = btn.getBoundingClientRect();
  return {
    bottom: window.innerHeight - rect.top + 8,
    right: Math.max(8, window.innerWidth - rect.right),
  };
}

export function PlayerComfortMenu() {
  const incognito = usePlayerStore((s) => s.incognito);
  const toggleIncognito = usePlayerStore((s) => s.toggleIncognito);
  const playbackRate = usePlayerStore((s) => s.playbackRate);
  const setPlaybackRate = usePlayerStore((s) => s.setPlaybackRate);
  const sleepTimerEndsAt = usePlayerStore((s) => s.sleepTimerEndsAt);
  const setSleepTimer = usePlayerStore((s) => s.setSleepTimer);
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ bottom: 0, right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);

  const sleepLeftMin =
    sleepTimerEndsAt != null
      ? Math.max(0, Math.ceil((sleepTimerEndsAt - Date.now()) / 60_000))
      : null;

  const activeSleepPreset =
    sleepLeftMin != null
      ? SLEEP_PRESETS.find((m) => sleepLeftMin <= m && sleepLeftMin > m - 15) ?? null
      : null;

  useEffect(() => {
    if (!open || !btnRef.current) return;
    const update = () => {
      if (btnRef.current) setMenuPos(menuPosition(btnRef.current));
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const toggleOpen = () => {
    if (open) {
      setOpen(false);
      return;
    }
    if (btnRef.current) setMenuPos(menuPosition(btnRef.current));
    setOpen(true);
  };

  const pickSleepTimer = (minutes: number | null) => {
    setSleepTimer(minutes);
    setOpen(false);
  };

  const menu =
    open &&
    createPortal(
      <>
        <button
          type="button"
          className="fixed inset-0 z-[200] bg-black/30"
          aria-label="Close menu"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        />
        <div
          className="fixed z-[201] w-56 rounded-lg border border-white/10 bg-spotify-elevated p-3 shadow-xl"
          style={{ bottom: menuPos.bottom, right: menuPos.right }}
          role="menu"
          onPointerDown={(e) => e.stopPropagation()}
        >
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
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => pickSleepTimer(m)}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  activeSleepPreset === m
                    ? "bg-spotify-green text-black"
                    : "bg-white/10 hover:bg-white/20"
                }`}
              >
                {m}m
              </button>
            ))}
            {sleepLeftMin != null && (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => pickSleepTimer(null)}
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
      </>,
      document.body,
    );

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={toggleOpen}
        className={`btn-icon touch-target ${incognito || sleepTimerEndsAt ? "text-spotify-green" : "text-white/70 hover:text-white"}`}
        aria-label="Listening options"
        aria-expanded={open}
        title={
          sleepLeftMin != null
            ? `Sleep timer: ${sleepLeftMin}m left`
            : "Speed, sleep timer, incognito"
        }
      >
        <Gauge className="h-5 w-5" />
      </button>
      {menu}
    </div>
  );
}
