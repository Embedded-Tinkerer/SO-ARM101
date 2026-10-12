/* Workbench layer for the study app: file tree, Monaco editor, terminal, and
 * links from the plan into the repo. Loaded after app.js by app/workbench/server.py. */
(function () {
  "use strict";
  const HOST = window.AOZ_HOST;
  if (!HOST) return;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const PREF = "arm-on-zynq:wb";
  let pref = {};
  try { pref = JSON.parse(localStorage.getItem(PREF) || "{}"); } catch (e) { /* storage unavailable */ }
  const savePref = () => { try { localStorage.setItem(PREF, JSON.stringify(pref)); } catch (e) { /* storage unavailable */ } };

  async function api(path, opts = {}) {
    const res = await fetch(path, Object.assign({ headers: { "Content-Type": "application/json", "X-Workbench": "1" } }, opts));
    if (res.status === 401) { location.href = "/login"; throw new Error("logged out"); }
    if (!res.ok) { const t = await res.text(); const e = new Error(t || res.statusText); e.status = res.status; throw e; }
    return res.headers.get("Content-Type")?.includes("json") ? res.json() : res.text();
  }
  function toast(msg) {
    const el = document.createElement("div"); el.className = "toast"; el.textContent = msg; el.setAttribute("role", "status");
    document.body.appendChild(el); setTimeout(() => el.remove(), 2200);
  }

  /* ------------------------------------------------------------ layout */
  const shell = $(".shell");
  const rail = $("#rail");
  const left = document.createElement("div");
  left.className = "leftcol";
  left.innerHTML = `<div class="lefttabs" role="tablist">
      <button type="button" role="tab" data-tab="plan">Plan</button>
      <button type="button" role="tab" data-tab="files">Files</button></div>
    <div class="files" id="files" hidden>
      <div class="files-bar"><span id="files-root"></span>
        <button type="button" class="mini" id="new-file" title="New file">+ File</button>
        <button type="button" class="mini" id="refresh-files" title="Refresh">↻</button></div>
      <div class="tree" id="tree"></div></div>`;
  shell.insertBefore(left, rail);
  left.insertBefore(rail, $("#files"));

  const pane = document.createElement("aside");
  pane.className = "wb"; pane.id = "wb"; pane.setAttribute("aria-label", "Code");
  pane.innerHTML = `<div class="wb-vdrag" title="Drag to resize"></div>
    <div class="wb-tabs" id="wb-tabs"></div>
    <div class="wb-editor" id="wb-editor"><div class="wb-empty" id="wb-empty">
      <p><b>No file open.</b></p><p>Open one from <b>Files</b> on the left, or click a path like <code>docs/toolchain.md</code> in the plan.</p>
      <p><kbd>Ctrl</kbd> <kbd>S</kbd> saves. Shell blocks in the plan have a <b>To terminal</b> button that pastes them below; press Enter to run.</p></div>
      <div class="wb-monaco" id="wb-monaco"></div><div class="wb-image" id="wb-image" hidden></div></div>
    <div class="wb-hdrag" title="Drag to resize"></div>
    <div class="wb-term-head"><span>Terminal</span><span class="wb-term-state" id="term-state"></span>
      <button type="button" class="mini" id="term-restart">Restart</button>
      <button type="button" class="mini" id="term-toggle" aria-expanded="true">Hide</button></div>
    <div class="wb-term" id="wb-term"></div>`;
  shell.appendChild(pane);

  // top bar: git status, show/hide code, log out
  const top = $(".top");
  const extra = document.createElement("div");
  extra.className = "wb-top";
  extra.innerHTML = `<span class="chip git" id="git-chip" title="git status">git …</span>
    <button class="icon-btn" id="code-toggle" type="button" aria-pressed="true">Code</button>
    ${HOST.auth ? '<a class="icon-btn" href="/logout">Log out</a>' : ""}`;
  top.appendChild(extra);

  function setWidth(px) {
    const w = Math.max(320, Math.min(px, window.innerWidth - 420));
    document.documentElement.style.setProperty("--wb-w", w + "px");
    pref.w = w; savePref(); fitAll();
  }
  function setTermHeight(px) {
    const h = Math.max(90, Math.min(px, pane.clientHeight - 140));
    document.documentElement.style.setProperty("--term-h", h + "px");
    pref.th = h; savePref(); fitAll();
  }
  if (pref.w) document.documentElement.style.setProperty("--wb-w", pref.w + "px");
  if (pref.th) document.documentElement.style.setProperty("--term-h", pref.th + "px");
  function showPane(on) {
    document.body.classList.toggle("wb-hidden", !on);
    $("#code-toggle").setAttribute("aria-pressed", String(on));
    pref.hidden = !on; savePref(); setTimeout(fitAll, 50);
  }
  showPane(!pref.hidden && window.innerWidth > 900);
  $("#code-toggle").addEventListener("click", () => showPane(document.body.classList.contains("wb-hidden")));

  function drag(handle, onMove) {
    handle.addEventListener("pointerdown", (e) => {
      e.preventDefault(); handle.setPointerCapture(e.pointerId); document.body.classList.add("dragging");
      const move = (ev) => onMove(ev);
      const up = () => { handle.removeEventListener("pointermove", move); handle.removeEventListener("pointerup", up); document.body.classList.remove("dragging"); };
      handle.addEventListener("pointermove", move); handle.addEventListener("pointerup", up);
    });
  }
  drag($(".wb-vdrag", pane), (e) => setWidth(window.innerWidth - e.clientX));
  drag($(".wb-hdrag", pane), (e) => setTermHeight(pane.getBoundingClientRect().bottom - e.clientY));

  function setTab(t) {
    $$(".lefttabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === t)));
    rail.hidden = t !== "plan"; $("#files").hidden = t !== "files";
    pref.tab = t; savePref();
    if (t === "files" && !treeLoaded) loadTree();
  }
  $$(".lefttabs button").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));
  setTab(pref.tab === "files" ? "files" : "plan");

  /* ------------------------------------------------------------ file tree */
  let entries = [];
  let treeLoaded = false;
  const openDirs = new Set(pref.dirs || ["docs", "ramp"]);
  async function loadTree() {
    try {
      const t = await api("/api/tree");
      entries = t.entries; treeLoaded = true;
      $("#files-root").textContent = t.root;
      renderTree();
    } catch (e) { $("#tree").innerHTML = `<p class="hint">Could not list files: ${esc(e.message)}</p>`; }
  }
  function renderTree() {
    const kids = {};
    for (const e of entries) {
      const parent = e.path.includes("/") ? e.path.slice(0, e.path.lastIndexOf("/")) : "";
      (kids[parent] = kids[parent] || []).push(e);
    }
    const sortE = (a, b) => (b.dir - a.dir) || a.path.localeCompare(b.path);
    const html = (dir, depth) => (kids[dir] || []).sort(sortE).map((e) => {
      const name = e.path.split("/").pop();
      const pad = `style="padding-left:${8 + depth * 14}px"`;
      if (e.dir) {
        const open = openDirs.has(e.path);
        return `<button type="button" class="node dir${open ? " open" : ""}" data-dir="${esc(e.path)}" ${pad}><span class="caret">${open ? "▾" : "▸"}</span>${esc(name)}</button>${open ? html(e.path, depth + 1) : ""}`;
      }
      return `<button type="button" class="node file${files.has(e.path) && e.path === current ? " active" : ""}" data-file="${esc(e.path)}" ${pad}><span class="caret"></span>${esc(name)}</button>`;
    }).join("");
    $("#tree").innerHTML = html("", 0) || '<p class="hint">Empty repository.</p>';
  }
  $("#tree").addEventListener("click", (e) => {
    const b = e.target.closest("button.node"); if (!b) return;
    if (b.dataset.dir) { const d = b.dataset.dir; openDirs.has(d) ? openDirs.delete(d) : openDirs.add(d); pref.dirs = [...openDirs]; savePref(); renderTree(); }
    else openFile(b.dataset.file);
  });
  $("#refresh-files").addEventListener("click", loadTree);
  $("#new-file").addEventListener("click", () => {
    const base = current && current.includes("/") ? current.slice(0, current.lastIndexOf("/") + 1) : "";
    const p = window.prompt("New file path, relative to the repo:", base);
    if (p && p.trim()) openFile(p.trim().replace(/^\/+/, ""), { create: true });
  });
  function revealDir(dir) {
    dir = dir.replace(/\/+$/, "");
    const parts = dir.split("/");
    for (let i = 1; i <= parts.length; i++) openDirs.add(parts.slice(0, i).join("/"));
    pref.dirs = [...openDirs]; savePref();
    setTab("files"); if (treeLoaded) renderTree();
    if (window.innerWidth <= 900) document.body.classList.add("rail-open");
  }

  /* ------------------------------------------------------------ editor */
  const files = new Map(); // path -> {model, mtime, saved, view, kind}
  let current = null;
  let editor = null;
  let monacoReady = null;
  const LANG = { py: "python", v: "verilog", vh: "verilog", sv: "systemverilog", svh: "systemverilog", tcl: "tcl", xdc: "tcl",
    md: "markdown", json: "json", c: "c", h: "c", cpp: "cpp", hpp: "cpp", sh: "shell", bash: "shell", yml: "yaml", yaml: "yaml",
    toml: "ini", ini: "ini", cfg: "ini", html: "html", css: "css", js: "javascript", mk: "makefile", makefile: "makefile", csv: "plaintext", txt: "plaintext" };
  const langOf = (p) => { const n = p.split("/").pop().toLowerCase(); if (n === "makefile") return "makefile"; return LANG[n.split(".").pop()] || "plaintext"; };
  const isImage = (p) => /\.(png|jpe?g|gif|svg|webp)$/i.test(p);
  const isDark = () => {
    const t = document.documentElement.getAttribute("data-theme");
    return t ? t === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  };

  function loadMonaco() {
    if (monacoReady) return monacoReady;
    monacoReady = new Promise((resolve, reject) => {
      if (!window.require) { reject(new Error("editor library did not load (check internet access)")); return; }
      const vs = new URL(HOST.cdn.monaco, location.href).href, base = vs.replace(/\/vs$/, "");
      const sameOrigin = vs.startsWith(location.origin);
      window.MonacoEnvironment = {
        getWorkerUrl: () => sameOrigin ? `${vs}/base/worker/workerMain.js` : "data:text/javascript;charset=utf-8," + encodeURIComponent(
          `self.MonacoEnvironment={baseUrl:'${base}/'};importScripts('${vs}/base/worker/workerMain.js');`),
      };
      window.require.config({ paths: { vs } });
      window.require(["vs/editor/editor.main"], () => {
        editor = monaco.editor.create($("#wb-monaco"), {
          automaticLayout: true, fontFamily: '"IBM Plex Mono", ui-monospace, monospace', fontSize: 13.5,
          minimap: { enabled: false }, scrollBeyondLastLine: false, theme: isDark() ? "vs-dark" : "vs",
          renderWhitespace: "selection", tabSize: 4, insertSpaces: true,
        });
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveCurrent());
        editor.onDidChangeModelContent(() => renderTabs());
        new MutationObserver(() => monaco.editor.setTheme(isDark() ? "vs-dark" : "vs")).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => monaco.editor.setTheme(isDark() ? "vs-dark" : "vs"));
        resolve();
      }, reject);
    });
    return monacoReady;
  }

  const dirty = (f) => f.model && f.model.getAlternativeVersionId() !== f.saved;
  function renderTabs() {
    $("#wb-tabs").innerHTML = [...files.keys()].map((p) => {
      const f = files.get(p);
      return `<div class="wb-tab${p === current ? " active" : ""}${dirty(f) ? " dirty" : ""}" data-path="${esc(p)}" title="${esc(p)}">
        <button type="button" class="wb-tab-name">${esc(p.split("/").pop())}</button>
        <button type="button" class="wb-tab-x" aria-label="Close ${esc(p)}">×</button></div>`;
    }).join("") + (current && files.get(current)?.model ? `<button type="button" class="mini wb-save" id="wb-save">${dirty(files.get(current)) ? "Save" : "Saved"}</button>` : "");
    $("#wb-empty").hidden = !!current;
    if (current) { const s = $("#wb-save"); if (s) s.addEventListener("click", saveCurrent); }
  }
  $("#wb-tabs").addEventListener("click", (e) => {
    const tab = e.target.closest(".wb-tab"); if (!tab) return;
    const p = tab.dataset.path;
    if (e.target.closest(".wb-tab-x")) closeFile(p); else show(p);
  });

  function show(p) {
    const f = files.get(p); if (!f) return;
    if (current && files.get(current)?.model && editor) files.get(current).view = editor.saveViewState();
    current = p;
    const img = $("#wb-image"), mon = $("#wb-monaco");
    if (f.kind === "image") {
      img.hidden = false; mon.style.visibility = "hidden";
      img.innerHTML = `<img alt="${esc(p)}" src="/api/raw?path=${encodeURIComponent(p)}&t=${Date.now()}">`;
    } else if (f.kind === "binary") {
      img.hidden = false; mon.style.visibility = "hidden";
      img.innerHTML = `<p class="hint">${esc(p)} is a binary file (${f.size} bytes). Open it with its own tool.</p>`;
    } else {
      img.hidden = true; mon.style.visibility = "visible";
      editor.setModel(f.model); if (f.view) editor.restoreViewState(f.view); editor.focus();
    }
    renderTabs(); if (treeLoaded) renderTree();
    if (document.body.classList.contains("wb-hidden")) showPane(true);
  }

  async function openFile(p, opts = {}) {
    p = p.replace(/^\.\//, "");
    if (files.has(p)) { show(p); return; }
    if (isImage(p)) { files.set(p, { kind: "image" }); show(p); return; }
    try { await loadMonaco(); } catch (e) { toast("The editor could not load: " + e.message); return; }
    let data = null;
    try { data = await api("/api/file?path=" + encodeURIComponent(p)); }
    catch (e) {
      if (e.status !== 404) { toast(e.message); return; }
      if (!opts.create && !window.confirm(`${p} does not exist yet. Create it?`)) return;
    }
    if (data && data.binary) { files.set(p, { kind: "binary", size: data.size }); show(p); return; }
    const uri = monaco.Uri.parse("file:///" + p);
    const model = monaco.editor.getModel(uri) || monaco.editor.createModel(data ? data.text : "", langOf(p), uri);
    files.set(p, { kind: "text", model, mtime: data ? data.mtime : null, saved: model.getAlternativeVersionId(), isNew: !data });
    show(p);
  }

  function closeFile(p) {
    const f = files.get(p); if (!f) return;
    if (dirty(f) && !window.confirm(`${p} has unsaved changes. Close it anyway?`)) return;
    if (f.model) f.model.dispose();
    files.delete(p);
    if (current === p) {
      current = null;
      const next = [...files.keys()].pop();
      if (next) show(next); else { if (editor) editor.setModel(null); $("#wb-image").hidden = true; renderTabs(); }
    } else renderTabs();
  }

  async function saveCurrent(force) {
    const p = current, f = files.get(p);
    if (!f || !f.model) return;
    try {
      const r = await api("/api/file", { method: "PUT", body: JSON.stringify({ path: p, text: f.model.getValue(), mtime: f.mtime, force: !!force }) });
      f.mtime = r.mtime; f.saved = f.model.getAlternativeVersionId();
      const created = f.isNew; f.isNew = false;
      renderTabs(); toast(created ? `Created ${p}` : `Saved ${p}`);
      refreshGit(); if (created || treeLoaded) loadTree(); markPaths(document);
    } catch (e) {
      if (e.status === 409) { if (window.confirm(`${p} changed on disk since you opened it. Overwrite it with your version?`)) saveCurrent(true); }
      else toast("Not saved: " + e.message);
    }
  }
  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && current) { e.preventDefault(); saveCurrent(); }
  });
  window.addEventListener("beforeunload", (e) => { if ([...files.values()].some(dirty)) { e.preventDefault(); e.returnValue = ""; } });

  /* ------------------------------------------------------------ terminal */
  let term = null, fit = null, sock = null;
  function termTheme() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue(n).trim();
    return { background: v("--code-bg"), foreground: v("--ink"), cursor: v("--accent"), selectionBackground: v("--accent-soft") };
  }
  function startTerm() {
    if (!window.Terminal) { $("#term-state").textContent = "terminal library did not load"; return; }
    if (!term) {
      term = new window.Terminal({ fontFamily: '"IBM Plex Mono", ui-monospace, monospace', fontSize: 13, cursorBlink: true, theme: termTheme(), scrollback: 5000 });
      fit = new window.FitAddon.FitAddon(); term.loadAddon(fit);
      term.open($("#wb-term"));
      term.onData((d) => { if (sock && sock.readyState === 1) sock.send(JSON.stringify({ t: "i", d })); });
      term.onResize(({ cols, rows }) => { if (sock && sock.readyState === 1) sock.send(JSON.stringify({ t: "r", cols, rows })); });
      new ResizeObserver(() => fitAll()).observe($("#wb-term"));
      new MutationObserver(() => { term.options.theme = termTheme(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    }
    connect();
  }
  function connect() {
    if (sock && sock.readyState <= 1) return;
    sock = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/api/term");
    $("#term-state").textContent = "connecting…";
    sock.onopen = () => { $("#term-state").textContent = ""; fitAll(); if (term) sock.send(JSON.stringify({ t: "r", cols: term.cols, rows: term.rows })); flushPending(); };
    sock.onmessage = (e) => term.write(e.data);
    sock.onclose = () => { $("#term-state").textContent = "disconnected"; term.write("\r\n\x1b[2m[shell ended: press Restart or type to reconnect]\x1b[0m\r\n"); };
  }
  // Commands are pasted, not executed: review them, then press Enter.
  let pending = [];
  function flushPending() { while (pending.length && sock && sock.readyState === 1) term.paste(pending.shift()); }
  function sendToTerm(text) {
    if (document.body.classList.contains("wb-hidden")) showPane(true);
    if (document.body.classList.contains("term-hidden")) toggleTerm(true);
    startTerm();
    pending.push(text);
    flushPending(); term && term.focus();
  }
  function toggleTerm(on) {
    document.body.classList.toggle("term-hidden", !on);
    $("#term-toggle").textContent = on ? "Hide" : "Show"; $("#term-toggle").setAttribute("aria-expanded", String(on));
    pref.termHidden = !on; savePref(); setTimeout(fitAll, 50);
  }
  $("#term-toggle").addEventListener("click", () => toggleTerm(document.body.classList.contains("term-hidden")));
  $("#term-restart").addEventListener("click", () => { if (sock) { sock.onclose = null; sock.close(); } if (term) term.reset(); sock = null; startTerm(); });
  $("#wb-term").addEventListener("keydown", () => { if (!sock || sock.readyState > 1) connect(); }, true);
  function fitAll() { try { if (fit && !document.body.classList.contains("term-hidden")) fit.fit(); } catch (e) { /* not visible */ } }
  window.addEventListener("resize", fitAll);
  toggleTerm(!pref.termHidden);

  /* ------------------------------------------------------------ plan → repo links */
  const PATH_RE = /^(?:docs|hw|overlay|ramp|rtl|sw|test|app|\.study)(?:\/[\w.\-]+)*\/?$|^(?:requirements\.txt|README\.md|captone\.md|\.gitignore)$/;
  const FILE_RE = /^[\w.\-]+\.(?:py|md|v|sv|svh|tcl|xdc|c|h|json|csv|txt|ipynb|sh|toml|ya?ml|cfg|hwh)$/;
  const SHELL_LANGS = new Set(["bash", "sh", "shell", "console", "zsh"]);

  function uniqueByName(name) {
    const hits = entries.filter((e) => !e.dir && e.path.split("/").pop() === name);
    return hits.length === 1 ? hits[0].path : null;
  }
  function linkPaths(root) {
    $$("code", root).forEach((c) => {
      if (c.closest("pre") || c.closest("a") || c.dataset.wb) return;
      const t = c.textContent.trim();
      let path = null;
      if (PATH_RE.test(t)) path = t;
      else if (FILE_RE.test(t)) path = uniqueByName(t);
      if (!path) return;
      c.dataset.wb = path; c.classList.add("repo-path"); c.tabIndex = 0; c.setAttribute("role", "link");
      c.title = path.endsWith("/") ? `Show ${path} in Files` : `Open ${path}`;
    });
  }
  async function markPaths(root) {
    const els = $$("code.repo-path", root);
    if (!els.length) return;
    try {
      const res = await api("/api/exists", { method: "POST", body: JSON.stringify({ paths: [...new Set(els.map((e) => e.dataset.wb))] }) });
      els.forEach((e) => {
        const st = res[e.dataset.wb];
        e.classList.toggle("exists", !!st); e.classList.toggle("missing", !st);
        const li = e.closest("li.task");
        if (li && !li.querySelector(".exists-badge")) {
          const b = document.createElement("span"); b.className = "exists-badge"; li.appendChild(b);
        }
      });
      $$("li.task", root).forEach((li) => {
        const codes = $$("code.repo-path", li); const b = li.querySelector(".exists-badge"); if (!b || !codes.length) return;
        const all = codes.every((c) => c.classList.contains("exists"));
        b.textContent = all ? "in repo" : "not in repo yet"; b.classList.toggle("ok", all);
      });
    } catch (e) { /* offline: leave links unmarked */ }
  }
  document.addEventListener("click", (e) => {
    const c = e.target.closest("code.repo-path"); if (!c) return;
    e.preventDefault();
    const p = c.dataset.wb;
    if (p.endsWith("/") || c.classList.contains("exists") && entries.some((x) => x.dir && x.path === p.replace(/\/$/, ""))) revealDir(p);
    else openFile(p);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches && e.target.matches("code.repo-path")) e.target.click(); });

  function addRunButtons(root) {
    $$("pre > code", root).forEach((code) => {
      const pre = code.parentElement;
      if (pre.dataset.wbRun) return;
      const lang = (code.className.match(/language-(\w+)/) || [])[1];
      if (!SHELL_LANGS.has(lang)) return;
      pre.dataset.wbRun = "1";
      const b = document.createElement("button"); b.type = "button"; b.className = "copy run"; b.textContent = "To terminal";
      b.title = "Paste into the terminal; press Enter there to run it";
      b.addEventListener("click", () => {
        const text = code.textContent.split("\n").map((l) => l.replace(/^\$\s+/, "")).join("\n").trim();
        sendToTerm(text);
      });
      pre.appendChild(b);
    });
  }

  HOST.enhance = (root) => { linkPaths(root); addRunButtons(root); markPaths(root); };

  /* ------------------------------------------------------------ git chip */
  async function refreshGit() {
    try {
      const g = await api("/api/git");
      const chip = $("#git-chip");
      chip.textContent = g.branch ? `${g.branch}${g.changed ? " · " + g.changed + " changed" : ""}` : "not a git repo";
      chip.title = g.files.length ? g.files.slice(0, 30).join("\n") : "Working tree clean";
      chip.classList.toggle("now", !!g.changed);
    } catch (e) { /* keep last value */ }
  }
  setInterval(refreshGit, 15000);

  /* ------------------------------------------------------------ boot */
  (async () => {
    refreshGit();
    await loadTree();
    // app.js rendered the first page before this file loaded; render again so the hooks apply.
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    if (!document.body.classList.contains("wb-hidden") && !pref.termHidden) startTerm();
    (pref.open || []).forEach((p) => openFile(p));
  })();
  window.addEventListener("beforeunload", () => { pref.open = [...files.keys()].filter((p) => !files.get(p).isNew); savePref(); });
})();
