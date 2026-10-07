"""Local orchestration for curated catalog processing and ingestion."""

from .contracts import normalize_attributes, validate_attributes
from .provider import ColabCuratedProvider, CuratedProviderError

__all__ = [
    "ColabCuratedProvider",
    "CuratedProviderError",
    "normalize_attributes",
    "validate_attributes",
]
