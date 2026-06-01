import type { GachiMetadata } from "@/types";

/** Mirrors server-side gachi metadata scoring for admin preview. */
export function recommendationMatchScore(
  ref: GachiMetadata,
  candidate: GachiMetadata,
  sameArtist = false,
): number {
  const refTags = new Set(ref.mood_tags ?? []);
  const tagOverlap = (candidate.mood_tags ?? []).filter((t) => refTags.has(t)).length;

  let score = tagOverlap * 4;
  if (sameArtist) score += 2.5;
  if (
    ref.dominant_male_sample &&
    ref.dominant_male_sample === candidate.dominant_male_sample
  ) {
    score += 2;
  }

  score += Math.max(
    0,
    4 - Math.abs((candidate.gachi_power_level ?? 50) - (ref.gachi_power_level ?? 50)) / 12.5,
  );
  score += Math.max(
    0,
    3 - Math.abs((candidate.deepness_score ?? 5) - (ref.deepness_score ?? 5)) / 2.5,
  );
  score += Math.max(0, 3 - Math.abs((candidate.bpm ?? 120) - (ref.bpm ?? 120)) / 25);
  if (Boolean(ref.is_continuous_mix) === Boolean(candidate.is_continuous_mix)) {
    score += 1.5;
  }
  score += Math.max(
    0,
    2 - Math.abs((candidate.wessratost_level ?? 5) - (ref.wessratost_level ?? 5)) / 2.5,
  );
  score += Math.max(0, 2 - Math.abs((candidate.energy ?? 0.5) - (ref.energy ?? 0.5)) * 4);
  score += Math.max(0, 2 - Math.abs((candidate.valence ?? 0.5) - (ref.valence ?? 0.5)) * 4);
  score += Math.max(
    0,
    1.5 - Math.abs((candidate.danceability ?? 0.5) - (ref.danceability ?? 0.5)) * 3,
  );

  return Math.round(score * 10) / 10;
}
