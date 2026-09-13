import argparse
from difflib import SequenceMatcher
import hashlib
import json
import mimetypes
import os
import sys
import time
from base64 import b64encode
from pathlib import Path
from typing import Any
from uuid import uuid4

from dotenv import load_dotenv
from groq import Groq
from supabase import create_client


BUCKET_NAME = "wardrobe-images"
MIGRATION_PATH = "supabase/migrations/0002_wardrobe_extraction_pipeline.sql"
DEFAULT_GROQ_MODEL = "qwen/qwen3.6-27b"
SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png"}
FORBIDDEN_KEYS = {
    "brand",
    "brand_name",
    "product_name",
    "sku",
    "price",
    "retailer",
    "logo",
}

EXTRACTION_PROMPT = """You are a fashion attribute extractor. Look at this clothing photo and return ONLY a single JSON object (no markdown, no prose) with this exact shape:
{
  "category": "top | bottom | outerwear | footwear | accessory",
  "subcategory": "short descriptive name",
  "display_name": "human-readable name, e.g. 'White Oxford Shirt'",
  "color": {"primary": "", "secondary": null, "family_weights": {"neutral":0.0,"earth":0.0,"bright":0.0,"dark":0.0,"pastel":0.0}},
  "material": {"primary": "", "weights": {"<material>":0.0}},
  "fit": {"weights": {"slim":0.0,"regular":0.0,"relaxed":0.0,"oversized":0.0}},
  "pattern": "solid | striped | checked | printed | textured",
  "style_tags": {"minimal":0.0,"streetwear":0.0,"formal":0.0,"bohemian":0.0,"edgy":0.0,"earth_tones":0.0,"smart_casual":0.0,"sporty":0.0},
  "formality_score": 0.0,
  "season_weights": {"spring":0.0,"summer":0.0,"fall":0.0,"winter":0.0},
  "layer_role": "base_layer | mid_layer | outerwear | bottom | footwear | accessory",
  "model_confidence": 0.0
}
Rules: weighted objects sum to ~1.0. NEVER include brand names, product
names, prices, retailers, or logos, even if visible. Describe the
garment only. Return raw JSON only."""

REQUIRED_FIELDS = {
    "category",
    "subcategory",
    "display_name",
    "color",
    "material",
    "fit",
    "pattern",
    "style_tags",
    "formality_score",
    "season_weights",
    "layer_role",
    "model_confidence",
}
WARDROBE_ATTRIBUTE_FIELDS = REQUIRED_FIELDS
VALID_CATEGORIES = {"top", "bottom", "outerwear", "footwear", "accessory"}
VALID_LAYER_ROLES = {"base_layer", "mid_layer", "outerwear", "bottom", "footwear", "accessory"}


class GroqQuotaError(RuntimeError):
    pass


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract wardrobe attributes from clothing photos and upload them to Supabase."
    )
    parser.add_argument(
        "--photos",
        default="datasets",
        help="Folder containing .jpg/.jpeg/.png photos. Defaults to datasets.",
    )
    parser.add_argument(
        "--min-confidence",
        type=float,
        default=0.6,
        help="Reject items below this model_confidence. Defaults to 0.6.",
    )
    parser.add_argument(
        "--model",
        "--groq-model",
        "--gemini-model",
        dest="model",
        default=os.getenv("GROQ_MODEL", DEFAULT_GROQ_MODEL),
        help=f"Groq/Llama model to use. Defaults to {DEFAULT_GROQ_MODEL}.",
    )
    parser.add_argument(
        "--force-duplicates",
        action="store_true",
        help="Process photos even when their hash already has an accepted log entry.",
    )
    parser.add_argument(
        "--allow-duplicates",
        action="store_true",
        help="Bypass duplicate display_name check when processing items.",
    )
    return parser.parse_args()


def load_environment() -> None:
    load_dotenv(".env")
    load_dotenv(".env.local", override=False)

    if not os.getenv("SUPABASE_URL") and os.getenv("NEXT_PUBLIC_SUPABASE_URL"):
        os.environ["SUPABASE_URL"] = os.environ["NEXT_PUBLIC_SUPABASE_URL"]

    groq_api_key = (
        os.getenv("GROQ_API_KEY")
        or os.getenv("Groq_API_KEY")
        or os.getenv("GEMINI_API_KEY")
        or os.getenv("GOOGLE_API_KEY")
    )
    if groq_api_key:
        os.environ["GROQ_API_KEY"] = groq_api_key
        os.environ.pop("GEMINI_API_KEY", None)
        os.environ.pop("GOOGLE_API_KEY", None)

    missing = [
        key
        for key in ("GROQ_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_KEY")
        if not os.getenv(key)
    ]
    if missing:
        details = ", ".join(missing)
        raise RuntimeError(
            f"Missing required environment variables: {details}. "
            "Add them to .env.local or .env. SUPABASE_SERVICE_KEY must be the "
            "Supabase service_role key, not the anon key."
        )


