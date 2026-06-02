const COVER_PRESETS = [
  "linear-gradient(135deg, rgb(78,42,26) 0%, #282828 100%)",
  "linear-gradient(135deg, rgb(61,26,71) 0%, #282828 100%)",
  "linear-gradient(135deg, rgb(26,61,71) 0%, #282828 100%)",
  "linear-gradient(135deg, rgb(42,71,26) 0%, #282828 100%)",
];

export { COVER_PRESETS };

export type DraftMetadataFields = {
  gachiPower: number;
  deepness: number;
  moodTags: string;
  coverGradient: string;
  coverUrl: string;
  lyricsLrc: string;
};

export function buildGachiMetadataFromDraft(fields: DraftMetadataFields): Record<string, unknown> {
  const tags = fields.moodTags
    .split(",")
    .map((t) => t.trim().toLowerCase().replace(/\s+/g, "_"))
    .filter(Boolean);
  const meta: Record<string, unknown> = {
    gachi_power_level: fields.gachiPower,
    deepness_score: fields.deepness,
  };
  if (tags.length) meta.mood_tags = tags;
  if (fields.coverGradient) meta.cover_gradient = fields.coverGradient;
  if (fields.coverUrl.trim()) meta.cover_url = fields.coverUrl.trim();
  if (fields.lyricsLrc.trim()) meta.lyrics_lrc = fields.lyricsLrc.trim();
  return meta;
}
