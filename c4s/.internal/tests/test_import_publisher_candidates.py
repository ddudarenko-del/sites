import copy
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "import_publisher_candidates.py"


def load_module():
    spec = importlib.util.spec_from_file_location("import_publisher_candidates", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class ImportPublisherCandidatesTests(unittest.TestCase):
    def setUp(self):
        self.module = load_module()

    def test_build_import_plan_creates_defaults_and_skips_duplicates(self):
        existing = [
            {
                "id": "pub-051",
                "domain": "giantessclub.com",
                "status": "prospect",
                "relationship_stage": "researching",
                "fit_status": "unverified",
            }
        ]
        rows = [
            {
                "domain": "https://www.giantessclub.com/path",
                "source_label": "google / giantess sponsor / 2026-06-10",
            },
            {
                "domain": "https://www.newsite.example/path",
                "niche": "giantess",
                "languages": "en|de",
                "placement_types": "banner|widget",
                "source_label": "google / giantess banner / 2026-06-10",
                "why_fit": "Looks active",
            },
            {
                "domain": "newsite.example",
                "source_label": "google / giantess banner / 2026-06-10",
            },
            {
                "domain": "freshsite.example",
                "geo": "us|de",
                "source_label": "google / femdom partners / 2026-06-10",
            },
        ]

        plan = self.module.build_import_plan(rows=rows, existing_publishers=existing, import_date="2026-06-10")

        self.assertEqual([record["id"] for record in plan["new_records"]], ["pub-052", "pub-053"])
        self.assertEqual([record["domain"] for record in plan["new_records"]], ["newsite.example", "freshsite.example"])

        first = plan["new_records"][0]
        self.assertEqual(first["status"], "prospect")
        self.assertEqual(first["relationship_stage"], "researching")
        self.assertEqual(first["fit_status"], "unverified")
        self.assertEqual(first["visibility"], "team-safe")
        self.assertEqual(first["segment"], "similar_sites")
        self.assertEqual(first["deal_model"], "unknown")
        self.assertEqual(first["languages"], ["en", "de"])
        self.assertEqual(first["placement_types"], ["banner", "widget"])
        self.assertEqual(first["source_labels"], ["google / giantess banner / 2026-06-10"])
        self.assertEqual(first["created_at"], "2026-06-10")
        self.assertEqual(first["updated_at"], "2026-06-10")

        second = plan["new_records"][1]
        self.assertEqual(second["geo"], ["us", "de"])

        skipped_reasons = [item["reason"] for item in plan["skipped"]]
        self.assertEqual(skipped_reasons, ["tracked_duplicate", "input_duplicate"])
        self.assertEqual(plan["summary"]["new_records"], 2)
        self.assertEqual(plan["summary"]["skipped"], 2)

    def test_apply_records_updates_publishers_and_meta(self):
        data = {
            "meta": {
                "publisher_count": 51,
                "status_counts": {"active": 41, "prospect": 10},
                "safe_fields": ["id", "domain", "status"],
            },
            "publishers": [
                {"id": "pub-051", "domain": "giantessclub.com", "status": "prospect"}
            ],
        }
        new_records = [
            {
                "id": "pub-052",
                "domain": "newsite.example",
                "status": "prospect",
                "relationship_stage": "researching",
                "fit_status": "unverified",
                "deal_model": "unknown",
                "placement_types": ["banner"],
                "niche": "giantess",
                "geo": [],
                "languages": ["en"],
                "source_labels": ["google / giantess banner / 2026-06-10"],
                "visibility": "team-safe",
                "segment": "similar_sites",
                "last_contact": None,
                "next_followup": None,
                "created_at": "2026-06-10",
                "updated_at": "2026-06-10",
            }
        ]

        updated = self.module.apply_records(copy.deepcopy(data), new_records)

        self.assertEqual(updated["meta"]["publisher_count"], 52)
        self.assertEqual(updated["meta"]["status_counts"]["prospect"], 11)
        self.assertEqual(updated["publishers"][-1]["domain"], "newsite.example")

    def test_cli_dry_run_writes_plan_without_touching_data(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            data_path = tmp / "publishers.dashboard.json"
            output_path = tmp / "import-plan.json"
            input_path = tmp / "batch.csv"

            data_path.write_text(json.dumps({
                "meta": {"publisher_count": 1, "status_counts": {"active": 1}},
                "publishers": [{"id": "pub-001", "domain": "existing.example", "status": "active"}],
            }, indent=2))
            input_path.write_text(
                "domain,source_label,niche\n"
                "freshsite.example,google / giantess banner / 2026-06-10,giantess\n"
            )

            exit_code = self.module.main([
                "--input", str(input_path),
                "--data", str(data_path),
                "--output", str(output_path),
                "--date", "2026-06-10",
            ])

            self.assertEqual(exit_code, 0)
            written = json.loads(output_path.read_text())
            self.assertEqual(written["summary"]["new_records"], 1)
            reloaded_data = json.loads(data_path.read_text())
            self.assertEqual(reloaded_data["meta"]["publisher_count"], 1)


if __name__ == "__main__":
    unittest.main()
