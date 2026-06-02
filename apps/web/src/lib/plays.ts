import { detectPlaySource } from "@/lib/playSource";

export function recordPlayOnce(trackId: string): void {
  const key = "gachify:played";
  let seen: string[] = [];
  try {
    seen = JSON.parse(sessionStorage.getItem(key) ?? "[]") as string[];
  } catch {
    seen = [];
  }
  if (seen.includes(trackId)) return;
  seen.push(trackId);
  sessionStorage.setItem(key, JSON.stringify(seen.slice(-100)));
  const source = detectPlaySource();
  void import("@/api/client").then(({ api }) => {
    void api.recordPlay(trackId, source).catch(() => {});
  });
}
