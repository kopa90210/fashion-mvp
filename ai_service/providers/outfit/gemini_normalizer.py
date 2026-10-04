from __future__ import annotations

from typing import Any


CATEGORIES = {
    "top",
    "bottom",
    "footwear",
    "outerwear",
    "accessory",
}


CATEGORY_ALIASES = {
    "shirt": "top",
    "button-up shirt": "top",
    "t-shirt": "top",
    "tee": "top",
    "sweater": "top",

    "pants": "bottom",
    "trousers": "bottom",
    "jeans": "bottom",
    "shorts": "bottom",
    "skirt": "bottom",

    "shoe": "footwear",
    "shoes": "footwear",
    "sneaker": "footwear",
    "sneakers": "footwear",
    "boots": "footwear",

    "jacket": "outerwear",
    "coat": "outerwear",
    "blazer": "outerwear",

    "glasses": "accessory",
    "sunglasses": "accessory",
    "watch": "accessory",
    "belt": "accessory",
    "bag": "accessory",
}


def normalize_category(
    category: str,
    subcategory: str,
) -> str:
    category = category.strip().lower()
    subcategory = subcategory.strip().lower()

    if category in CATEGORIES:
        return category

    if category in CATEGORY_ALIASES:
        return CATEGORY_ALIASES[category]

    if subcategory in CATEGORY_ALIASES:
        return CATEGORY_ALIASES[subcategory]

    raise ValueError(
        f"Unsupported garment category: {category}"
    )


def normalize_confidence(value: Any) -> float:
    if isinstance(value, bool):
        return 0.0

    if not isinstance(value, (int, float)):
        return 0.0

    return max(
        0.0,
        min(1.0, float(value)),
    )


def normalize_fit(
    category: str,
    fit: str,
) -> dict[str, float]:
    fit = fit.strip().lower()

    # Fit is not useful for these categories in our MVP.
    if category in {
        "footwear",
        "accessory",
    }:
        return {}

    if fit not in {
        "slim",
        "regular",
        "relaxed",
        "oversized",
    }:
        return {}

    return {
        fit: 1.0,
    }


def normalize_style_tags(
    tags: list[str],
) -> dict[str, float]:
    result: dict[str, float] = {}

    for tag in tags[:8]:
        if not isinstance(tag, str):
            continue

        value = (
            tag.strip()
            .lower()
            .replace(" ", "-")
        )

        if not value:
            continue

        result[value[:40]] = 1.0

    return result


def normalized_box(
    box_2d: list[int],
) -> dict[str, float]:
    if len(box_2d) != 4:
        raise ValueError(
            "Gemini bounding box must have four values"
        )

    ymin, xmin, ymax, xmax = [
        max(0, min(1000, float(value)))
        for value in box_2d
    ]

    if xmax <= xmin or ymax <= ymin:
        raise ValueError(
            "Invalid Gemini bounding box"
        )

    return {
        "x": xmin / 1000,
        "y": ymin / 1000,
        "width": (xmax - xmin) / 1000,
        "height": (ymax - ymin) / 1000,
    }
ALLOWED_PATTERNS = {
    "solid",
    "striped",
    "checked",
    "graphic",
    "floral",
    "other",
}


def normalize_pattern(
    value: str,
) -> str | None:
    value = value.strip().lower()

    if value in ALLOWED_PATTERNS:
        return value

    return None
