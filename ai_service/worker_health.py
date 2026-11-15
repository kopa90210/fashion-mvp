"""Optional HTTP liveness probe for the polling worker."""

from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread


class _HealthHandler(BaseHTTPRequestHandler):
    timeout = 5

    def _respond(self, *, include_body: bool) -> None:
        healthy = self.path in ("/", "/health")
        body = b'{"status":"ok"}\n' if healthy else b'{"status":"not_found"}\n'
        self.send_response(200 if healthy else 404)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if include_body:
            self.wfile.write(body)

    def do_GET(self) -> None:
        self._respond(include_body=True)

    def do_HEAD(self) -> None:
        self._respond(include_body=False)

    def log_message(self, *_args: object) -> None:
        pass  # Do not log headers or paths from probe traffic.


@contextmanager
def serve_worker_health(port: int | None):
    """Run a probe alongside the poll loop; leave it disabled without a port."""
    if port is None:
        yield None
        return

    with ThreadingHTTPServer(("0.0.0.0", port), _HealthHandler) as server:
        thread = Thread(target=server.serve_forever, daemon=True, name="worker-health")
        thread.start()
        try:
            yield server.server_port
        finally:
            server.shutdown()
            thread.join()
