import csv
from datetime import datetime, timezone
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from scripts.build_stylist_catalog import FIELDS, build_catalog, main


NOW = datetime(2026, 11, 19, 12, tzinfo=timezone.utc)
OFFER = dict(
    id="lc-test-chino", title="بنطلون بيج",
    url="https://www.lcwaikiki.eg/en/test-offer",
    price_egp="899.50", currency="EGP", stock="in_stock",
    checked_at="2026-11-19T12:00:00+02:00", collection="masculine",
    role="bottom", occasions="work|everyday", style_tags='{"classic":0.9}',
    review_status="approved",
)


class BuildStylistCatalogTest(unittest.TestCase):
    def setUp(self):
        directory = TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)

    def csv(self, name, *rows):
        path = self.root / name
        with path.open("w", encoding="utf-8-sig", newline="") as file:
            writer = csv.DictWriter(file, fieldnames=FIELDS)
            writer.writeheader()
            writer.writerows(rows)
        return path

    def test_compiles_multiple_retailers_and_excludes_unverified_offers(self):
        lc = self.csv("lc.csv", OFFER, OFFER | {"review_status": "pending"},
                      OFFER | {"stock": "unknown"}, OFFER | {"checked_at": "2026-11-16T12:00:00Z"})
        de = self.csv("de.csv", OFFER | {"id": "de-test-chino", "url": "https://www.defacto.com.eg/test-offer"})
        payload, excluded = build_catalog([lc, de], NOW)
        other, lc_item = json.loads(payload)
        self.assertEqual(other["id"], "de-test-chino")
        self.assertEqual(lc_item["priceEgp"], 899.50)
        self.assertEqual(lc_item["title"], OFFER["title"])
        self.assertEqual(lc_item["checkedAt"], "2026-11-19T10:00:00.000Z")
        self.assertEqual(excluded, {"pending": 1, "unavailable": 1, "stale": 1})

    def test_rejects_duplicate_offer_even_across_files(self):
        lc = self.csv("lc.csv", OFFER)
        duplicate = self.csv("other.csv", OFFER | {"id": "another-id"})
        with self.assertRaisesRegex(ValueError, "duplicate offer ID or URL"):
            build_catalog([lc, duplicate], NOW)

    def test_rejects_invalid_approved_offers(self):
        for field, value, message in [
            ("url", "https://www.lcwaikiki.eg.evil.example/product", "approved Egyptian retailer"),
            ("url", OFFER["url"] + "?ref=abc", "canonical product URL"),
            ("url", OFFER["url"].replace("/en/", "/en/%2e%2e/en/"), "canonical product URL"),
            ("checked_at", "2026-11-19T11:00:00", "time zone"),
            ("role", "one_piece", "feminine collection"),
            ("price_egp", "-1", "EGP price"),
        ]:
            with self.subTest(field=field, value=value):
                path = self.csv("lc.csv", OFFER | {field: value})
                with self.assertRaisesRegex(ValueError, message):
                    build_catalog([path], NOW)

    def test_all_excluded_preserves_previous_output(self):
        path = self.csv("lc.csv", OFFER | {"review_status": "pending"})
        output = self.root / "catalog.json"
        output.write_text("previous", encoding="utf-8")
        self.assertEqual(main([str(path), "--output", str(output)]), 1)
        self.assertEqual(output.read_text(encoding="utf-8"), "previous")


if __name__ == "__main__":
    unittest.main()
