#!/usr/bin/env python3
"""arm-on-zynq workbench: the study app with an editor, terminal and file tree.

Serves the plan from this repo, reads and writes files inside the repo, runs a
shell in the browser over a websocket, and keeps study progress in
.study/progress.json so it travels with git.

Run on the server (Docker, see README) or on the laptop next to the hardware:

    pip install aiohttp
    python app/workbench/server.py --no-auth            # localhost only
    WORKBENCH_PASSWORD=... python app/workbench/server.py --host 0.0.0.0
"""
import argparse
import asyncio
import fcntl
import hashlib
import hmac
import html
import json
import mimetypes
import os
import pty
import secrets
import signal
import struct
import subprocess
import sys
import termios
import time
from pathlib import Path

from aiohttp import WSMsgType, web

HERE = Path(__file__).resolve().parent
APP = HERE.parent
sys.path.insert(0, str(APP))
import build  # noqa: E402  (app/build.py assembles the study page)

SKIP_DIRS = {".git", ".venv", "venv", "node_modules", "__pycache__", ".Xil", ".pytest_cache", "sim_build", ".ipynb_checkpoints"}
MAX_EDIT_BYTES = 2 * 1024 * 1024
COOKIE = "aoz_session"
SESSION_DAYS = 14

VENDOR = Path(os.environ.get("WORKBENCH_VENDOR", HERE / "vendor"))  # filled by vendor.py; the CDN is only a fallback
LOCAL = {
    "monaco": "/vendor/monaco-editor/min/vs",
    "xterm_css": "/vendor/xterm-xterm/css/xterm.css",
    "xterm_js": "/vendor/xterm-xterm/lib/xterm.js",
    "fit_js": "/vendor/xterm-addon-fit/lib/addon-fit.js",
}
CDN = {
    "monaco": "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs",
    "xterm_css": "https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/css/xterm.css",
    "xterm_js": "https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/lib/xterm.js",
    "fit_js": "https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0.10.0/lib/addon-fit.js",
}


def libs() -> dict:
    return LOCAL if (VENDOR / "monaco-editor" / "min" / "vs" / "loader.js").exists() else CDN


