# Study app

A single-page app that turns `captone.md` into something you can work through one session at a time.

Open `app/index.html` in any browser. It works offline from the file system; no server or install needed.

What it does:

- **Today** shows the current calendar week, the next session to do, weeks that are past their dates and still open, and the next gate.
- Every week is broken into its sessions (S1–S5/S6) plus a **Wrap** page with the measurement table, deliverables checklist, failure modes and a pre-filled Sunday log.
- Numbered steps and `- [ ]` checklists are tickable. Mark a session complete when its *Done when* is true.
- Search the whole plan with `/`; move between sessions with ← and →.
- Progress and scratch notes are kept in the browser's local storage. Use **Back up or reset progress** to copy them into the repo (for example `docs/study-progress.json`) or move them to another machine.

## Editing the plan

`captone.md` stays the source of truth. After editing it, rebuild the page:

```bash
python app/build.py
```

The app finds weeks and sessions from the headings, so keep the existing shape: `### R1 · Title (12 h)` / `### W05 · Title (14 h)` for weeks, `#### S1 · Title (2 h)` for sessions, and the dates in the Calendar table. Progress is keyed by week and session code (`W5-S3`), so renaming a title keeps your ticks; renumbering steps within a session moves them.

Files:

- `src/app.js`, `src/style.css`, `src/shell.html`: the app
- `vendor/marked.min.js`: markdown parser (marked v12.0.2, MIT)
- `build.py`: inlines everything into `index.html`

## Workbench

`app/workbench/` serves this same app with a code editor, terminal and file tree beside the plan, and saves progress to `.study/progress.json` in the repo. It runs in Docker on a server (Unraid) or directly on the laptop. See [workbench/README.md](workbench/README.md).