def photo_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as photo:
        for chunk in iter(lambda: photo.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def find_photos(folder: Path) -> list[Path]:
    if not folder.exists():
        raise FileNotFoundError(f"Photo folder does not exist: {folder}")
    if not folder.is_dir():
        raise NotADirectoryError(f"Photo path is not a folder: {folder}")
    return sorted(
        path
        for path in folder.iterdir()
        if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS
    )


def strip_forbidden_keys(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: strip_forbidden_keys(child)
            for key, child in value.items()
            if key.lower() not in FORBIDDEN_KEYS
        }
    if isinstance(value, list):
        return [strip_forbidden_keys(item) for item in value]
    return value


def normalize_attributes(attributes: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(attributes)

    category = str(attributes.get("category", "")).strip().lower()
    if category in {"top", "bottom", "outerwear", "footwear", "accessory"}:
        normalized["category"] = category
    else:
        lowered = category.replace("-", " ").replace("_", " ")
        if "shoe" in lowered or "sneaker" in lowered or "boot" in lowered or "loafer" in lowered:
            normalized["category"] = "footwear"
        elif "shirt" in lowered or "top" in lowered or "blouse" in lowered or "tee" in lowered or "sweater" in lowered or "jacket" in lowered:
            normalized["category"] = "top"
        elif "pant" in lowered or "trouser" in lowered or "jean" in lowered or "skirt" in lowered or "short" in lowered or "bottom" in lowered:
            normalized["category"] = "bottom"
        elif "coat" in lowered or "outerwear" in lowered or "jacket" in lowered or "blazer" in lowered:
            normalized["category"] = "outerwear"
        elif "accessory" in lowered or "bag" in lowered or "belt" in lowered or "hat" in lowered or "jewelry" in lowered:
            normalized["category"] = "accessory"
        else:
            normalized["category"] = category or "accessory"

    layer_role = str(attributes.get("layer_role", "")).strip().lower()
    if layer_role == "outer_layer":
        layer_role = "outerwear"

    if layer_role in VALID_LAYER_ROLES:
        normalized["layer_role"] = layer_role
    else:
        category = normalized.get("category")
        if category == "top":
            normalized["layer_role"] = "base_layer"
        elif category == "bottom":
            normalized["layer_role"] = "bottom"
        elif category == "outerwear":
            normalized["layer_role"] = "outerwear"
        elif category == "footwear":
            normalized["layer_role"] = "footwear"
        else:
            normalized["layer_role"] = "accessory"

    return normalized


def validate_attributes(attributes: dict[str, Any], min_confidence: float) -> list[str]:
    problems: list[str] = []
    missing = sorted(field for field in REQUIRED_FIELDS if field not in attributes)
    if missing:
        problems.append(f"missing required fields: {', '.join(missing)}")

    category = str(attributes.get("category", "")).strip().lower()
    if category not in VALID_CATEGORIES:
        problems.append(
            f"category must be one of {sorted(VALID_CATEGORIES)}, got {attributes.get('category')!r}"
        )

    layer_role = str(attributes.get("layer_role", "")).strip().lower()
    if layer_role not in VALID_LAYER_ROLES:
        problems.append(
            f"layer_role must be one of {sorted(VALID_LAYER_ROLES)}, got {attributes.get('layer_role')!r}"
        )

    confidence = attributes.get("model_confidence")
    if not isinstance(confidence, (int, float)):
        problems.append("model_confidence is missing or not numeric")
    elif confidence < min_confidence:
        problems.append(
            f"model_confidence {confidence} is below minimum {min_confidence}"
        )

    for field in ("color", "material", "fit", "style_tags"):
        if field in attributes and not isinstance(attributes[field], dict):
            problems.append(f"{field} must be a JSON object")

    if "season_weights" in attributes and not isinstance(attributes["season_weights"], dict):
        problems.append("season_weights must be a JSON object")

    return problems


def existing_hash_status_counts(supabase: Any, digest: str) -> dict[str, int]:
    response = (
        supabase.table("extraction_log")
        .select("status")
        .eq("photo_hash", digest)
        .execute()
    )
    counts = {"accepted": 0, "rejected": 0}
    for row in response.data or []:
        status = row.get("status")
        if status in counts:
            counts[status] += 1
    return counts


def log_extraction(
    supabase: Any,
    photo: Path,
    digest: str,
    raw_response: Any,
    status: str,
    problems: list[str] | None = None,
) -> None:
    supabase.table("extraction_log").insert(
        {
            "photo_filename": photo.name,
            "photo_hash": digest,
            "raw_response": raw_response,
            "status": status,
            "problems": problems or [],
        }
    ).execute()


def ensure_bucket(supabase: Any) -> None:
    try:
        supabase.storage.create_bucket(BUCKET_NAME, options={"public": True})
    except Exception as exc:
        message = str(exc).lower()
        if "already exists" not in message and "duplicate" not in message:
            raise


def ensure_required_tables(supabase: Any) -> None:
    missing_tables: list[str] = []
    for table_name in ("wardrobe_items", "extraction_log"):
        try:
            supabase.table(table_name).select("id").limit(1).execute()
        except Exception as exc:
            message = str(exc)
            if "PGRST205" in message or "Could not find the table" in message:
                missing_tables.append(table_name)
            else:
                raise

    if missing_tables:
        raise RuntimeError(
            "Supabase schema is missing required table(s): "
            f"{', '.join(missing_tables)}. Apply the SQL migration at "
            f"{MIGRATION_PATH} in the Supabase SQL editor, then rerun this script."
        )


def extract_attributes(client: Groq, photo: Path, model: str) -> dict[str, Any]:
    mime_type = mimetypes.guess_type(photo.name)[0] or "image/jpeg"
    encoded_image = b64encode(photo.read_bytes()).decode("utf-8")
    image_payload = {
        "type": "image_url",
        "image_url": {"url": f"data:{mime_type};base64,{encoded_image}"},
    }

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": EXTRACTION_PROMPT},
                        image_payload,
                    ],
                }
            ],
            temperature=0.1,
            max_tokens=2048,
            response_format={"type": "json_object"},
        )
    except Exception as exc:
        error_message = str(exc)
        if "resource_exhausted" in error_message.lower() or "429" in error_message or "quota" in error_message.lower():
            raise GroqQuotaError(
                f"Groq quota exhausted for {model}. "
                "Enable billing or quota for this API key/project, then rerun."
            ) from exc
        raise

    text = response.choices[0].message.content or "{}"
    return json.loads(text)


