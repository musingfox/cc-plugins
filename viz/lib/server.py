#!/usr/bin/env python3
"""POST-capable file server for viz recipes.

Serves /tmp/viz/ for browsers and exposes /api/save so recipe HTML pages
can write the canonical markdown source back to disk. Markdown stays the
single source of truth; HTML is the editing surface.
"""
import json
import os
import sys  # noqa: F401  (kept for forward compat)
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = "/tmp/viz"
PORT = int(os.environ.get("VIZ_PORT", "18090"))
DEFAULT_HOST = "127.0.0.1"
MAX_BODY = 10 * 1024 * 1024  # 10 MB


def _validate_md_path(path):
    if not isinstance(path, str) or not path:
        return (400, {"error": "missing_path"})
    if path != os.path.abspath(path):
        return (400, {"error": "path_not_absolute"})
    if ".." in path.split(os.sep):
        return (400, {"error": "path_traversal"})
    if not path.endswith(".md"):
        return (400, {"error": "not_markdown"})
    if not os.path.isfile(path):
        return (404, {"error": "file_not_found", "path": path})
    return None


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def log_message(self, fmt, *args):
        return

    def do_GET(self):
        if self.path == "/api/health":
            self._json(200, {"ok": True, "service": "viz"})
            return
        if self.path.startswith("/api/stat"):
            from urllib.parse import urlparse, parse_qs
            qs = parse_qs(urlparse(self.path).query)
            path = qs.get("path", [""])[0]
            if not path or not os.path.isfile(path):
                self._json(404, {"error": "not_found"})
                return
            self._json(200, {"mtime": os.path.getmtime(path)})
            return
        if self.path.startswith("/api/read"):
            from urllib.parse import urlparse, parse_qs
            qs = parse_qs(urlparse(self.path).query)
            path = qs.get("path", [""])[0]
            err = _validate_md_path(path)
            if err:
                self._json(err[0], err[1])
                return
            try:
                with open(path, "r", encoding="utf-8") as f:
                    content = f.read()
                self._json(200, {
                    "content": content,
                    "mtime": os.path.getmtime(path),
                })
            except Exception as e:
                self._json(500, {"error": "read_failed", "detail": str(e)})
            return
        super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_POST(self):
        if self.path != "/api/save":
            self._json(404, {"error": "not_found"})
            return
        length = int(self.headers.get("Content-Length", 0) or 0)
        if length <= 0 or length > MAX_BODY:
            self._json(413, {"error": "bad_size"})
            return
        try:
            body = json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception as e:
            self._json(400, {"error": "bad_json", "detail": str(e)})
            return

        path = body.get("path", "")
        content = body.get("content", "")
        client_mtime = body.get("mtime")

        err = _validate_md_path(path)
        if err:
            self._json(err[0], err[1])
            return
        if not isinstance(content, str):
            self._json(400, {"error": "bad_content"})
            return

        cur_mtime = os.path.getmtime(path)
        if client_mtime is not None:
            try:
                cm = float(client_mtime)
            except (TypeError, ValueError):
                cm = None
            if cm is not None and abs(cur_mtime - cm) > 0.001:
                self._json(409, {
                    "error": "conflict",
                    "current_mtime": cur_mtime,
                })
                return

        tmp = path + ".viz-tmp"
        try:
            with open(tmp, "w", encoding="utf-8") as f:
                f.write(content)
            os.replace(tmp, path)
        except Exception as e:
            try:
                os.remove(tmp)
            except OSError:
                pass
            self._json(500, {"error": "write_failed", "detail": str(e)})
            return

        self._json(200, {"ok": True, "mtime": os.path.getmtime(path)})

    def _json(self, code, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)


def main():
    host = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_HOST
    os.makedirs(ROOT, exist_ok=True)
    ThreadingHTTPServer((host, PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
