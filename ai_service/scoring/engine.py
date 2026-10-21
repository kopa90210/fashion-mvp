"""Pure scoring functions extracted from generate_daily_outfit.py (lines 42–140).

Zero I/O, zero side effects — fully unit-testable.
The logic is identical to the original script so that given the same inputs
the two code paths produce identical outputs (correctness invariant).
"""

from __future__ import annotations

import math
from typing import Any

# ---------------------------------------------------------------------------
# Role constants (single source of truth for the ai_service package)
# ---------------------------------------------------------------------------

REQUIRED_ROLES: tuple[str, ...] = ("base_layer", "bottom", "footwear")
ONE_PIECE_REQUIRED_ROLES: tuple[str, ...] = ("one_piece", "footwear")
OPTIONAL_ROLES: tuple[str, ...] = ("outerwear", "accessory")
VALID_ROLES: frozenset[str] = frozenset(REQUIRED_ROLES + ONE_PIECE_REQUIRED_ROLES + OPTIONAL_ROLES)


def is_valid_outfit_structure(items: list[dict[str, Any]]) -> bool:
    counts = {role: 0 for role in VALID_ROLES}
    for item in items:
        role = item.get("layer_role")
        if role not in counts:
            return False
        counts[role] += 1
    if counts["footwear"] != 1 or counts["outerwear"] > 1 or counts["accessory"] > 1:
        return False
    separates = counts["base_layer"] == 1 and counts["bottom"] == 1 and counts["one_piece"] == 0
    one_piece = counts["base_layer"] == 0 and counts["bottom"] == 0 and counts["one_piece"] == 1
    return separates or one_piece


# ---------------------------------------------------------------------------
# Item-level scoring
# ---------------------------------------------------------------------------

def score_item(
    item: dict[str, Any],
    dna: dict[str, float],
    dna_mag: float | None = None,
) -> float:
    """Cosine similarity between an item's style_tags and the user's fashion_dna.

    Args:
        item: Wardrobe item dict with a ``style_tags`` key.
        dna: User's fashion DNA vector {dimension: weight}.
        dna_mag: Pre-computed magnitude of *dna* (pass when scoring many items
                 against the same DNA to avoid recomputing it each time).

    Returns:
        Similarity score in [0, 1].
    """
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


# ---------------------------------------------------------------------------
# Outfit-level scoring
# ---------------------------------------------------------------------------

def score_outfit(items: list[dict[str, Any]], dna: dict[str, float]) -> float:
    """Mean cosine similarity across all items in the outfit.

    Args:
        items: List of wardrobe item dicts.
        dna: User's fashion DNA vector.

    Returns:
        Mean similarity score rounded to 4 decimal places, or 0.0 when the
        list is empty or the DNA vector is all-zero.
    """
    if not items:
        return 0.0
    dna_mag = math.sqrt(sum(float(d or 0) ** 2 for d in dna.values()))
    if dna_mag == 0.0:
        return 0.0
    return round(sum(score_item(item, dna, dna_mag) for item in items) / len(items), 4)


# ---------------------------------------------------------------------------
# AI response validation
# ---------------------------------------------------------------------------

def validate_ai_response(
    response: dict[str, Any],
    item_pool: list[dict[str, Any]],
) -> dict[str, Any] | None:
    """Validate a raw AI-generated outfit dict against the item pool.

    Checks:
    - ``item_ids`` is a list of strings that are all present in *item_pool*.
    - ``reasoning`` is a non-empty list of non-blank strings.
    - ``confidence`` is a float in [0, 1].
    - All required roles are covered by the selected items.

    Args:
        response: Raw parsed JSON from the AI provider.
        item_pool: Full wardrobe pool for the request.

    Returns:
        A cleaned response dict on success, or ``None`` if validation fails.
    """
    pool_by_id = {str(item["id"]): item for item in item_pool}
    item_ids = response.get("item_ids")
    reasoning = response.get("reasoning")
    confidence = response.get("confidence")

    if not isinstance(item_ids, list) or not all(isinstance(i, str) for i in item_ids):
        return None
    if not set(item_ids).issubset(pool_by_id):
        return None
    if not isinstance(reasoning, list) or not reasoning:
        return None
    if not all(isinstance(r, str) and r.strip() for r in reasoning):
        return None
    if not isinstance(confidence, (int, float)) or not 0 <= confidence <= 1:
        return None

    selected = [pool_by_id[item_id] for item_id in item_ids]
    if not is_valid_outfit_structure(selected):
        return None

    styling_tip = response.get("styling_tip")
    return {
        "item_ids": item_ids,
        "reasoning": reasoning,
        "styling_tip": styling_tip if isinstance(styling_tip, str) else None,
        "confidence": float(confidence),
    }


# ---------------------------------------------------------------------------
# Deterministic fallback
# ---------------------------------------------------------------------------

def deterministic_fallback(
    item_pool: list[dict[str, Any]],
    dna: dict[str, float],
) -> dict[str, Any] | None:
    """Select the best-scoring item per required role; add optional roles when score ≥ 0.2.

    Args:
        item_pool: Full wardrobe pool for the request.
        dna: User's fashion DNA vector.

    Returns:
        An outfit dict (same shape as ``validate_ai_response`` output), or
        ``None`` if any required role has no items in the pool.
    """
    by_role: dict[str, list[dict[str, Any]]] = {role: [] for role in VALID_ROLES}
    for item in item_pool:
        role = item.get("layer_role")
        if role in by_role:
            by_role[role].append(item)

    can_build_separates = all(by_role[role] for role in REQUIRED_ROLES)
    can_build_one_piece = all(by_role[role] for role in ONE_PIECE_REQUIRED_ROLES)
    if not can_build_separates and not can_build_one_piece:
        return None

    dna_mag = math.sqrt(sum(float(d or 0) ** 2 for d in dna.values()))
    archetypes = []
    for roles in (REQUIRED_ROLES, ONE_PIECE_REQUIRED_ROLES):
        if all(by_role[role] for role in roles):
            core = [max(by_role[role], key=lambda item: score_item(item, dna, dna_mag)) for role in roles]
            archetypes.append(core)
    picks = max(archetypes, key=lambda core: score_outfit(core, dna))
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
