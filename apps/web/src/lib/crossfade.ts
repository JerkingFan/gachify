const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Fade out → run loader → fade in (keeps user volume setting). */
export async function crossfadeAudio(
  audio: HTMLAudioElement,
  load: () => Promise<void>,
  durationMs = 1200,
): Promise<void> {
  const targetVol = audio.volume;
  const steps = 16;
  const stepMs = durationMs / steps / 2;

  for (let i = steps; i >= 0; i--) {
    audio.volume = (targetVol * i) / steps;
    await sleep(stepMs);
  }

  audio.pause();
  await load();

  for (let i = 0; i <= steps; i++) {
    audio.volume = (targetVol * i) / steps;
    await sleep(stepMs);
  }
}
