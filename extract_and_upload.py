"""Compatibility entry point for curated catalog ingestion."""

from curated_pipeline.cli import main
from curated_pipeline.contracts import normalize_attributes, validate_attributes

__all__ = ["main", "normalize_attributes", "validate_attributes"]


if __name__ == "__main__":
    raise SystemExit(main())
