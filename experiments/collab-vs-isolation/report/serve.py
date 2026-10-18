import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from report.collect import collect

RUN = sys.argv[1]
PORT = int(sys.argv[2])
TEMPLATE = Path(__file__).parent / "template.html"


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/":
            body, kind = TEMPLATE.read_bytes(), "text/html; charset=utf-8"
        elif self.path == "/data.json":
            body, kind = json.dumps(collect(RUN)).encode(), "application/json"
        else:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", kind)
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


print(f"live dashboard for {RUN}: http://localhost:{PORT}", flush=True)
ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
