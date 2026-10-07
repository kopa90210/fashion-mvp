from __future__ import annotations

import mimetypes
from pathlib import Path
from typing import Any, Protocol

import httpx


class CuratedProvider(Protocol):
    def process(self, image_path: Path, presentation_profile: str, expected_category: str) -> dict[str, Any]: ...


class CuratedProviderError(RuntimeError):
    pass


class ColabCuratedProvider:
    def __init__(
        self,
        base_url: str,
        token: str,
        timeout_seconds: float = 120.0,
        client: httpx.Client | None = None,
    ) -> None:
        if not base_url.strip():
            raise ValueError("CURATED_PIPELINE_URL is required")
        if not token.strip():
            raise ValueError("CURATED_PIPELINE_TOKEN is required")
        self._endpoint = f"{base_url.rstrip('/')}/v1/curated/process"
        self._token = token
        self._timeout = timeout_seconds
        self._client = client or httpx.Client()

    def process(self, image_path: Path, presentation_profile: str, expected_category: str) -> dict[str, Any]:
        content_type = mimetypes.guess_type(image_path.name)[0] or "application/octet-stream"
        try:
            with image_path.open("rb") as image:
                response = self._client.post(
                    self._endpoint,
                    headers={"Authorization": f"Bearer {self._token}"},
                    files={"image": (image_path.name, image, content_type)},
                    data={
                        "presentation_profile": presentation_profile,
                        "expected_category": expected_category,
                    },
                    timeout=self._timeout,
                )
        except httpx.TimeoutException as exc:
            raise CuratedProviderError("Curated processing timed out") from exc
        except httpx.HTTPError as exc:
            raise CuratedProviderError("Curated processing request failed") from exc

        if response.status_code == 401:
            raise CuratedProviderError("Curated processing authorization failed (HTTP 401)")
        if not 200 <= response.status_code < 300:
            raise CuratedProviderError(f"Curated processing failed (HTTP {response.status_code})")
        try:
            payload = response.json()
        except ValueError as exc:
            raise CuratedProviderError("Curated processing returned invalid JSON") from exc
        if not isinstance(payload, dict):
            raise CuratedProviderError("Curated processing returned an invalid response")
        return payload
