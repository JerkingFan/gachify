import unittest

from gachi_analyzer.gachify_metadata import analysis_to_gachi_metadata


class TestGachifyMetadata(unittest.TestCase):
    def test_maps_core_fields(self):
        meta = analysis_to_gachi_metadata(
            {
                "bpm": 128.0,
                "valence": 0.4,
                "danceability": 0.7,
                "energy": 0.85,
                "auto_tags": ["dungeon", "fast-bpm"],
                "gachi": {
                    "brother_power_index": 0.87,
                    "deepness_score": 0.94,
                    "stone_count": 12,
                    "wackiness_score": 0.55,
                    "dominant_stone_type": "boy_next_door",
                },
                "sample_sources": [{"source_id": "van_darkholme"}],
            }
        )
        self.assertEqual(meta["gachi_power_level"], 87)
        self.assertAlmostEqual(meta["deepness_score"], 9.4)
        self.assertEqual(meta["grunt_count"], 12)
        self.assertIn("dungeon", meta["mood_tags"])
        self.assertEqual(meta["dominant_male_sample"], "van_darkholme")


if __name__ == "__main__":
    unittest.main()