class Workbench:
    def __init__(self, root: Path, password: str | None, secret: bytes, shell: str):
        self.root = root.resolve()
        self.password = password
        self.secret = secret
        self.shell = shell
        self.progress_file = self.root / ".study" / "progress.json"

    # ---------------------------------------------------------------- paths
    def resolve(self, rel: str) -> Path:
        rel = (rel or "").strip().lstrip("/")
        p = (self.root / rel).resolve()
        if p != self.root and self.root not in p.parents:
            raise web.HTTPForbidden(text="path is outside the repository")
        if ".git" in p.relative_to(self.root).parts:
            raise web.HTTPForbidden(text="the .git folder is managed with git commands")
        return p

    def rel(self, p: Path) -> str:
        return p.relative_to(self.root).as_posix()

    # ---------------------------------------------------------------- auth
    def sign(self, issued: int) -> str:
        mac = hmac.new(self.secret, str(issued).encode(), hashlib.sha256).hexdigest()
        return f"{issued}.{mac}"

    def authed(self, request: web.Request) -> bool:
        if self.password is None:
            return True
        tok = request.cookies.get(COOKIE, "")
        issued, _, _ = tok.partition(".")
        if not issued.isdigit():
            return False
        if time.time() - int(issued) > SESSION_DAYS * 86400:
            return False
        return hmac.compare_digest(tok, self.sign(int(issued)))

    @web.middleware
    async def guard(self, request: web.Request, handler):
        if request.path in ("/login", "/healthz"):
            return await handler(request)
        if not self.authed(request):
            if request.path.startswith("/api/"):
                raise web.HTTPUnauthorized(text="log in again")
            raise web.HTTPFound("/login")
        # Mutating calls must come from the page itself (blocks cross-site form posts).
        if request.method in ("PUT", "POST", "DELETE") and request.headers.get("X-Workbench") != "1":
            raise web.HTTPForbidden(text="missing X-Workbench header")
        return await handler(request)

    async def login_page(self, request: web.Request, error: str = "") -> web.Response:
        msg = f'<p class="err">{html.escape(error)}</p>' if error else ""
        body = LOGIN_HTML.replace("{{error}}", msg)
        return web.Response(text=body, content_type="text/html")

    async def login(self, request: web.Request) -> web.Response:
        if self.password is None:
            raise web.HTTPFound("/")
        if request.method == "GET":
            return await self.login_page(request)
        form = await request.post()
        if not hmac.compare_digest(str(form.get("password", "")).encode(), self.password.encode()):
            await asyncio.sleep(1.5)  # slow down guessing
            return await self.login_page(request, "That password is not right.")
        resp = web.HTTPFound("/")
        secure = request.headers.get("X-Forwarded-Proto", request.scheme) == "https"
        resp.set_cookie(COOKIE, self.sign(int(time.time())), max_age=SESSION_DAYS * 86400,
                        httponly=True, samesite="Strict", secure=secure)
        raise resp

    async def logout(self, request: web.Request) -> web.Response:
        resp = web.HTTPFound("/login")
        resp.del_cookie(COOKIE)
        raise resp

    # ---------------------------------------------------------------- page
    async def index(self, request: web.Request) -> web.Response:
        page = build.build_fragment()
        host = {
            "initial": self.read_progress(),
            "repo": self.root.name,
            "auth": self.password is not None,
            "cdn": libs(),
        }
        boot = ("<script>window.AOZ_HOST=" + json.dumps(host).replace("</", "<\\/") + ";"
                "(function(){var t;window.AOZ_HOST.save=function(s){clearTimeout(t);t=setTimeout(function(){"
                "fetch('/api/progress',{method:'PUT',headers:{'Content-Type':'application/json','X-Workbench':'1'},"
                "body:JSON.stringify(s)}).catch(function(){});},400);};})();</script>\n")
        # The app script is the last <script> in the fragment; the host object must exist before it runs.
        cut = page.rfind("<script>")
        page = page[:cut] + boot + page[cut:]
        L = libs()
        tail = (f'<link rel="stylesheet" href="{L["xterm_css"]}">\n'
                '<link rel="stylesheet" href="/wb/workbench.css">\n'
                f'<script src="{L["xterm_js"]}"></script>\n'
                f'<script src="{L["fit_js"]}"></script>\n'
                f'<script src="{L["monaco"]}/loader.js"></script>\n'
                '<script src="/wb/workbench.js"></script>\n')
        doc = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
               '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
               '</head>\n<body class="workbench">\n' + page + "\n" + tail + "</body>\n</html>\n")
        return web.Response(text=doc, content_type="text/html", headers={"Cache-Control": "no-store"})

    async def asset(self, request: web.Request) -> web.FileResponse:
        name = request.match_info["name"]
        if name not in ("workbench.js", "workbench.css"):
            raise web.HTTPNotFound()
        return web.FileResponse(HERE / "static" / name, headers={"Cache-Control": "no-store"})

    # ---------------------------------------------------------------- progress
    def read_progress(self) -> dict:
        try:
            return json.loads(self.progress_file.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {}

    async def get_progress(self, request):
        return web.json_response(self.read_progress())

    async def put_progress(self, request):
        data = await request.json()
        if not isinstance(data, dict):
            raise web.HTTPBadRequest(text="progress must be an object")
        # Drop empty maps and false values so the committed file stays readable.
        clean = {k: ({kk: vv for kk, vv in v.items() if vv not in (None, False, "")} if isinstance(v, dict) else v)
                 for k, v in data.items()}
        self.progress_file.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.progress_file.with_suffix(".tmp")
        tmp.write_text(json.dumps(clean, indent=1, sort_keys=True) + "\n", encoding="utf-8")
        tmp.replace(self.progress_file)
        return web.json_response({"ok": True})

    # ---------------------------------------------------------------- files
    async def tree(self, request):
        out = []
        for dirpath, dirnames, filenames in os.walk(self.root):
            dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS)
            base = Path(dirpath)
            for d in dirnames:
                out.append({"path": self.rel(base / d), "dir": True})
            for f in sorted(filenames):
                if f.endswith((".pyc", ".tmp")):
                    continue
                p = base / f
                try:
                    size = p.stat().st_size
                except OSError:
                    continue
                out.append({"path": self.rel(p), "dir": False, "size": size})
            if len(out) > 20000:
                break
        return web.json_response({"root": self.root.name, "entries": out})

    async def read_file(self, request):
        p = self.resolve(request.query.get("path", ""))
        if not p.is_file():
            raise web.HTTPNotFound(text="no such file")
        if p.stat().st_size > MAX_EDIT_BYTES:
            raise web.HTTPRequestEntityTooLarge(max_size=MAX_EDIT_BYTES, actual_size=p.stat().st_size,
                                                text="too large to edit here")
        raw = p.read_bytes()
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            return web.json_response({"path": self.rel(p), "binary": True, "size": len(raw)})
        return web.json_response({"path": self.rel(p), "text": text, "mtime": p.stat().st_mtime})

    async def raw_file(self, request):
        p = self.resolve(request.query.get("path", ""))
        if not p.is_file():
            raise web.HTTPNotFound()
        ctype = mimetypes.guess_type(p.name)[0] or "application/octet-stream"
        return web.FileResponse(p, headers={"Content-Type": ctype, "Cache-Control": "no-store"})

    async def write_file(self, request):
        body = await request.json()
        p = self.resolve(body.get("path", ""))
        if p.is_dir():
            raise web.HTTPBadRequest(text="that path is a folder")
        expected = body.get("mtime")
        if expected is not None and p.exists() and abs(p.stat().st_mtime - float(expected)) > 1e-6 and not body.get("force"):
            raise web.HTTPConflict(text="the file changed on disk since you opened it")
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(body.get("text", ""), encoding="utf-8")
        return web.json_response({"path": self.rel(p), "mtime": p.stat().st_mtime})

    async def exists(self, request):
        body = await request.json()
        out = {}
        for rel in body.get("paths", [])[:500]:
            try:
                p = self.resolve(rel)
                out[rel] = "dir" if p.is_dir() else ("file" if p.is_file() else None)
            except web.HTTPException:
                out[rel] = None
        return web.json_response(out)

    async def git_status(self, request):
        def run(*args):
            r = subprocess.run(["git", *args], cwd=self.root, capture_output=True, text=True, timeout=10)
            return r.stdout.strip() if r.returncode == 0 else None
        branch = await asyncio.to_thread(run, "rev-parse", "--abbrev-ref", "HEAD")
        status = await asyncio.to_thread(run, "status", "--porcelain")
        return web.json_response({
            "branch": branch,
            "changed": len(status.splitlines()) if status else 0,
            "files": [ln[3:] for ln in status.splitlines()] if status else [],
        })

    # ---------------------------------------------------------------- terminal
    async def terminal(self, request):
        origin = request.headers.get("Origin")
        if origin and origin.split("://", 1)[-1] != request.headers.get("X-Forwarded-Host", request.host):
            raise web.HTTPForbidden(text="cross-origin terminal")
        ws = web.WebSocketResponse(heartbeat=30)
        await ws.prepare(request)

        master, slave = pty.openpty()
        env = dict(os.environ, TERM="xterm-256color", COLORTERM="truecolor")
        proc = subprocess.Popen([self.shell, "-l"], stdin=slave, stdout=slave, stderr=slave,
                                cwd=self.root, env=env, start_new_session=True, close_fds=True)
        os.close(slave)
        os.set_blocking(master, False)
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue[bytes | None] = asyncio.Queue()

        def readable():
            try:
                data = os.read(master, 65536)
            except OSError:
                data = b""
            if not data:
                loop.remove_reader(master)
                queue.put_nowait(None)
            else:
                queue.put_nowait(data)

        loop.add_reader(master, readable)

        async def pump():
            while True:
                data = await queue.get()
                if data is None:
                    break
                await ws.send_str(data.decode("utf-8", "replace"))
            await ws.close()

        pumper = asyncio.create_task(pump())
        try:
            async for msg in ws:
                if msg.type != WSMsgType.TEXT:
                    continue
                m = json.loads(msg.data)
                if m.get("t") == "i":
                    os.write(master, m.get("d", "").encode())
                elif m.get("t") == "r":
                    rows, cols = int(m.get("rows", 24)), int(m.get("cols", 80))
                    fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
        finally:
            pumper.cancel()
            try:
                loop.remove_reader(master)
            except Exception:
                pass
            try:
                os.killpg(proc.pid, signal.SIGHUP)
            except ProcessLookupError:
                pass
            os.close(master)
            await asyncio.to_thread(proc.wait)
        return ws

    async def healthz(self, request):
        return web.Response(text="ok")

    def app(self) -> web.Application:
        a = web.Application(middlewares=[self.guard], client_max_size=MAX_EDIT_BYTES * 2)
        a.add_routes([
            web.get("/", self.index),
            web.get("/healthz", self.healthz),
            web.get("/login", self.login),
            web.post("/login", self.login),
            web.get("/logout", self.logout),
            web.get("/wb/{name}", self.asset),
            web.get("/api/progress", self.get_progress),
            web.put("/api/progress", self.put_progress),
            web.get("/api/tree", self.tree),
            web.get("/api/file", self.read_file),
            web.put("/api/file", self.write_file),
            web.get("/api/raw", self.raw_file),
            web.post("/api/exists", self.exists),
            web.get("/api/git", self.git_status),
            web.get("/api/term", self.terminal),
        ])
        if VENDOR.is_dir():
            a.router.add_static("/vendor", VENDOR, show_index=False)
        return a


