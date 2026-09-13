import argparse
import json
import math
import os
import sys
import time
from datetime import datetime, timezone
from typing import Any

from dotenv import load_dotenv
from groq import Groq
from supabase import create_client


REQUIRED_ROLES = ("base_layer", "bottom", "footwear")
OPTIONAL_ROLES = ("outerwear", "accessory")
VALID_ROLES = set(REQUIRED_ROLES + OPTIONAL_ROLES)


def load_environment() -> None:
    load_dotenv(".env")
    load_dotenv(".env.local", override=False)
    if not os.getenv("SUPABASE_URL") and os.getenv("NEXT_PUBLIC_SUPABASE_URL"):
        os.environ["SUPABASE_URL"] = os.environ["NEXT_PUBLIC_SUPABASE_URL"]


def validate_config() -> tuple[str, str, str]:
    missing = [
        name
        for name in ("GROQ_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_KEY")
        if not os.getenv(name)
    ]
    if missing:
        raise RuntimeError(f"Missing required environment variables: {', '.join(missing)}")
    return (
        os.environ["GROQ_API_KEY"],
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_KEY"],
    )


def score_item(item: dict[str, Any], dna: dict[str, float], dna_mag: float | None = None) -> float:
    tags = item.get("style_tags") or {}
    if not tags:
        return 0.0

    dot = 0.0
    tag_mag_sq = 0.0
    for dim, weight in tags.items():
        w = float(weight or 0)
        if w != 0.0:
            tag_mag_sq += w * w
            d = float(dna.get(dim, 0) or 0)
            if d != 0.0:
                dot += w * d

    if tag_mag_sq == 0.0:
        return 0.0

    if dna_mag is None:
        dna_mag_sq = sum(float(d or 0) ** 2 for d in dna.values())
        if dna_mag_sq == 0.0:
            return 0.0
        dna_mag = math.sqrt(dna_mag_sq)

    if dna_mag == 0.0:
        return 0.0

    mag = math.sqrt(tag_mag_sq) * dna_mag
    return dot / mag if mag > 0 else 0.0


def score_outfit(items: list[dict[str, Any]], dna: dict[str, float]) -> float:
    if not items:
        return 0.0
    dna_mag = math.sqrt(sum(float(d or 0) ** 2 for d in dna.values()))
    if dna_mag == 0.0:
        return 0.0
    return round(sum(score_item(item, dna, dna_mag) for item in items) / len(items), 4)


def validate_ai_response(
    response: dict[str, Any],
    item_pool: list[dict[str, Any]],
) -> dict[str, Any] | None:
    pool_by_id = {str(item["id"]): item for item in item_pool}
    item_ids = response.get("item_ids")
    reasoning = response.get("reasoning")
    confidence = response.get("confidence")

    if not isinstance(item_ids, list) or not all(isinstance(item, str) for item in item_ids):
        return None
    if not set(item_ids).issubset(pool_by_id):
        return None
    if not isinstance(reasoning, list) or not reasoning:
        return None
    if not all(isinstance(reason, str) and reason.strip() for reason in reasoning):
        return None
    if not isinstance(confidence, (int, float)) or not 0 <= confidence <= 1:
        return None

    roles = {pool_by_id[item_id].get("layer_role") for item_id in item_ids}
    if not set(REQUIRED_ROLES).issubset(roles):
        return None

    return {
        "item_ids": item_ids,
        "reasoning": reasoning,
        "styling_tip": response.get("styling_tip") if isinstance(response.get("styling_tip"), str) else None,
        "confidence": float(confidence),
    }


def deterministic_fallback(
    item_pool: list[dict[str, Any]],
    dna: dict[str, float],
) -> dict[str, Any] | None:
    by_role: dict[str, list[dict[str, Any]]] = {role: [] for role in VALID_ROLES}
    for item in item_pool:
        role = item.get("layer_role")
        if role in by_role:
            by_role[role].append(item)

    if any(not by_role[role] for role in REQUIRED_ROLES):
        return None

    dna_mag = math.sqrt(sum(float(d or 0) ** 2 for d in dna.values()))
    picks = [max(by_role[role], key=lambda item: score_item(item, dna, dna_mag)) for role in REQUIRED_ROLES]
    for role in OPTIONAL_ROLES:
        if by_role[role]:
            candidate = max(by_role[role], key=lambda item: score_item(item, dna, dna_mag))
            if score_item(candidate, dna, dna_mag) >= 0.2:
                picks.append(candidate)

    return {
        "item_ids": [str(item["id"]) for item in picks],
        "reasoning": ["Selected from your strongest matching wardrobe categories."],
        "styling_tip": "Keep the look balanced with simple proportions and clean finishing details.",
        "confidence": score_outfit(picks, dna),
    }


