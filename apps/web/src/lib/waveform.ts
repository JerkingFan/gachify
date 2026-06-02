const peakCache = new Map<string, number[]>();

/** Decode audio URL into normalized peak bars for waveform UI. */
export async function fetchWaveformPeaks(url: string, bars = 120): Promise<number[]> {
  const cached = peakCache.get(url);
  if (cached) return cached;

  try {
    const res = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!res.ok) throw new Error("fetch failed");
    const buf = await res.arrayBuffer();
    const ctx = new AudioContext();
    const audio = await ctx.decodeAudioData(buf.slice(0));
    await ctx.close();

    const channel = audio.getChannelData(0);
    const block = Math.max(1, Math.floor(channel.length / bars));
    const peaks: number[] = [];
    for (let i = 0; i < bars; i++) {
      const start = i * block;
      let max = 0;
      for (let j = start; j < start + block && j < channel.length; j++) {
        const v = Math.abs(channel[j]);
        if (v > max) max = v;
      }
      peaks.push(max);
    }
    const top = Math.max(0.001, ...peaks);
    const normalized = peaks.map((p) => p / top);
    peakCache.set(url, normalized);
    return normalized;
  } catch {
    const fallback = Array.from({ length: bars }, (_, i) => 0.25 + 0.55 * Math.abs(Math.sin(i * 0.17)));
    peakCache.set(url, fallback);
    return fallback;
  }
}