def upload_photo(supabase: Any, photo: Path, item_id: str) -> str:
    extension = ".jpg" if photo.suffix.lower() == ".jpeg" else photo.suffix.lower()
    storage_path = f"{item_id}{extension}"
    content_type = mimetypes.guess_type(photo.name)[0] or "application/octet-stream"

    with photo.open("rb") as file:
        supabase.storage.from_(BUCKET_NAME).upload(
            storage_path,
            file,
            file_options={"content-type": content_type, "upsert": "false"},
        )

    return supabase.storage.from_(BUCKET_NAME).get_public_url(storage_path)


_CATEGORY_ITEMS_CACHE: dict[str, list[dict[str, Any]]] = {}


def insert_wardrobe_item(
    supabase: Any,
    item_id: str,
    image_url: str,
    attributes: dict[str, Any],
) -> None:
    table_attributes = {
        field: attributes[field]
        for field in WARDROBE_ATTRIBUTE_FIELDS
        if field in attributes
    }
    row = {
        "id": item_id,
        "image_url": image_url,
        "source": "curated",
        **table_attributes,
    }
    supabase.table("wardrobe_items").insert(row).execute()

    category = attributes.get("category")
    if category and category in _CATEGORY_ITEMS_CACHE:
        _CATEGORY_ITEMS_CACHE[category].append(
            {
                "display_name": attributes.get("display_name"),
                "color": attributes.get("color"),
                "material": attributes.get("material"),
            }
        )


