from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from PIL import Image

from .contracts import MANIFEST_VERSION, SCHEMA_VERSION, ContractError, validate_attributes


SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png"}
PROFILE_NAMES = {"feminine", "masculine", "neutral"}
CATEGORY_HINTS = {
    "tops": "top",
    "top": "top",
    "bottoms": "bottom",
    "bottom": "bottom",
    "one_piece": "one_piece",
    "one-piece": "one_piece",
    "outerwear": "outerwear",
    "footwear": "footwear",
    "shoes": "footwear",
    "accessories": "accessory",
    "accessory": "accessory",
}


@dataclass(frozen=True)
class DatasetLayout:
    @property
    def raw_root(self) -> Path:
        return self.root / "raw"

    @property
    def processed_root(self) -> Path:
        return self.root / "processed"

    @property
    def manifests_root(self) -> Path:
        return self.root / "manifests"

    @property
    def reports_root(self) -> Path:
        return self.root / "reports"
    root: Path

    @property
    def raw(self) -> Path:
        return self.root / "raw"

    @property
    def processed(self) -> Path:
        return self.root / "processed"

    @property
    def manifests(self) -> Path:
        return self.root / "manifests"

    def ensure(self) -> None:
        self.raw.mkdir(parents=True, exist_ok=True)
        self.processed.mkdir(parents=True, exist_ok=True)
        self.manifests.mkdir(parents=True, exist_ok=True)

    def photos(self) -> list[Path]:
        if not self.raw.exists():
            raise FileNotFoundError(f"Raw dataset folder does not exist: {self.raw}")
        return sorted(path for path in self.raw.rglob("*") if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS)

    def relative_source(self, photo: Path) -> Path:
        return photo.relative_to(self.raw)

    def processed_path(self, relative_source: Path) -> Path:
        _require_safe_relative_path(relative_source)
        return (self.processed / relative_source).with_suffix(".png")

    def manifest_path(self, relative_source: Path) -> Path:
        _require_safe_relative_path(relative_source)
        return (self.manifests / relative_source).with_suffix(".json")


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _require_safe_relative_path(path: Path) -> None:
    if path.is_absolute() or ".." in path.parts:
        raise ContractError("artifact path must remain inside the dataset root")


def derive_hints(relative_source: Path | str) -> tuple[str, str]:
    relative_source = Path(relative_source)
    parts = [part.lower() for part in relative_source.parts[:-1]]
    profile = next((part for part in parts if part in PROFILE_NAMES), "neutral")
    category = next((CATEGORY_HINTS[part] for part in reversed(parts) if part in CATEGORY_HINTS), "")
    return profile, category


def build_manifest(
    relative_source: Path,
    photo_digest: str,
    presentation_profile: str,
    expected_category: str,
    attributes: dict[str, Any],
    png_bytes: bytes,
    width: int,
    height: int,
) -> dict[str, Any]:
    return {
        "manifest_version": MANIFEST_VERSION,
        "schema_version": SCHEMA_VERSION,
        "photo_sha256": photo_digest,
        "source_relative_path": relative_source.as_posix(),
        "presentation_profile": presentation_profile,
        "expected_category": expected_category,
        "attributes": attributes,
        "cutout": {
            "mime_type": "image/png",
            "width": width,
            "height": height,
            "sha256": hashlib.sha256(png_bytes).hexdigest(),
            "processed_relative_path": relative_source.with_suffix(".png").as_posix(),
        },
        "processed_at": datetime.now(timezone.utc).isoformat(),
    }


def write_cache(png_path: Path, manifest_path: Path, png_bytes: bytes, manifest: dict[str, Any]) -> None:
    png_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    png_tmp = png_path.with_name(f".{png_path.name}.tmp")
    manifest_tmp = manifest_path.with_name(f".{manifest_path.name}.tmp")
    try:
        png_tmp.write_bytes(png_bytes)
        manifest_tmp.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        os.replace(png_tmp, png_path)
        os.replace(manifest_tmp, manifest_path)
    finally:
        png_tmp.unlink(missing_ok=True)
        manifest_tmp.unlink(missing_ok=True)


def load_valid_cache(
    layout: DatasetLayout,
    relative_source: Path,
    expected_photo_hash: str | None,
    min_confidence: float,
) -> tuple[dict[str, Any], Path]:
    manifest_path = layout.manifest_path(relative_source)
    png_path = layout.processed_path(relative_source)
    if not manifest_path.is_file() or not png_path.is_file():
        raise ContractError("processed PNG and manifest are both required")
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ContractError("manifest is not valid JSON") from exc
    if not isinstance(manifest, dict):
        raise ContractError("manifest must be a JSON object")
    if manifest.get("manifest_version") != MANIFEST_VERSION or manifest.get("schema_version") != SCHEMA_VERSION:
        raise ContractError("manifest version is unsupported")
    if expected_photo_hash is not None and manifest.get("photo_sha256") != expected_photo_hash:
        raise ContractError("manifest photo hash does not match the raw image")
    if manifest.get("source_relative_path") != relative_source.as_posix():
        raise ContractError("manifest source path does not match")
    attributes = manifest.get("attributes")
    if not isinstance(attributes, dict):
        raise ContractError("manifest attributes must be a JSON object")
    problems = validate_attributes(attributes, min_confidence)
    if problems:
        raise ContractError("; ".join(problems))
    cutout = manifest.get("cutout")
    if not isinstance(cutout, dict) or cutout.get("mime_type") != "image/png":
        raise ContractError("manifest cutout must describe an image/png")
    png_bytes = png_path.read_bytes()
    if hashlib.sha256(png_bytes).hexdigest() != cutout.get("sha256"):
        raise ContractError("processed PNG hash does not match the manifest")
    try:
        with Image.open(png_path) as image:
            image.verify()
        with Image.open(png_path) as image:
            dimensions = image.size
            image_format = image.format
            has_alpha = image.mode in {"RGBA", "LA"} or "transparency" in image.info
    except Exception as exc:
        raise ContractError("processed artifact is not a valid PNG") from exc
    if image_format != "PNG" or not has_alpha:
        raise ContractError("processed artifact must be a transparent PNG")
    if dimensions != (cutout.get("width"), cutout.get("height")):
        raise ContractError("processed PNG dimensions do not match the manifest")
    return manifest, png_path
