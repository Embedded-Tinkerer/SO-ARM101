#!/usr/bin/env python3
"""Download the editor and terminal libraries into app/workbench/vendor/.

The workbench serves them itself so it works on a LAN without internet and
does not depend on a CDN. The Docker image runs this at build time; on a
laptop, run it once:  python app/workbench/vendor.py
"""
import io
import os
import shutil
import ssl
import sys
import tarfile
import urllib.request
from pathlib import Path

VENDOR = Path(os.environ.get("WORKBENCH_VENDOR", Path(__file__).resolve().parent / "vendor"))
PACKAGES = {
    # npm package, version, files or folders to keep (relative to the package root)
    "monaco-editor": ("0.52.2", ["min/vs", "LICENSE"]),
    "@xterm/xterm": ("5.5.0", ["lib/xterm.js", "css/xterm.css", "LICENSE"]),
    "@xterm/addon-fit": ("0.10.0", ["lib/addon-fit.js", "LICENSE"]),
}


def fetch(name: str, version: str) -> bytes:
    base = name.split("/")[-1]
    url = f"https://registry.npmjs.org/{name}/-/{base}-{version}.tgz"
    print(f"  {url}")
    with urllib.request.urlopen(url, context=ssl.create_default_context(), timeout=120) as r:
        return r.read()


def main() -> None:
    for name, (version, keep) in PACKAGES.items():
        dest = VENDOR / name.replace("@", "").replace("/", "-")
        if (dest / ".version").exists() and (dest / ".version").read_text() == version:
            print(f"{name}@{version} already present")
            continue
        print(f"{name}@{version}")
        if dest.exists():
            shutil.rmtree(dest)
        with tarfile.open(fileobj=io.BytesIO(fetch(name, version)), mode="r:gz") as tar:
            for m in tar.getmembers():
                rel = m.name.split("/", 1)[1] if "/" in m.name else ""
                if not any(rel == k or rel.startswith(k + "/") for k in keep) or not m.isfile():
                    continue
                out = dest / rel
                out.parent.mkdir(parents=True, exist_ok=True)
                with tar.extractfile(m) as src, open(out, "wb") as f:
                    shutil.copyfileobj(src, f)
        (dest / ".version").write_text(version)
    print(f"vendor libraries in {VENDOR}")


if __name__ == "__main__":
    try:
        main()
    except OSError as e:
        sys.exit(f"download failed: {e}")
