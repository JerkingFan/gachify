import { useEffect, useRef, useState } from "react";
import { fetchWaveformPeaks } from "@/lib/waveform";
import { formatDuration } from "@/lib/tracks";

type WaveformSeekBarProps = {
  audioUrl: string | null;
  progressMs: number;
  durationMs: number;
  onSeek: (ms: number) => void;
  className?: string;
  large?: boolean;
};

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
  const [dragging, setDragging] = useState(false);

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

  const seekFromEvent = (clientX: number, rect: DOMRect) => {
    if (!durationMs) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    onSeek(Math.round(ratio * durationMs));
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="w-10 shrink-0 text-right text-xs tabular-nums text-white/60">
        {formatDuration(progressMs)}
      </span>
      <canvas
        ref={canvasRef}
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={durationMs}
        aria-valuenow={progressMs}
        className={`w-full cursor-pointer touch-none ${large ? "h-16" : "h-10"}`}
        onPointerDown={(e) => {
          setDragging(true);
          seekFromEvent(e.clientX, e.currentTarget.getBoundingClientRect());
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!dragging) return;
          seekFromEvent(e.clientX, e.currentTarget.getBoundingClientRect());
        }}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
      />
      <span className="w-10 shrink-0 text-xs tabular-nums text-white/60">
        {formatDuration(durationMs)}
      </span>
    </div>
  );
}
