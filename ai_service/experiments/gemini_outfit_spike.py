from __future__ import annotations

import argparse
import base64
import json
from pathlib import Path
import random
import time
from ai_service.providers.outfit.gemini_mask import (
    render_segmented_garment,
)
from google import genai
from PIL import Image, ImageDraw
from pydantic import BaseModel, Field

from ai_service.config import get_settings


class GarmentMask(BaseModel):
    box_2d: list[int] = Field(
        description=(
            "Bounding box as [ymin, xmin, ymax, xmax], "
            "normalized from 0 to 1000."
        )
    )
    mask: list[list[int]] = Field(
        description=(
            "Segmentation polygon as [x, y] points, "
            "normalized from 0 to 1000."
        )
    )
    label: str


class GarmentMask(BaseModel):
    box_2d: list[int]
    mask: list[list[int]]

    category: str
    subcategory: str
    display_name: str

    color_primary: str

    pattern: str = "unknown"
    fit: str = "unknown"

    style_tags: list[str] = Field(default_factory=list)
    formality_score: float = 0.5
    confidence: float

class GarmentMasks(BaseModel):
    boxes: list[GarmentMask]
    

PROMPT = """
Analyze the outfit worn by the main person.

Identify only visible garments that would be useful as wardrobe items.

Return at most 8 logical wardrobe pieces.

IMPORTANT:
- A pair of shoes is ONE footwear item.
- Do not return body parts.
- Do not return background objects.
- Do not invent brands.
- Do not invent materials that cannot be visually determined.
- Prefer fewer high-quality garments over uncertain detections.

For every garment return:

category:
One of exactly:
- top
- bottom
- footwear
- outerwear
- accessory

subcategory:
A concise fashion type such as:
- button-up shirt
- t-shirt
- jeans
- trousers
- sneakers
- jacket

display_name:
A natural wardrobe-friendly name such as:
"Brown button-up shirt"
"Beige trousers"
"White sneakers"

color_primary:
Main visible color.

pattern:
One of:
solid, striped, checked, graphic, floral, other, unknown

fit:
One of:
slim, regular, relaxed, oversized, unknown

style_tags:
Up to 5 concise style words such as:
casual, smart-casual, classic, minimal, streetwear

formality_score:
Number between 0 and 1.
0 = very casual.
1 = very formal.

confidence:
Number between 0 and 1 describing confidence that this garment and
its basic classification are correct.

Also return:
- box_2d as [ymin, xmin, ymax, xmax], normalized 0-1000
- mask polygon normalized 0-1000

Do not include hidden or uncertain garment details.
"""

def mime_for(path: Path) -> str:
    suffix = path.suffix.lower()

    if suffix in {".jpg", ".jpeg"}:
        return "image/jpeg"
    if suffix == ".png":
        return "image/png"
    if suffix == ".webp":
        return "image/webp"

    raise ValueError("Use JPEG, PNG, or WebP")


def validate_point(value: int) -> int:
    return max(0, min(1000, int(value)))


def render_masked_garment(
    source: Image.Image,
    garment: GarmentMask,
    output_path: Path,
) -> None:
    width, height = source.size

    if len(garment.box_2d) != 4:
        raise ValueError(
            f"Invalid box for {garment.label}"
        )

    ymin, xmin, ymax, xmax = [
        validate_point(value)
        for value in garment.box_2d
    ]

    left = round(xmin / 1000 * width)
    top = round(ymin / 1000 * height)
    right = round(xmax / 1000 * width)
    bottom = round(ymax / 1000 * height)

    if right <= left or bottom <= top:
        raise ValueError(
            f"Invalid box for {garment.label}"
        )

    #
    # IMPORTANT:
    # The observed Gemini response for this model behaves
    # like polygon points are [y, x] in full-image
    # normalized coordinates.
    #
    points = []

    for point in garment.mask:
        if len(point) != 2:
            continue

        y_norm = validate_point(point[0])
        x_norm = validate_point(point[1])

        x = round(x_norm / 1000 * width)
        y = round(y_norm / 1000 * height)

        points.append((x, y))

    if len(points) < 3:
        raise ValueError(
            f"Mask for {garment.label} "
            "has fewer than 3 usable points"
        )

    mask = Image.new(
        "L",
        source.size,
        0,
    )

    draw = ImageDraw.Draw(mask)

    draw.polygon(
        points,
        fill=255,
    )

    rgba = source.convert("RGBA")
    rgba.putalpha(mask)

    cropped = rgba.crop(
        (
            left,
            top,
            right,
            bottom,
        )
    )

    alpha = cropped.getchannel("A")

    if alpha.getbbox() is None:
        raise ValueError(
            f"Mask for {garment.label} "
            "does not overlap its bounding box"
        )

    cropped.save(
        output_path,
        format="PNG",
    )

