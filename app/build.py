#!/usr/bin/env python3
"""Build app/index.html, a single self-contained page, from the study plan.

The plan markdown stays the source of truth: edit captone.md,
then run `python app/build.py` and open app/index.html in a browser.
"""
import argparse
import json
from pathlib import Path

APP = Path(__file__).resolve().parent
ROOT = APP.parent
PLAN = ROOT / "captone.md"


def script_safe(text: str) -> str:
    # Keep "</script>" inside inlined code from closing the tag early.
    return text.replace("</script", "<\\/script").replace("<!--", "<\\!--")


def build_fragment() -> str:
    shell = (APP / "src" / "shell.html").read_text(encoding="utf-8")
    parts = {
        "/*STYLE*/": (APP / "src" / "style.css").read_text(encoding="utf-8"),
        "/*MARKED*/": script_safe((APP / "vendor" / "marked.min.js").read_text(encoding="utf-8")),
        "/*PLAN*/": script_safe(json.dumps(PLAN.read_text(encoding="utf-8"), ensure_ascii=False)),
        "/*APP*/": script_safe((APP / "src" / "app.js").read_text(encoding="utf-8")),
    }
    for marker, value in parts.items():
        shell = shell.replace(marker, value, 1)
    return shell


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("-o", "--out", default=str(APP / "index.html"), help="output page")
    ap.add_argument("--fragment", action="store_true", help="omit the <html>/<head>/<body> skeleton")
    args = ap.parse_args()
    body = build_fragment()
    if not args.fragment:
        body = (
            '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            "</head>\n<body>\n" + body + "\n</body>\n</html>\n"
        )
    Path(args.out).write_text(body, encoding="utf-8")
    print(f"wrote {args.out} ({len(body) // 1024} KB)")


if __name__ == "__main__":
    main()