def find_duplicate_display_name(
    supabase: Any,
    category: str,
    new_display_name: str,
    color_primary: str | None = None,
    material_primary: str | None = None,
    threshold: float = 0.85,
) -> tuple[str | None, float]:
    if not new_display_name or not category:
        return None, 0.0

    if category in _CATEGORY_ITEMS_CACHE:
        rows = _CATEGORY_ITEMS_CACHE[category]
    else:
        try:
            response = (
                supabase.table("wardrobe_items")
                .select("display_name, color, material")
                .eq("category", category)
                .execute()
            )
            rows = response.data or []
            _CATEGORY_ITEMS_CACHE[category] = rows
        except Exception:
            return None, 0.0

    new_name_clean = new_display_name.strip().lower()
    for row in rows:
        existing_name = row.get("display_name")
        if not existing_name:
            continue


        # Composite check first: same category + same primary color +
       # same primary material is a much stronger duplicate signal than
       # name similarity, since the extraction model generates a fresh
        # descriptive name every run (two angles of the same shirt can
        # get named "White Oxford" vs "Clean White Button-Down"). 
        existing_color = (row.get("color") or {}).get("primary")
        existing_material = (row.get("material") or {}).get("primary")
        if (
           color_primary
            and material_primary
            and existing_color == color_primary
           and existing_material == material_primary
        ):
            return existing_name, 1.0
        existing_name_clean = existing_name.strip().lower()
        ratio = SequenceMatcher(None, new_name_clean, existing_name_clean).ratio()
        if ratio > threshold:
            return existing_name, ratio

    return None, 0.0


def process_photo(
    supabase: Any,
    client: Groq,
    photo: Path,
    min_confidence: float,
    model: str,
    force_duplicates: bool,
    allow_duplicates: bool = False,
) -> str:
    digest = photo_hash(photo)
    previous_counts = existing_hash_status_counts(supabase, digest)
    previous_count = previous_counts["accepted"] + previous_counts["rejected"]
    if previous_counts["accepted"] and not force_duplicates:
        print(
            f"{photo.name} -> skipped (already accepted {previous_counts['accepted']} time(s); "
            "use --force-duplicates to insert another row)"
        )
        return "skipped"

    if previous_count:
        print(
            f"{photo.name} -> warning: photo_hash already appears {previous_count} time(s); "
            "continuing may create duplicate wardrobe rows."
        )

    try:
        raw_attributes = extract_attributes(client, photo, model)
    except GroqQuotaError:
        raise
    except Exception as exc:
        error_message = str(exc)
        log_extraction(
            supabase,
            photo,
            digest,
            {"error": error_message},
            "rejected",
            ["Groq extraction failed"],
        )
        print(f"{photo.name} -> rejected (Groq extraction failed: {error_message})")
        return "rejected"

    attributes = strip_forbidden_keys(raw_attributes)
    attributes = normalize_attributes(attributes)
    problems = validate_attributes(attributes, min_confidence)
    if problems:
        log_extraction(supabase, photo, digest, raw_attributes, "rejected", problems)
        print(f"{photo.name} -> rejected ({'; '.join(problems)})")
        return "rejected"

    category = attributes.get("category", "")
    display_name = attributes.get("display_name", "")
    color_primary = (attributes.get("color") or {}).get("primary")
    material_primary = (attributes.get("material") or {}).get("primary")
    duplicate_name, similarity = find_duplicate_display_name(
       supabase, category, display_name, color_primary, material_primary
    )
    if duplicate_name:
        problem_msg = f"possible duplicate of {duplicate_name}"
        print(
            f"{photo.name} -> warning: possible duplicate of '{duplicate_name}' "
            f"(similarity: {similarity:.2f})"
        )
        if not allow_duplicates:
            log_extraction(
                supabase, photo, digest, raw_attributes, "rejected", [problem_msg]
            )
            print(f"{photo.name} -> rejected ({problem_msg})")
            return "rejected"

    item_id = str(uuid4())
    image_url = upload_photo(supabase, photo, item_id)
    insert_wardrobe_item(supabase, item_id, image_url, attributes)
    log_extraction(supabase, photo, digest, raw_attributes, "accepted")
    print(f"{photo.name} -> accepted")
    return "accepted"


def main() -> int:
    args = parse_args()
    try:
        load_environment()
        photos = find_photos(Path(args.photos))
        if not photos:
            print(f"No supported photos found in {args.photos}.")
            return 0

        supabase = create_client(
            os.environ["SUPABASE_URL"],
            os.environ["SUPABASE_SERVICE_KEY"],
        )
        ensure_required_tables(supabase)
        ensure_bucket(supabase)
        client = Groq(api_key=os.environ["GROQ_API_KEY"])

        accepted = 0
        rejected = 0
        skipped = 0
        for index, photo in enumerate(photos):
            status = process_photo(
                supabase,
                client,
                photo,
                args.min_confidence,
                args.model,
                args.force_duplicates,
                args.allow_duplicates,
            )
            if status == "accepted":
                accepted += 1
            elif status == "rejected":
                rejected += 1
            else:
                skipped += 1

            if index < len(photos) - 1:
                time.sleep(1)

        print(f"Final summary: accepted={accepted}, rejected={rejected}, skipped={skipped}")
        return 0
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
