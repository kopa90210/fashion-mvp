"""Build the Stylist catalog from retailer offers reviewed by a person."""

import argparse
import csv
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import json
from pathlib import Path
import re
import sys
from tempfile import NamedTemporaryFile
from urllib.parse import unquote, urlsplit, urlunsplit


FIELDS = (
    "id", "title", "url", "price_egp", "currency", "stock", "checked_at",
    "collection", "role", "occasions", "style_tags", "review_status",
)
HOSTS = {"www.lcwaikiki.eg", "www.defacto.com.eg", "concrete.store"}
COLLECTIONS = {"masculine", "feminine", "shared"}
ROLES = {"base_layer", "bottom", "one_piece", "footwear", "outerwear"}
OCCASIONS = {"everyday", "work", "going-out"}
MAX_AGE = timedelta(hours=48)


def normalize_offer(row, now):
    item_id, title, url = (row[key] for key in ("id", "title", "url"))
    if not re.fullmatch(r"[a-zA-Z0-9_-]{1,64}", item_id):
        raise ValueError("invalid offer ID")
    if not title or len(title.encode("utf-16-le")) > 200:
        raise ValueError("title must have 1–100 characters")
    if (not re.fullmatch(r"[!-~]{1,500}", url) or
            any(character in url for character in "\\?#")):
        raise ValueError("use a canonical product URL without tracking parameters")
    product_url = urlsplit(url)
    if any(unquote(segment) in {".", ".."} for segment in product_url.path.split("/")):
        raise ValueError("use a canonical product URL without dot segments")
    host = product_url.netloc.lower()
    if product_url.scheme != "https" or host not in HOSTS or not product_url.path.strip("/"):
        raise ValueError("use a product URL on an approved Egyptian retailer host")
    url = urlunsplit(("https", host, product_url.path, "", ""))
    if row["currency"] != "EGP" or not re.fullmatch(r"[0-9]{1,6}(?:\.[0-9]{1,2})?", row["price_egp"]):
        raise ValueError("enter an EGP price as a number, e.g. 899.50")
    price = Decimal(row["price_egp"])
    if not 0 < price <= 100_000:
        raise ValueError("price must be between 0.01 and 100000 EGP")
    try:
        checked_at = datetime.fromisoformat(row["checked_at"].replace("Z", "+00:00"))
        if checked_at.utcoffset() is None:
            raise ValueError
        checked_at = checked_at.astimezone(timezone.utc)
    except (ValueError, OverflowError):
        raise ValueError("checked_at must include an ISO timestamp and time zone") from None
    if checked_at > now:
        raise ValueError("checked_at cannot be in the future")
    if now - checked_at > MAX_AGE:
        return None
    collection, role = row["collection"], row["role"]
    if collection not in COLLECTIONS or role not in ROLES:
        raise ValueError("invalid garment collection or role")
    if role == "one_piece" and collection != "feminine":
        raise ValueError("one-piece offers must use the feminine collection")
    occasions = list(dict.fromkeys(value.strip() for value in row["occasions"].split("|")))
    if not set(occasions) <= OCCASIONS:
        raise ValueError("use everyday, work or going-out, separated by |")
    try:
        tags = json.loads(row["style_tags"] or "{}")
    except json.JSONDecodeError:
        raise ValueError("style_tags must be a JSON object") from None
    if not isinstance(tags, dict) or any(
        type(value) not in (float, int) or not 0 <= value <= 1 for value in tags.values()
    ):
        raise ValueError("style_tags must contain numeric weights from 0 to 1")
    return {
        "id": item_id, "title": title, "url": url, "priceEgp": float(price),
        "currency": "EGP", "stock": "in_stock",
        "checkedAt": checked_at.isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        "collection": collection, "role": role, "occasions": occasions, "styleTags": tags,
    }


def build_catalog(paths, now):
    offers, ids, urls = [], set(), set()
    excluded = {"pending": 0, "unavailable": 0, "stale": 0}
    for path in paths:
        with path.open(encoding="utf-8-sig", newline="") as file:
            reader = csv.DictReader(file, strict=True)
            if len(reader.fieldnames or []) != len(FIELDS) or set(reader.fieldnames or []) != set(FIELDS):
                raise ValueError(f"{path.name}: CSV columns must match the sample")
            for values in reader:
                try:
                    if None in values or any(value is None for value in values.values()):
                        raise ValueError("missing or extra columns")
                    row = {key: value.strip() for key, value in values.items()}
                    status = row["review_status"]
                    if status == "pending":
                        excluded["pending"] += 1
                        continue
                    if status != "approved":
                        raise ValueError("review_status must be approved or pending")
                    if row["stock"] in {"out_of_stock", "unknown"}:
                        excluded["unavailable"] += 1
                        continue
                    if row["stock"] != "in_stock":
                        raise ValueError("invalid stock status")
                    offer = normalize_offer(row, now)
                    if offer is None:
                        excluded["stale"] += 1
                        continue
                    if offer["id"] in ids or offer["url"] in urls:
                        raise ValueError("duplicate offer ID or URL")
                except ValueError as error:
                    raise ValueError(f"{path.name}:{reader.line_num}: {error}") from None
                ids.add(offer["id"])
                urls.add(offer["url"])
                offers.append(offer)
    if not offers or len(offers) > 250:
        raise ValueError(f"expected 1–250 eligible offers; got {len(offers)} (excluded: {excluded})")
    payload = json.dumps(sorted(offers, key=lambda offer: offer["id"]), ensure_ascii=True, separators=(",", ":"))
    if len(payload) > 120_000:
        raise ValueError("catalog exceeds the Stylist configuration size limit")
    return payload, excluded


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv", nargs="+", type=Path)
    parser.add_argument("--output", required=True, type=Path, help="path ending in .json")
    args = parser.parse_args(argv)
    if args.output.suffix != ".json":
        parser.error("--output must end in .json")
    temp_path = None
    try:
        payload, excluded = build_catalog(args.csv, datetime.now(timezone.utc))
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with NamedTemporaryFile(mode="w", encoding="utf-8", dir=args.output.parent, delete=False) as temporary:
            temp_path = Path(temporary.name)
            temporary.write(payload)
        temp_path.replace(args.output)
    except (OSError, ValueError, csv.Error) as error:
        print(f"Catalog not written: {error}", file=sys.stderr)
        return 1
    finally:
        if temp_path:
            temp_path.unlink(missing_ok=True)
    print(f"Wrote {len(json.loads(payload))} offers to {args.output}; excluded: {excluded}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
