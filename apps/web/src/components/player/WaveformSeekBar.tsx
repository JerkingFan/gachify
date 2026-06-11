import { useEffect, useRef, useState } from "react";
import { fetchWaveformPeaks } from "@/lib/waveform";
import { formatDuration } from "@/lib/tracks";
import { usePlayerStore } from "@/store/playerStore";

type WaveformSeekBarProps = {
  audioUrl: string | null;
  progressMs: number;
  durationMs: number;
  onSeek: (ms: number) => void;
  className?: string;
  large?: boolean;
};

/** Visible range scrubber; optional waveform decoration when audio URL is available. */
export function WaveformSeekBar({
  audioUrl,
  progressMs,
  durationMs,
  onSeek,
  className = "",
  large = false,
}: WaveformSeekBarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [peaks, setPeaks] = useState<number[]>([]);
  const setScrubbing = usePlayerStore((s) => s.setScrubbing);
  const maxMs = Math.max(durationMs, 1);

  const handleSeek = (ms: number) => {
    onSeek(ms);
  };

  useEffect(() => {
    if (!audioUrl) {
      setPeaks([]);
      return;
    }
    let cancelled = false;
    void fetchWaveformPeaks(audioUrl, large ? 160 : 100).then((p) => {
      if (!cancelled) setPeaks(p);
    });
    return () => {
      cancelled = true;
    };
  }, [audioUrl, large]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks.length) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w <= 0 || h <= 0) return;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const barW = w / peaks.length;
    const progress = durationMs > 0 ? progressMs / durationMs : 0;

    peaks.forEach((p, i) => {
      const x = i * barW;
      const barH = Math.max(2, p * (h - 4));
      const y = (h - barH) / 2;
      const played = i / peaks.length <= progress;
      ctx.fillStyle = played ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.28)";
      ctx.fillRect(x + 0.5, y, Math.max(1, barW - 1), barH);
    });
  }, [peaks, progressMs, durationMs]);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="w-10 shrink-0 text-right text-xs tabular-nums text-white/60">
        {formatDuration(progressMs)}
      </span>
      <div className={`relative min-w-0 flex-1 ${large ? "py-1" : ""}`}>
        {peaks.length > 0 && (
          <canvas
            ref={canvasRef}
            aria-hidden
            className={`pointer-events-none absolute inset-x-0 top-1/2 w-full -translate-y-1/2 opacity-90 ${large ? "h-12" : "h-8"}`}
          />
        )}
        <input
          type="range"
          min={0}
          max={maxMs}
          step={100}
          value={Math.min(progressMs, maxMs)}
          disabled={durationMs <= 0}
          onPointerDown={() => setScrubbing(true)}
          onPointerUp={() => setScrubbing(false)}
          onPointerCancel={() => setScrubbing(false)}
          onInput={(e) => handleSeek(Number(e.currentTarget.value))}
          onChange={(e) => handleSeek(Number(e.target.value))}
          className={`player-scrubber relative z-10 w-full ${large ? "h-3" : "h-2"}`}
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={durationMs}
          aria-valuenow={progressMs}
        />
      </div>
      <span className="w-10 shrink-0 text-xs tabular-nums text-white/60">
        {formatDuration(durationMs)}
      </span>
    </div>
  );
}