def main() -> None:
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "image",
        help="Path to an outfit image",
    )

    args = parser.parse_args()

    image_path = Path(args.image)

    if not image_path.exists():
        raise FileNotFoundError(image_path)

    settings = get_settings()

    if not settings.gemini_api_key:
        raise RuntimeError(
            "GEMINI_API_KEY is missing from .env.local"
        )

    client = genai.Client(
        api_key=settings.gemini_api_key
    )

    image_bytes = image_path.read_bytes()

    interaction = call_gemini_with_retry(
        client,
        model=settings.gemini_outfit_model,
        input_data=[
            {
                "type": "text",
                "text": PROMPT,
            },
            {
                "type": "image",
                "data": base64.b64encode(
                    image_bytes
                ).decode("utf-8"),
                "mime_type": mime_for(image_path),
            },
        ],
        response_format={
            "type": "text",
            "mime_type": "application/json",
            "schema": GarmentMasks.model_json_schema(),
        },
        generation_config={
            "thinking_level": "low",
        },
    )

    result = GarmentMasks.model_validate_json(
        interaction.output_text
    )

    print()
    print("Gemini garments:")
    print(
        json.dumps(
            result.model_dump(),
            indent=2,
        )
    )

    output_dir = Path(
        "tmp/gemini_outfit_spike"
    )

    output_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    with Image.open(image_path) as opened:
        source = opened.convert("RGB")

        for index, garment in enumerate(
            result.boxes,
            start=1,
        ):
            safe_name = (
             garment.display_name
              .lower()
              .replace(" ", "_")
              .replace("/", "_")
                     )[:40]

            output_path = output_dir / (
                f"{index:02d}_{safe_name}.png"
            )

            crop, decoded = render_segmented_garment(
                source,
                garment.box_2d,
                garment.mask,
            )

            crop.save(
                output_path,
                format="PNG",
            )

            print(
                f"saved: {output_path} "
                f"mask_mode={decoded.mode} "
                f"score={decoded.score:.3f}"
            )
def call_gemini_with_retry(
    client,
    *,
    model: str,
    input_data,
    response_format,
    generation_config,
    max_attempts: int = 4,
):
    last_error = None

    for attempt in range(1, max_attempts + 1):
        try:
            print(
                f"Gemini request attempt "
                f"{attempt}/{max_attempts} "
                f"model={model}"
            )

            return client.interactions.create(
                model=model,
                input=input_data,
                response_format=response_format,
                generation_config=generation_config,
            )

        except Exception as exc:
            last_error = exc
            message = str(exc).lower()

            transient = (
                "503" in message
                or "service_unavailable" in message
                or "high demand" in message
                or "429" in message
                or "rate" in message
            )

            if not transient or attempt == max_attempts:
                raise

            wait_seconds = min(
                2 ** attempt + random.uniform(0, 1),
                15,
            )

            print(
                f"Transient Gemini error. "
                f"Retrying in {wait_seconds:.1f}s..."
            )

            time.sleep(wait_seconds)

    raise last_error


if __name__ == "__main__":
    main()