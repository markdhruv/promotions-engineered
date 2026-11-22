"""Build the two distributable copies of the dashboard from app/.

    python tools/build.py [artifact_out_dir]

1. Copies app/ into the plugin, so a Claude Code plugin install carries the
   dashboard with it:  plugins/promotions-engineered/skills/promotions-engineered/assets/app/
2. Writes a body-only page for publishing as a Claude artifact. Claude wraps
   artifact pages in its own <html>/<head>/<body>, so the artifact copy keeps
   only the title, links and styles (between the BUILD markers) plus the body.
   It goes to artifact_out_dir (default: dist/artifact/) and into the plugin
   as assets/app/artifact.html.

Run it after any change to app/.
"""
import io
import os
import re
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(ROOT, "app")
PLUGIN_APP = os.path.join(ROOT, "plugins", "promotions-engineered", "skills", "promotions-engineered", "assets", "app")
SCRIPTS = ["engine.js", "presets.js", "app.js"]


def artifact_page(html):
    head = re.search(r"<!-- BUILD:KEEP -->(.*?)<!-- BUILD:END -->", html, re.S)
    body = re.search(r"<body>(.*?)</body>", html, re.S)
    if not head or not body:
        raise SystemExit("app/index.html is missing the BUILD markers or <body>")
    return head.group(1).strip() + "\n" + body.group(1).strip() + "\n"


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "dist", "artifact")
    html = io.open(os.path.join(APP, "index.html"), encoding="utf-8").read()
    page = artifact_page(html)

    for target in (out, PLUGIN_APP):
        os.makedirs(target, exist_ok=True)
        for name in SCRIPTS:
            shutil.copyfile(os.path.join(APP, name), os.path.join(target, name))

    io.open(os.path.join(out, "index.html"), "w", encoding="utf-8").write(page)
    shutil.copyfile(os.path.join(APP, "index.html"), os.path.join(PLUGIN_APP, "index.html"))
    io.open(os.path.join(PLUGIN_APP, "artifact.html"), "w", encoding="utf-8").write(page)
    print("artifact page:", out)
    print("plugin copy:  ", PLUGIN_APP)


if __name__ == "__main__":
    main()