def has_outfit_today(supabase: Any, user_id: str) -> bool:
    start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    response = (
        supabase.table("outfits")
        .select("id")
        .eq("user_id", user_id)
        .in_("source", ["daily_ai", "daily_fallback"])
        .gte("created_at", start.isoformat())
        .limit(1)
        .execute()
    )
    return bool(response.data)


def fetch_user_ids(supabase: Any) -> list[str]:
    response = supabase.table("users").select("id").execute()
    return [str(row["id"]) for row in (response.data or []) if row.get("id")]


def verify_database(supabase: Any) -> None:
    supabase.table("users").select("id").limit(1).execute()


def ensure_fashion_dna(supabase: Any, user_id: str) -> dict[str, float]:
    query = supabase.table("fashion_dna").select("vector").eq("user_id", user_id)
    if hasattr(query, "maybe_single"):
        response = query.maybe_single().execute()
    else:
        response = query.single().execute()

    if getattr(response, "error", None):
        error = response.error
        if isinstance(error, dict) and error.get("code") == "PGRST116":
            response = None
        else:
            raise RuntimeError(f"Failed to fetch fashion_dna for user {user_id}: {response.error}")

    if response and response.data:
        row = response.data
        return row.get("vector") or {}

    # Ensure a default fashion_dna row exists for the user so future runs can use it.
    insert_response = supabase.table("fashion_dna").insert({"user_id": user_id, "vector": {}}).execute()
    if getattr(insert_response, "error", None):
        raise RuntimeError(f"Failed to insert default fashion_dna for user {user_id}: {insert_response.error}")

    if insert_response.data:
        row = insert_response.data[0] if isinstance(insert_response.data, list) else insert_response.data
        return row.get("vector") or {}

    return {}


def fetch_wardrobe_items(supabase: Any, user_id: str) -> list[dict[str, Any]]:
    response = (
        supabase.table("user_wardrobe_items")
        .select("wardrobe_items (id, display_name, image_url, layer_role, style_tags)")
        .eq("user_id", user_id)
        .execute()
    )
    if getattr(response, "error", None):
        raise RuntimeError(f"Failed to fetch wardrobe items for user {user_id}: {response.error}")

    rows = response.data or []
    if not rows:
        raise RuntimeError(f"No wardrobe items rows found for user {user_id}")

    items = []
    for row in rows:
        item = row.get("wardrobe_items")
        if isinstance(item, list):
            item = item[0] if item else None
        if item and item.get("layer_role") in VALID_ROLES:
            items.append(item)

    if not items:
        raise RuntimeError(f"No valid wardrobe items found for user {user_id}")
    return items


def parse_groq_content(content: str) -> dict[str, Any] | None:
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        return None


def call_groq_once(groq_client: Any, model: str, item_pool: list[dict[str, Any]], dna: dict[str, float]) -> dict[str, Any] | None:
    messages = [
        {
            "role": "system",
            "content": "Return only JSON with item_ids, reasoning, styling_tip, confidence. Pick a valid daily outfit from supplied wardrobe ids.",
        },
        {"role": "user", "content": json.dumps({"fashion_dna": dna, "wardrobe_items": item_pool})},
    ]

    try:
        response = groq_client.chat.completions.create(
            model=model,
            temperature=0.2,
            response_format={"type": "json_object"},
            messages=messages,
        )
    except Exception as exc:
        text_exc = str(exc)
        print(f"Groq API error: {exc}", file=sys.stderr)
        try:
            import traceback

            traceback.print_exc()
        except Exception:
            pass

        # If the error indicates the model failed JSON validation, retry
        # without the enforced response_format to capture the raw text
        # and attempt to parse it locally.
        if "json_validate_failed" in text_exc or "Failed to validate JSON" in text_exc:
            try:
                fallback_resp = groq_client.chat.completions.create(
                    model=model,
                    temperature=0.2,
                    messages=messages,
                )
            except Exception as exc2:
                print(f"Groq fallback request also failed: {exc2}", file=sys.stderr)
                return None

            try:
                content = fallback_resp.choices[0].message.content
            except Exception:
                print("Groq fallback response missing expected structure:", fallback_resp, file=sys.stderr)
                return None

            if not content:
                print("Groq fallback returned empty content. Full response:", fallback_resp, file=sys.stderr)
                return None

            parsed = parse_groq_content(content)
            if parsed is None:
                print("Failed to parse Groq fallback content as JSON. Raw content follows:\n", content, file=sys.stderr)
                try:
                    with open(".last_groq_response.json", "w", encoding="utf-8") as fh:
                        fh.write(content)
                except Exception as e:
                    print("Failed to write debug file:", e, file=sys.stderr)
                return None

            return validate_ai_response(parsed or {}, item_pool)

        return None

    # Normal response handling when the strict JSON request succeeds
    content = None
    try:
        content = response.choices[0].message.content
    except Exception:
        print("Groq response missing expected structure:", response, file=sys.stderr)

    if not content:
        print("Groq returned empty content. Full response:", response, file=sys.stderr)
        return None

    parsed = parse_groq_content(content)
    if parsed is None:
        print("Failed to parse Groq content as JSON. Raw content follows:\n", content, file=sys.stderr)
        try:
            with open(".last_groq_response.json", "w", encoding="utf-8") as fh:
                fh.write(content)
        except Exception as e:
            print("Failed to write debug file:", e, file=sys.stderr)
        return None

    return validate_ai_response(parsed or {}, item_pool)


