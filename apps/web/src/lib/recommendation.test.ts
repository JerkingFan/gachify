import { describe, expect, it } from "vitest";
import { recommendationMatchScore } from "./recommendation";

describe("recommendationMatchScore", () => {
  it("scores higher when mood tags overlap", () => {
    const ref = { mood_tags: ["dungeon"], bpm: 120, gachi_power_level: 80 };
    const close = { mood_tags: ["dungeon"], bpm: 122, gachi_power_level: 82 };
    const far = { mood_tags: ["chill"], bpm: 90, gachi_power_level: 20 };
    expect(recommendationMatchScore(ref, close)).toBeGreaterThan(
      recommendationMatchScore(ref, far),
    );
  });
});
