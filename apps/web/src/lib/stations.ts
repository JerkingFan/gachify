import type { TrackFilterParams } from "@/lib/trackFilters";

export type GachiStation = {
  id: string;
  label: string;
  description: string;
  color: string;
  filters: TrackFilterParams;
};

export type MoodTile = {
  mood: string;
  label: string;
  color: string;
};

export const MOOD_TILES: MoodTile[] = [
  { mood: "dungeon", label: "Dungeon", color: "#1a472a" },
  { mood: "orchestral", label: "Orchestral", color: "#8b2635" },
  { mood: "brotherhood", label: "Brotherhood", color: "#2d4a6f" },
  { mood: "slap_bass", label: "Slap Bass", color: "#6b4423" },
  { mood: "club", label: "Club", color: "#5038a0" },
  { mood: "deep", label: "Deep Fantasy", color: "#1a1a3d" },
  { mood: "continuous", label: "Continuous Mix", color: "#3d2a1a" },
];

export const GACHI_STATIONS: GachiStation[] = [
  {
    id: "dungeon-power",
    label: "Dungeon · Power 80+",
    description: "BPM 120–140",
    color: "#1a472a",
    filters: { mood: "dungeon", min_power: 80, min_bpm: 120, max_bpm: 140 },
  },
  {
    id: "boy-next-door",
    label: "Boy Next Door",
    description: "Dominant sample",
    color: "#5038a0",
    filters: { sample: "boy_next_door" },
  },
  {
    id: "deep-fantasy",
    label: "Deep Dark Fantasy",
    description: "Deepness 7+",
    color: "#1a1a3d",
    filters: { min_deepness: 7 },
  },
  {
    id: "max-power",
    label: "Maximum ♂️ Power",
    description: "Power 85+",
    color: "#6b1a1a",
    filters: { min_power: 85 },
  },
  {
    id: "slap-club",
    label: "Slap · Club BPM",
    description: "130–150 BPM",
    color: "#6b4423",
    filters: { mood: "slap_bass", min_bpm: 130, max_bpm: 150 },
  },
  {
    id: "van-darkholme",
    label: "Van Darkholme",
    description: "Sample station",
    color: "#2a2a2a",
    filters: { sample: "van_darkholme" },
  },
];

export function stationById(id: string): GachiStation | undefined {
  return GACHI_STATIONS.find((s) => s.id === id);
}