LOGIN_HTML = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>arm-on-zynq workbench</title>
<style>
:root{--bg:#f3f5f6;--panel:#fff;--ink:#15212b;--muted:#5b6b78;--line:#d9e0e5;--accent:#1c5bc4;--warn:#b3361f}
@media (prefers-color-scheme:dark){:root{--bg:#0f151b;--panel:#161e26;--ink:#dde5eb;--muted:#93a3b0;--line:#26323d;--accent:#79a6ff;--warn:#ff8a73;color-scheme:dark}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,sans-serif;padding:16px;box-sizing:border-box}
form{width:min(340px,100%);display:grid;gap:12px;padding:28px;background:var(--panel);border:1px solid var(--line);border-radius:10px}
h1{margin:0;font-size:20px}p{margin:0;color:var(--muted);font-size:13.5px}
input{padding:10px 12px;border:1px solid var(--line);border-radius:7px;background:var(--bg);color:var(--ink);font:inherit}
button{padding:10px;border:0;border-radius:7px;background:var(--accent);color:#fff;font:600 14px system-ui;cursor:pointer}
.err{color:var(--warn)}
</style></head><body>
<form method="post" action="/login"><h1>arm-on-zynq</h1><p>Workbench password</p>{{error}}
<input type="password" name="password" autofocus autocomplete="current-password" aria-label="Password">
<button type="submit">Log in</button></form></body></html>"""


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--root", default=os.environ.get("WORKBENCH_ROOT", str(APP.parent)), help="repository to work in")
    ap.add_argument("--host", default=os.environ.get("WORKBENCH_HOST", "127.0.0.1"))
    ap.add_argument("--port", type=int, default=int(os.environ.get("WORKBENCH_PORT", "8080")))
    ap.add_argument("--no-auth", action="store_true", help="skip the password (only allowed on 127.0.0.1)")
    ap.add_argument("--shell", default=os.environ.get("SHELL", "/bin/bash"))
    args = ap.parse_args()

    password = os.environ.get("WORKBENCH_PASSWORD") or None
    if args.no_auth:
        if args.host not in ("127.0.0.1", "localhost", "::1"):
            sys.exit("--no-auth is only allowed with --host 127.0.0.1: the workbench includes a terminal.")
        password = None
    elif not password:
        sys.exit("Set WORKBENCH_PASSWORD, or run with --no-auth on 127.0.0.1. The workbench includes a terminal.")

    secret = os.environ.get("WORKBENCH_SECRET", "").encode() or secrets.token_bytes(32)
    wb = Workbench(Path(args.root), password, secret, args.shell)
    print(f"arm-on-zynq workbench: {wb.root} on http://{args.host}:{args.port}", flush=True)
    web.run_app(wb.app(), host=args.host, port=args.port, print=None)


if __name__ == "__main__":
    main()