def generate_ai_outfit(
    groq_client: Any,
    item_pool: list[dict[str, Any]],
    dna: dict[str, float],
    model: str,
    backoff_seconds: float = 0.25,
) -> dict[str, Any] | None:
    for attempt in range(2):
        try:
            return call_groq_once(groq_client, model, item_pool, dna)
        except Exception as exc:
            if attempt == 0:
                print(f"Groq request failed, retrying once: {exc}", file=sys.stderr)
                time.sleep(backoff_seconds)
                continue
            print(f"Groq request failed after retry: {exc}", file=sys.stderr)
    return None


def persist_outfit(supabase: Any, user_id: str, outfit: dict[str, Any], source: str) -> Any:
    return (
        supabase.table("outfits")
        .insert(
            {
                "user_id": user_id,
                "item_ids": outfit["item_ids"],
                "reasoning": outfit["reasoning"],
                "styling_tip": outfit.get("styling_tip"),
                "confidence": outfit.get("confidence"),
                "source": source,
            }
        )
        .execute()
    )


def generate_for_user(
    supabase: Any,
    groq_client: Any,
    user_id: str,
    dry_run: bool = False,
) -> dict[str, Any] | None:
    if has_outfit_today(supabase, user_id):
        print(f"{user_id}: daily outfit already exists")
        return None

    dna = ensure_fashion_dna(supabase, user_id)
    item_pool = fetch_wardrobe_items(supabase, user_id)
    outfit = generate_ai_outfit(
        groq_client,
        item_pool,
        dna,
        os.getenv("GROQ_MODEL", "qwen/qwen3.6-27b"),
    )
    source = "daily_ai"
    if outfit is None:
        outfit = deterministic_fallback(item_pool, dna)
        source = "daily_fallback"

    if outfit is None:
        print(f"{user_id}: no valid outfit could be generated")
        return None

    result = {**outfit, "source": source}
    if dry_run:
        print(json.dumps(result, indent=2))
        return result

    persist_outfit(supabase, user_id, outfit, source)
    print(f"{user_id}: saved {source} outfit")
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--user-id")
    parser.add_argument("--all-users", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--user-delay", type=float, default=0.25)
    args = parser.parse_args(argv)

    if not args.all_users and not args.user_id:
        parser.error("Provide --user-id or --all-users")

    load_environment()
    try:
        groq_key, supabase_url, supabase_key = validate_config()
        supabase = create_client(supabase_url, supabase_key)
        groq_client = Groq(api_key=groq_key)
        verify_database(supabase)
        user_ids = fetch_user_ids(supabase) if args.all_users else [args.user_id]
    except Exception as exc:
        print(f"Fatal config error: {exc}", file=sys.stderr)
        return 1

    completed = 0
    failed = 0
    for index, user_id in enumerate(user_ids):
        try:
            generate_for_user(supabase, groq_client, str(user_id), dry_run=args.dry_run)
            completed += 1
        except Exception as exc:
            failed += 1
            print(f"{user_id}: failed: {exc}", file=sys.stderr)
        if args.all_users and index < len(user_ids) - 1:
            time.sleep(args.user_delay)

    print(f"Summary: completed={completed}, failed={failed}, total={len(user_ids)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
