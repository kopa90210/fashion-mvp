from urllib.error import HTTPError
from urllib.request import Request, urlopen

import pytest

from ai_service.worker_health import serve_worker_health


def test_background_worker_health_responds_only_on_probe_paths():
    with serve_worker_health(0) as port:
        base = f"http://127.0.0.1:{port}"
        with urlopen(f"{base}/health", timeout=2) as response:
            assert response.status == 200
            assert response.read() == b'{"status":"ok"}\n'
        with urlopen(Request(base, method="HEAD"), timeout=2) as response:
            assert response.status == 200
            assert not response.read()
        with pytest.raises(HTTPError) as exc:
            urlopen(f"{base}/internal/process-next-job", timeout=2)
        assert exc.value.code == 404
