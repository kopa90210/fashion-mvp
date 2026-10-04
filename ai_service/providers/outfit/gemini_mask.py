from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from PIL import Image, ImageDraw


@dataclass(frozen=True)
class DecodedMask:
    points: list[tuple[int, int]]
    mode: str
    score: float


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _normalized_box_to_pixels(
    box_2d: list[int],
    width: int,
    height: int,
) -> tuple[int, int, int, int]:
    if len(box_2d) != 4:
        raise ValueError("Garment box must contain four values")

    ymin, xmin, ymax, xmax = [
        _clamp(float(value), 0, 1000)
        for value in box_2d
    ]

    left = round(xmin / 1000 * width)
    top = round(ymin / 1000 * height)
    right = round(xmax / 1000 * width)
    bottom = round(ymax / 1000 * height)

    if right <= left or bottom <= top:
        raise ValueError("Invalid garment bounding box")

    return left, top, right, bottom


def _global_xy(
    raw_points: Iterable[list[int]],
    width: int,
    height: int,
) -> list[tuple[int, int]]:
    return [
        (
            round(_clamp(point[0], 0, 1000) / 1000 * width),
            round(_clamp(point[1], 0, 1000) / 1000 * height),
        )
        for point in raw_points
        if len(point) == 2
    ]


def _global_yx(
    raw_points: Iterable[list[int]],
    width: int,
    height: int,
) -> list[tuple[int, int]]:
    return [
        (
            round(_clamp(point[1], 0, 1000) / 1000 * width),
            round(_clamp(point[0], 0, 1000) / 1000 * height),
        )
        for point in raw_points
        if len(point) == 2
    ]


def _box_relative_xy(
    raw_points: Iterable[list[int]],
    box: tuple[int, int, int, int],
) -> list[tuple[int, int]]:
    left, top, right, bottom = box

    box_width = right - left
    box_height = bottom - top

    return [
        (
            left
            + round(
                _clamp(point[0], 0, 1000)
                / 1000
                * box_width
            ),
            top
            + round(
                _clamp(point[1], 0, 1000)
                / 1000
                * box_height
            ),
        )
        for point in raw_points
        if len(point) == 2
    ]


def _box_relative_yx(
    raw_points: Iterable[list[int]],
    box: tuple[int, int, int, int],
) -> list[tuple[int, int]]:
    left, top, right, bottom = box

    box_width = right - left
    box_height = bottom - top

    return [
        (
            left
            + round(
                _clamp(point[1], 0, 1000)
                / 1000
                * box_width
            ),
            top
            + round(
                _clamp(point[0], 0, 1000)
                / 1000
                * box_height
            ),
        )
        for point in raw_points
        if len(point) == 2
    ]


def _score_polygon(
    points: list[tuple[int, int]],
    image_size: tuple[int, int],
    box: tuple[int, int, int, int],
) -> float:
    if len(points) < 3:
        return 0.0

    width, height = image_size
    left, top, right, bottom = box

    mask = Image.new(
        "L",
        (width, height),
        0,
    )

    draw = ImageDraw.Draw(mask)

    try:
        draw.polygon(points, fill=255)
    except Exception:
        return 0.0

    histogram = mask.histogram()
    polygon_area = histogram[255]

    if polygon_area <= 0:
        return 0.0

    inside = mask.crop(
        (left, top, right, bottom)
    ).histogram()[255]

    inside_ratio = inside / polygon_area

    box_area = max(
        1,
        (right - left) * (bottom - top),
    )

    coverage = inside / box_area

    xs = [point[0] for point in points]
    ys = [point[1] for point in points]

    center_x = sum(xs) / len(xs)
    center_y = sum(ys) / len(ys)

    center_inside = (
        left <= center_x <= right
        and top <= center_y <= bottom
    )

    coverage_score = min(
        coverage / 0.15,
        1.0,
    )

    return (
        inside_ratio * 0.75
        + coverage_score * 0.20
        + (0.05 if center_inside else 0.0)
    )


def decode_gemini_mask(
    raw_points: list[list[int]],
    box_2d: list[int],
    image_size: tuple[int, int],
) -> DecodedMask:
    width, height = image_size

    box = _normalized_box_to_pixels(
        box_2d,
        width,
        height,
    )

    candidates = {
        "global_xy": _global_xy(
            raw_points,
            width,
            height,
        ),
        "global_yx": _global_yx(
            raw_points,
            width,
            height,
        ),
        "box_relative_xy": _box_relative_xy(
            raw_points,
            box,
        ),
        "box_relative_yx": _box_relative_yx(
            raw_points,
            box,
        ),
    }

    scored = [
        DecodedMask(
            points=points,
            mode=mode,
            score=_score_polygon(
                points,
                image_size,
                box,
            ),
        )
        for mode, points in candidates.items()
    ]

    best = max(
        scored,
        key=lambda candidate: candidate.score,
    )

    if best.score < 0.35:
        raise ValueError(
            "Gemini segmentation mask does not "
            "reliably match its bounding box"
        )

    return best


def render_segmented_garment(
    source: Image.Image,
    box_2d: list[int],
    raw_points: list[list[int]],
) -> tuple[Image.Image, DecodedMask]:
    source = source.convert("RGBA")

    width, height = source.size

    decoded = decode_gemini_mask(
        raw_points,
        box_2d,
        source.size,
    )

    mask = Image.new(
        "L",
        source.size,
        0,
    )

    ImageDraw.Draw(mask).polygon(
        decoded.points,
        fill=255,
    )

    source.putalpha(mask)

    left, top, right, bottom = (
        _normalized_box_to_pixels(
            box_2d,
            width,
            height,
        )
    )

    crop = source.crop(
        (left, top, right, bottom)
    )

    if crop.getchannel("A").getbbox() is None:
        raise ValueError(
            "Decoded mask produced an empty garment"
        )

    return crop, decoded