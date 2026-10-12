/* arm-on-zynq study app.
 * The plan markdown is the single source of truth: it is parsed at load into
 * phases -> weeks -> sessions, and progress is kept in this browser's localStorage. */
(function () {
  "use strict";

  const MD = window.PLAN_MD || "";
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const plain = (s) => String(s).replace(/\*\*|__|`/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").trim();
  const slug = (s) => plain(s).toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s/g, "-");

  /* ------------------------------------------------------------ storage */
  const KEY = "arm-on-zynq:v1";
  let S = { done: {}, steps: {}, tasks: {}, notes: {}, theme: "" };
  try { const raw = localStorage.getItem(KEY); if (raw) S = Object.assign(S, JSON.parse(raw)); } catch (e) { /* storage unavailable */ }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage unavailable */ } }

  /* ------------------------------------------------------------ parse */
  const lexed = marked.lexer(MD);
  const LINKS = lexed.links || {};
  const withLinks = (toks) => { const a = toks.slice(); a.links = LINKS; return a; };
  const render = (toks) => marked.parser(withLinks(toks));

  function splitBy(tokens, depth) {
    const out = { pre: [], parts: [] };
    let cur = null;
    for (const t of tokens) {
      if (t.type === "heading" && t.depth === depth) { cur = { h: t, tokens: [] }; out.parts.push(cur); }
      else if (t.type === "heading" && t.depth < depth) { (cur ? cur.tokens : out.pre).push(t); }
      else (cur ? cur.tokens : out.pre).push(t);
    }
    return out;
  }
  const trimTail = (toks) => { const a = toks.slice(); while (a.length && (a[a.length - 1].type === "hr" || a[a.length - 1].type === "space")) a.pop(); return a; };
  const toText = (toks) => toks.map((t) => t.raw || "").join(" ").replace(/[#*`>|_-]{1,}/g, " ").replace(/\s+/g, " ");

  const groups = [];       // sidebar groups in plan order
  const routes = {};       // route id -> {type, ...}
  const order = [];        // linear reading order of session-like pages
  const weeks = {};        // week id -> week
  const slugRoute = {};    // heading slug -> route id (for the plan's own anchor links)
  let calendar = [];

  const top = splitBy(lexed, 2);
  const startGroup = { id: "start", title: "Start here", items: [] };
  groups.push(startGroup);
  routes.today = { type: "today", title: "Today" };
  startGroup.items.push({ route: "today", code: "", title: "Today" });

  // Overview: the document's opening (title block) minus the h1.
  const overview = { id: "guide-overview", title: "Overview", tokens: trimTail(top.pre.filter((t) => !(t.type === "heading" && t.depth === 1))) };
  routes[overview.id] = { type: "page", page: overview };
  startGroup.items.push({ route: overview.id, title: "Overview" });

  const refGroup = { id: "reference", title: "Reference", items: [] };

  function parseWeek(headText, tokens, sessDepth, group) {
    let m = plain(headText).match(/^(R\d+|W\d+)\s*·\s*(.+?)(?:\s*\((\d+)\s*h\))?$/);
    let id, code, title, hours;
    if (m) { code = m[1]; id = code[0] === "W" ? "W" + parseInt(code.slice(1), 10) : code; title = m[2]; hours = m[3] ? m[3] + " h" : ""; }
    else { // Week 0: Setup (runs alongside R1–R2)
      const w0 = plain(headText).match(/^Week 0:\s*(.+?)(?:\s*\((.+)\))?$/);
      id = "W0"; code = "W0"; title = w0 ? w0[1] : plain(headText); hours = w0 && w0[2] ? w0[2] : "6–8 h";
    }
    const sp = splitBy(tokens, sessDepth);
    const week = { id, code, title, hours, group, intro: trimTail(sp.pre), sessions: [], wrap: null, heading: headText };
    const wrapToks = [];
    for (const p of sp.parts) {
      const sm = plain(p.h.text).match(/^(S\d+[a-z]?)\s*·\s*(.+?)(?:\s*\(([^)]*)\))?$/);
      if (sm) {
        const s = { id: id + "-" + sm[1], code: sm[1], title: sm[2], hours: sm[3] || "", tokens: trimTail(p.tokens), week };
        week.sessions.push(s);
        slugRoute[slug(p.h.text)] = s.id;
      } else {
        wrapToks.push(Object.assign({}, p.h, { depth: 2 }), ...p.tokens);
      }
    }
    if (wrapToks.length) week.wrap = { id: id + "-wrap", code: "Wrap", title: "Measurements, deliverables and failure modes", tokens: trimTail(wrapToks), week };
    weeks[id] = week;
    routes[id] = { type: "week", week };
    slugRoute[slug(headText)] = id;
    for (const s of week.sessions) { routes[s.id] = { type: "session", week, item: s }; order.push(s); }
    if (week.wrap) { routes[week.wrap.id] = { type: "session", week, item: week.wrap }; order.push(week.wrap); }
    group.items.push({ route: id, code, title, week });
    return week;
  }

  for (const sec of top.parts) {
    const h = plain(sec.h.text);
    if (/^Contents/.test(h)) continue;
    if (/^(How to use|The capstone|Hiwonder kit|Calendar)/.test(h)) {
      const short = { "How to use": "How to use this plan", "The capstone": "The capstone", "Hiwonder kit": "Hiwonder kit notes", "Calendar": "Calendar" };
      const k = Object.keys(short).find((x) => h.startsWith(x));
      const page = { id: "guide-" + slug(k), title: short[k], fullTitle: h, tokens: trimTail(sec.tokens) };
      routes[page.id] = { type: "page", page };
      slugRoute[slug(sec.h.text)] = page.id;
      startGroup.items.push({ route: page.id, title: short[k] });
      if (k === "Calendar") calendar = parseCalendar(sec.tokens);
      continue;
    }
    if (/^Week 0/.test(h)) {
      const g = { id: "phase-w0", title: "Week 0 · Setup", items: [] };
      groups.push(g);
      parseWeek(sec.h.text, sec.tokens, 3, g);
      continue;
    }
    if (/^(Phase \d|Month \d)/.test(h)) {
      const [name, sub] = h.split(/:\s*/);
      const g = { id: "phase-" + slug(name.split("·")[0]), title: name, subtitle: sub || "", items: [], intro: [] };
      const sp = splitBy(sec.tokens, 3);
      g.intro = trimTail(sp.pre);
      groups.push(g);
      routes[g.id] = { type: "phase", group: g };
      slugRoute[slug(sec.h.text)] = g.id;
      for (const p of sp.parts) parseWeek(p.h.text, p.tokens, 4, g);
      continue;
    }
    if (/^Holiday/.test(h)) {
      const g = { id: "phase-holiday", title: "Holiday buffer", items: [] };
      groups.push(g);
      const page = { id: "HOL", title: h.replace(/^Holiday buffer\s*·\s*/, ""), fullTitle: h, tokens: trimTail(sec.tokens) };
      routes.HOL = { type: "page", page, holiday: true };
      slugRoute[slug(sec.h.text)] = "HOL";
      g.items.push({ route: "HOL", code: "—", title: "Rest, absorb slip, read ahead" });
      continue;
    }
    const page = { id: "ref-" + slug(h).slice(0, 40).replace(/-+$/, ""), title: h.replace(/^Appendix ([A-Z]) · /, "$1 · "), fullTitle: h, tokens: trimTail(sec.tokens) };
    routes[page.id] = { type: "page", page };
    slugRoute[slug(sec.h.text)] = page.id;
    refGroup.items.push({ route: page.id, title: page.title });
  }
  routes.progress = { type: "progress", title: "Your progress" };
  refGroup.items.push({ route: "progress", title: "Back up or reset progress" });
  groups.push(refGroup);

  function parseCalendar(tokens) {
    const tbl = tokens.find((t) => t.type === "table");
    if (!tbl) return [];
    const MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
    let year = null, lastMon = -1;
    const rows = [];
    for (const r of tbl.rows) {
      const cell = (i) => plain(r[i] ? r[i].text : "");
      const wk = cell(0), dates = cell(1);
      const m = dates.match(/^(\d+)\s*([A-Za-z]{3})?\s*(\d{4})?\s*[–-]\s*(\d+)\s*([A-Za-z]{3})\s*(\d{4})?/);
      if (!m) continue;
      const mon = MON[(m[2] || m[5]).toLowerCase()];
      if (m[3]) year = +m[3];
      else if (year === null) year = m[6] ? +m[6] : new Date().getFullYear();
      else if (lastMon > mon) year += 1;
      lastMon = mon;
      const start = new Date(year, mon, +m[1]);
      const end = new Date(year, mon, +m[1] + 6, 23, 59, 59);
      const id = /^—|^-/.test(wk) ? "HOL" : wk;
      rows.push({ id, dates, focus: cell(2), gate: cell(3), start, end });
    }
    return rows;
  }
  const calOf = (id) => calendar.find((c) => c.id === id);
  for (const c of calendar) if (weeks[c.id]) { weeks[c.id].cal = c; if (c.gate) weeks[c.id].gate = c.gate; }

  /* ------------------------------------------------------------ progress */
  function weekItems(w) { return w.sessions.concat(w.wrap ? [w.wrap] : []); }
  function weekProgress(w) { const it = weekItems(w); const d = it.filter((x) => S.done[x.id]).length; return { done: d, total: it.length, frac: it.length ? d / it.length : 0 }; }
  function overall() { const d = order.filter((x) => S.done[x.id]).length; return { done: d, total: order.length, frac: order.length ? d / order.length : 0 }; }
  const today = () => (window.AOZ_TODAY ? new Date(window.AOZ_TODAY) : new Date());
  function currentCal() {
    const t = today();
    return calendar.find((c) => t >= c.start && t <= c.end) || null;
  }
  function weekState(w) {
    const p = weekProgress(w);
    if (p.total && p.done === p.total) return "done";
    const c = w.cal; const t = today();
    if (w.id === "W0") { const r2 = calOf("R2"); return r2 && t > r2.end ? "behind" : "open"; }
    if (!c) return "open";
    if (t > c.end) return "behind";
    if (t >= c.start) return "now";
    return "upcoming";
  }
  function nextUp() {
    const c = currentCal();
    if (c && weeks[c.id]) { const n = weekItems(weeks[c.id]).find((x) => !S.done[x.id]); if (n) return n; }
    return order.find((x) => !S.done[x.id]) || null;
  }

  /* ------------------------------------------------------------ UI helpers */
  function ring(frac) {
    const r = 7, C = 2 * Math.PI * r;
    return `<svg class="ring${frac >= 1 ? " full" : ""}" viewBox="0 0 18 18" aria-hidden="true"><circle class="bg" cx="9" cy="9" r="${r}"/><circle class="fg" cx="9" cy="9" r="${r}" stroke-dasharray="${(C * frac).toFixed(2)} ${C.toFixed(2)}"/></svg>`;
  }
  function toast(msg) {
    const el = document.createElement("div"); el.className = "toast"; el.textContent = msg; el.setAttribute("role", "status");
    document.body.appendChild(el); setTimeout(() => el.remove(), 1800);
  }
  async function copyText(text, btn) {
    try { await navigator.clipboard.writeText(text); toast("Copied"); }
    catch (e) {
      const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); toast("Copied"); } catch (e2) { toast("Select the text and copy it manually"); }
      ta.remove();
    }
  }
  const fmtDate = (d) => d.toLocaleDateString(undefined, { day: "numeric", month: "short" });

  /* ------------------------------------------------------------ nav rail */
  function renderNav(active) {
    const activeWeek = routes[active] && routes[active].week ? routes[active].week.id : active;
    const cur = currentCal();
    $("#rail").innerHTML = groups.map((g) => {
      const head = routes[g.id] ? `<a href="#${g.id}">${esc(g.title)}</a>` : esc(g.title);
      const items = g.items.map((it) => {
        const isActive = it.route === activeWeek || it.route === active;
        if (it.week) {
          const p = weekProgress(it.week);
          const now = cur && cur.id === it.week.id;
          return `<a class="nav-item${isActive ? " active" : ""}${now ? " now" : ""}" href="#${it.route}" title="${esc(it.title)}">
            <span class="code">${esc(it.code)}</span><span class="t">${esc(it.title)}</span>
            ${it.week.gate ? `<span class="gate-dot" title="${esc(it.week.gate)}">G${esc(it.week.gate.replace(/\D/g, ""))}</span>` : ring(p.frac)}</a>`;
        }
        if (it.code) return `<a class="nav-item${isActive ? " active" : ""}" href="#${it.route}"><span class="code">${esc(it.code)}</span><span class="t">${esc(it.title)}</span><span></span></a>`;
        return `<a class="nav-item nav-plain${isActive ? " active" : ""}" href="#${it.route}"><span class="t">${esc(it.title)}</span></a>`;
      }).join("");
      return `<h4>${head}</h4>${items}`;
    }).join("");
    const o = overall();
    $("#overall").innerHTML = `<span class="meter"><i style="width:${(o.frac * 100).toFixed(1)}%"></i></span><span>${o.done}/${o.total}</span><span class="lbl">sessions</span>`;
  }

  /* ------------------------------------------------------------ enhance rendered markdown */
  function enhance(root, key, withSteps) {
    $$("table", root).forEach((t) => { const w = document.createElement("div"); w.className = "table-wrap"; t.replaceWith(w); w.appendChild(t); });
    $$("pre", root).forEach((pre) => {
      const b = document.createElement("button"); b.className = "copy"; b.type = "button"; b.textContent = "Copy";
      b.addEventListener("click", () => copyText(pre.innerText.replace(/\nCopy$/, ""), b));
      pre.appendChild(b);
    });
    $$("a[href]", root).forEach((a) => {
      const href = a.getAttribute("href");
      if (href.startsWith("#")) { const r = slugRoute[href.slice(1)]; if (r) a.setAttribute("href", "#" + r); }
      else { a.target = "_blank"; a.rel = "noopener"; }
    });
    // "Done when:" paragraphs become a callout
    $$("p", root).forEach((p) => {
      const f = p.firstElementChild;
      if (f && f.tagName === "STRONG" && /^Done when/i.test(f.textContent) && p.firstChild === f) {
        f.remove(); p.innerHTML = p.innerHTML.replace(/^\s*:?\s*/, "");
        const box = document.createElement("div"); box.className = "done-when";
        box.innerHTML = `<span class="lbl">Done when</span>`; p.replaceWith(box); box.appendChild(p);
      }
    });
    if (!key) return;
    // GitHub task lists (- [ ]) become live checkboxes
    $$("li > input[type=checkbox]:not(.step-box)", root).forEach((cb, i) => {
      const li = cb.parentElement; const k = `${key}#t${i}`;
      cb.disabled = false; cb.id = "cb-" + k.replace(/[^\w-]/g, "_"); cb.checked = !!S.tasks[k];
      li.classList.add("task"); li.classList.toggle("checked", cb.checked);
      cb.addEventListener("change", () => { S.tasks[k] = cb.checked || undefined; li.classList.toggle("checked", cb.checked); save(); });
      // put the text in a span so the flex row wraps nicely
      const span = document.createElement("span"); while (cb.nextSibling) span.appendChild(cb.nextSibling); li.appendChild(span);
    });
    // Numbered steps (top-level ordered lists) become a checklist
    if (withSteps) $$(":scope > ol", root).forEach((ol, oi) => {
      ol.classList.add("steps");
      const start = parseInt(ol.getAttribute("start") || "1", 10);
      if (start !== 1) ol.style.counterReset = `step ${start - 1}`;
      Array.from(ol.children).forEach((li, i) => {
        const k = `${key}#${oi}.${i}`;
        const cb = document.createElement("input"); cb.type = "checkbox"; cb.className = "step-box"; cb.id = "cb-" + k.replace(/[^\w-]/g, "_");
        cb.setAttribute("aria-label", `Step ${start + i} done`);
        cb.checked = !!S.steps[k]; li.classList.toggle("checked", cb.checked);
        cb.addEventListener("change", () => { S.steps[k] = cb.checked || undefined; li.classList.toggle("checked", cb.checked); save(); updateFinish(); });
        li.prepend(cb);
      });
    });
  }

  let updateFinish = () => {};

  /* ------------------------------------------------------------ views */
  function crumbs(parts) { return `<nav class="crumbs" aria-label="Breadcrumb">${parts.map((p) => p[1] ? `<a href="#${p[1]}">${esc(p[0])}</a>` : `<span>${esc(p[0])}</span>`).join("<span>/</span>")}</nav>`; }
  function weekChips(w) {
    const c = [];
    if (w.cal) c.push(`<span class="chip">${esc(w.cal.dates)}</span>`);
    if (w.hours) c.push(`<span class="chip">${esc(w.hours)}</span>`);
    if (w.gate) c.push(`<span class="chip gate">${esc(w.gate)}</span>`);
    const st = weekState(w);
    if (st === "now") c.push(`<span class="chip now">This week</span>`);
    if (st === "behind") c.push(`<span class="chip warn">Past its dates</span>`);
    if (st === "done") c.push(`<span class="chip ok">Complete</span>`);
    return `<div class="chips">${c.join("")}</div>`;
  }

  function viewToday() {
    const c = currentCal(); const n = nextUp(); const o = overall();
    const t = today();
    let lead;
    if (c) {
      const w = weeks[c.id];
      lead = `<span class="eyebrow">${esc(t.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }))}</span>
        <h1 class="page-title">${c.id === "HOL" ? "Holiday buffer" : `<span class="code">${esc(c.id)}</span>${esc(w ? w.title : c.focus)}`}</h1>
        ${w ? weekChips(w) : `<div class="chips"><span class="chip">${esc(c.dates)}</span></div>`}`;
    } else if (calendar.length && t < calendar[0].start) {
      const days = Math.ceil((calendar[0].start - t) / 864e5);
      lead = `<span class="eyebrow">Before the clock starts</span><h1 class="page-title">${days} day${days === 1 ? "" : "s"} until R1</h1>`;
    } else {
      lead = `<span class="eyebrow">Past the last calendar week</span><h1 class="page-title">The plan's dates are behind you</h1>`;
    }
    const nextCard = n ? `<div class="next-card">
        <span class="eyebrow">${S.done[order[0].id] || order.indexOf(n) > 0 ? "Next up" : "Start here"}</span>
        <h2><span class="code">${esc(n.week.code)} ${esc(n.code)}</span>${esc(n.title)}</h2>
        <p>${esc(n.week.title)}${n.hours ? " · " + esc(n.hours) : ""}</p>
        <div class="row"><a class="btn primary" href="#${n.id}">${Object.keys(S.steps).some((k) => k.startsWith(n.id + "#") && S.steps[k]) ? "Continue session" : "Open session"}</a>
        <a class="btn" href="#${n.week.id}">Week overview</a></div></div>`
      : `<div class="next-card"><span class="eyebrow">All sessions complete</span><h2>Every session in the plan is ticked off.</h2><p>Gate 4 is the last word: walk someone through the design package.</p></div>`;

    const behind = Object.values(weeks).filter((w) => weekState(w) === "behind");
    const behindBox = behind.length ? `<div class="callout warn"><h3>Open from earlier weeks</h3><p>${behind.map((w) => { const p = weekProgress(w); return `<a href="#${w.id}">${esc(w.code)}</a> (${p.done}/${p.total})`; }).join(", ")}. The plan says to roll unfinished work into the Saturday block rather than start the next session, and to take extra time from the holiday buffer.</p>
      <p style="margin-top:10px"><button class="btn" id="catch-up" type="button">Already done these? Mark them complete</button></p></div>` : "";

    const gatesLeft = Object.values(weeks).filter((w) => w.gate && weekState(w) !== "done");
    const nextGate = gatesLeft[0];
    const stats = `<div class="stats">
      <div class="stat"><b>${Math.round(o.frac * 100)}%</b><span>${o.done} of ${o.total} sessions done</span></div>
      <div class="stat"><b>${Object.values(weeks).filter((w) => weekState(w) === "done").length} / ${Object.keys(weeks).length}</b><span>weeks complete (incl. Week 0)</span></div>
      <div class="stat"><b>${nextGate ? esc(nextGate.gate) : "None"}</b><span>${nextGate ? `next gate, end of ${esc(nextGate.code)}${nextGate.cal ? " (" + fmtDate(nextGate.cal.end) + ")" : ""}` : "all gates passed"}</span></div></div>`;

    const cells = calendar.map((c) => {
      const w = weeks[c.id]; const p = w ? weekProgress(w) : { frac: 0 };
      const st = w ? weekState(w) : (today() >= c.start && today() <= c.end ? "now" : "");
      const cls = ["tl-cell", st, c.id === "HOL" ? "hol" : "", c.gate ? "gate" : ""].join(" ");
      return `<a class="${cls}" href="#${c.id}" title="${esc(c.id)} · ${esc(c.dates)} · ${esc(c.focus)}${c.gate ? " · " + esc(plain(c.gate)) : ""}"><i><b style="height:${(p.frac * 100).toFixed(0)}%"></b></i><span>${c.id === "HOL" ? "hol" : esc(c.id)}</span></a>`;
    }).join("");
    const tl = `<div class="timeline"><div class="section-h">The 20 weeks</div><div class="tl-track" style="--n:${calendar.length}">${cells}</div>
      <div class="tl-legend"><span><i style="background:var(--ok)"></i>Sessions done (fill)</span><span><i style="outline:2px solid var(--accent)"></i>This week</span><span><i style="background:var(--warn-soft)"></i>Past its dates, still open</span><span><i style="background:var(--gate)"></i>Gate week (label)</span></div></div>`;

    const w0 = weeks.W0; const w0p = w0 ? weekProgress(w0) : null;
    const w0box = w0 && w0p.done < w0p.total && !behind.includes(w0) ? `<div class="callout"><h3>Week 0 runs alongside R1 and R2</h3><p>Ordering, installs and the repo skeleton: ${w0p.done} of ${w0p.total} done. <a href="#W0">Open Week 0</a>.</p></div>` : "";

    return `<div class="page"><div class="hero-now">${lead}</div>${nextCard}${behindBox}${w0box}${stats}${tl}
      <p class="hint">Progress is saved in this browser. Tick steps as you go, mark each session complete when its <em>Done when</em> is true. Use <kbd>←</kbd> <kbd>→</kbd> to move between sessions and <kbd>/</kbd> to search. <a href="#progress">Back up your progress</a>.</p></div>`;
  }

  function viewWeek(w) {
    const p = weekProgress(w);
    const n = weekItems(w).find((x) => !S.done[x.id]);
    const rows = weekItems(w).map((s) => `<a class="session-row${S.done[s.id] ? " done" : ""}" href="#${s.id}"><span class="tick">${S.done[s.id] ? "✓" : ""}</span><span class="code">${esc(s.code)}</span><span>${esc(s.title)}</span><span class="h">${esc(s.hours)}</span></a>`).join("");
    const g = w.group;
    return `<div class="page">${crumbs([[g.title, routes[g.id] ? g.id : null], [w.code, null]])}
      <h1 class="page-title"><span class="code">${esc(w.code)}</span>${esc(w.title)}</h1>${weekChips(w)}
      <div class="prose" id="intro"></div>
      ${weekItems(w).length ? `<div class="section-h">Sessions · ${p.done} of ${p.total} done</div><div class="session-list">${rows}</div>
      ${n ? `<a class="btn primary" href="#${n.id}">${p.done ? "Continue with " : "Start with "}${esc(n.code)}</a>` : ""}` : ""}
      ${pagerHtml(w.id)}</div>`;
  }

  function sundayLog(w) {
    const ref = Object.values(routes).find((r) => r.type === "page" && /^ref-appendix-c/.test(r.page.id));
    const code = ref && ref.page.tokens.find((t) => t.type === "code");
    if (!code) return "";
    const txt = code.text.replace("W<nn> · <dates>", `${w.code} · ${w.cal ? w.cal.dates : ""}`).replace("<budget>", w.hours || "12 h");
    return `<div class="section-h">Sunday log</div><p class="hint">The weekly cadence template from Appendix C, filled in for ${esc(w.code)}. Copy it into this week's log in the repo.</p>
      <div class="prose"><pre><code>${esc(txt)}</code></pre></div>`;
  }

  function viewSession(w, s) {
    const items = weekItems(w);
    const bar = items.map((x) => `<a class="${S.done[x.id] ? "done" : ""}${x === s ? " active" : ""}" href="#${x.id}">${esc(x.code)}${x.hours ? ` <small>${esc(x.hours.replace(/ of the.*$/, ""))}</small>` : ""}</a>`).join("");
    const g = w.group;
    const isWrap = s === w.wrap;
    return `<div class="page">${crumbs([[g.title, routes[g.id] ? g.id : null], [w.code + " · " + w.title, w.id]])}
      <div class="stepbar" role="navigation" aria-label="Sessions this week"><a href="#${w.id}">${esc(w.code)}</a>${bar}</div>
      <h1 class="page-title"><span class="code">${esc(s.code)}</span>${esc(isWrap ? "Close the week" : s.title)}</h1>
      <div class="chips">${s.hours ? `<span class="chip">${esc(s.hours)}</span>` : ""}${w.cal ? `<span class="chip">${esc(w.code)} · ${esc(w.cal.dates)}</span>` : ""}${isWrap ? `<span class="chip">${esc(s.title)}</span>` : ""}${isWrap && w.gate ? `<span class="chip gate">${esc(w.gate)}</span>` : ""}</div>
      <div class="prose" id="body"></div>
      ${isWrap ? sundayLog(w) : ""}
      <div class="finish">
        <div><button class="btn" id="complete" type="button"></button> <span class="hint" id="finish-hint"></span></div>
        <div class="notes"><label for="notes-${s.id}">Scratch notes for ${esc(w.code)} ${esc(s.code)} (kept in this browser; the real record goes in the repo)</label>
          <textarea id="notes-${s.id}" placeholder="Commands you actually ran, numbers you measured, what surprised you…">${esc(S.notes[s.id] || "")}</textarea></div>
        ${pagerHtml(s.id)}
        <p class="hint"><kbd>←</kbd> <kbd>→</kbd> previous / next session</p>
      </div></div>`;
  }

  function pagerHtml(id) {
    const r = routes[id];
    let prev, next;
    if (r.type === "week") {
      const f = weekItems(r.week)[0];
      const i = f ? order.indexOf(f) : -1;
      prev = i > 0 ? order[i - 1] : null; next = f || null;
    } else {
      const i = order.indexOf(r.item);
      prev = order[i - 1]; next = order[i + 1];
    }
    const lab = (x) => `${x.week.code} ${x.code}`;
    return `<nav class="pager">${prev ? `<a class="prev" href="#${prev.id}"><small>← ${esc(lab(prev))}</small><span>${esc(prev.title)}</span></a>` : ""}${next ? `<a class="next" href="#${next.id}"><small>${esc(lab(next))} →</small><span>${esc(next.title)}</span></a>` : ""}</nav>`;
  }

  function viewPhase(g) {
    const cards = g.items.filter((i) => i.week).map((i) => {
      const w = i.week; const p = weekProgress(w); const st = weekState(w);
      return `<a class="week-card" href="#${w.id}"><span class="top-row"><span>${esc(w.code)}</span>${w.gate ? `<span class="chip gate">${esc(w.gate)}</span>` : st === "now" ? `<span class="chip now">This week</span>` : ""}</span>
        <span class="t">${esc(w.title)}</span><span class="d">${w.cal ? esc(w.cal.dates) + " · " : ""}${p.done}/${p.total} done</span><span class="bar"><i style="width:${(p.frac * 100).toFixed(0)}%"></i></span></a>`;
    }).join("");
    return `<div class="page"><span class="eyebrow">${esc(g.title)}</span><h1 class="page-title">${esc(g.subtitle || g.title)}</h1>
      <div class="week-grid">${cards}</div><div class="prose" id="intro"></div></div>`;
  }

  function viewPage(page) {
    return `<div class="page"><h1 class="page-title">${esc(page.fullTitle || page.title)}</h1><div class="prose" id="body"></div></div>`;
  }

  function viewProgress() {
    const o = overall();
    return `<div class="page"><h1 class="page-title">Back up or reset progress</h1>
      <p>Your ticks and notes live only in this browser (${o.done} of ${o.total} sessions complete). Copy the backup below into a file in the repo, such as <code>docs/study-progress.json</code>, to move it to another machine or keep it safe.</p>
      <div class="tools">
        <div class="row"><button class="btn primary" id="copy-backup" type="button">Copy backup</button></div>
        <label class="eyebrow" for="restore">Restore from a backup</label>
        <textarea id="restore" placeholder='Paste a backup here ({"done":{…}})'></textarea>
        <div class="row"><button class="btn" id="do-restore" type="button">Restore</button><button class="btn" id="do-reset" type="button">Reset all progress</button></div>
      </div></div>`;
  }

  /* ------------------------------------------------------------ router */
  function go() {
    let id = decodeURIComponent(location.hash.slice(1)) || "today";
    if (!routes[id] && slugRoute[id]) id = slugRoute[id];
    if (!routes[id]) id = "today";
    const r = routes[id];
    const main = $("#main");
    updateFinish = () => {};
    if (r.type === "today") { main.innerHTML = viewToday(); wireToday(); }
    else if (r.type === "week") { main.innerHTML = viewWeek(r.week); const el = $("#intro"); el.innerHTML = render(r.week.intro); enhance(el, null); }
    else if (r.type === "session") {
      main.innerHTML = viewSession(r.week, r.item);
      const el = $("#body"); el.innerHTML = render(r.item.tokens); enhance(el, r.item.id, true);
      // move a trailing "Done when" next to the complete button
      const dw = $$(".done-when", el).pop();
      if (dw && dw === el.lastElementChild) $(".finish").prepend(dw);
      wireSession(r.week, r.item);
    }
    else if (r.type === "phase") { main.innerHTML = viewPhase(r.group); const el = $("#intro"); el.innerHTML = render(r.group.intro); enhance(el, null); }
    else if (r.type === "page") { main.innerHTML = viewPage(r.page); const el = $("#body"); el.innerHTML = render(r.page.tokens); enhance(el, r.page.id); }
    else if (r.type === "progress") { main.innerHTML = viewProgress(); wireProgress(); }
    renderNav(id);
    document.title = (r.item ? `${r.week.code} ${r.item.code} · ` : r.week ? `${r.week.code} · ` : "") + "arm-on-zynq";
    document.body.classList.remove("rail-open");
    window.scrollTo(0, 0);
    const act = $(".nav-item.active"); if (act) act.scrollIntoView({ block: "nearest" });
  }

  function wireSession(w, s) {
    const btn = $("#complete"), hint = $("#finish-hint");
    updateFinish = () => {
      const boxes = $$("#body input.step-box");
      const ticked = boxes.filter((b) => b.checked).length;
      const isWrap = s === w.wrap;
      if (S.done[s.id]) { btn.className = "btn complete"; btn.textContent = isWrap ? "✓ Week closed" : "✓ Session complete"; hint.textContent = "Click to reopen."; }
      else {
        const all = boxes.length && ticked === boxes.length;
        btn.className = "btn" + (all || !boxes.length ? " primary" : "");
        btn.textContent = isWrap ? "Close the week" : "Mark session complete";
        hint.textContent = boxes.length ? `${ticked} of ${boxes.length} steps ticked` : "";
      }
    };
    updateFinish();
    btn.addEventListener("click", () => {
      S.done[s.id] = S.done[s.id] ? undefined : true; save(); updateFinish(); renderNav(s.id);
      $$(".stepbar a").forEach((a) => { if (a.getAttribute("href") === "#" + s.id) a.classList.toggle("done", !!S.done[s.id]); });
      if (S.done[s.id]) {
        const i = order.indexOf(s); const n = order[i + 1];
        toast(n ? `Done. Next: ${n.week.code} ${n.code}` : "Done. That was the last session.");
      }
    });
    const ta = $("textarea", $(".notes"));
    let tmr; ta.addEventListener("input", () => { clearTimeout(tmr); tmr = setTimeout(() => { S.notes[s.id] = ta.value || undefined; save(); }, 300); });
  }

  function wireToday() {
    const b = $("#catch-up"); if (!b) return;
    let armed = false;
    b.addEventListener("click", () => {
      const ws = Object.values(weeks).filter((w) => weekState(w) === "behind");
      if (!armed) { armed = true; b.classList.add("primary"); b.textContent = `Mark ${ws.map((w) => w.code).join(", ")} complete`; return; }
      ws.forEach((w) => weekItems(w).forEach((x) => { S.done[x.id] = true; }));
      save(); toast("Earlier weeks marked complete"); go();
    });
  }

  function wireProgress() {
    $("#copy-backup").addEventListener("click", (e) => copyText(JSON.stringify(S, (k, v) => (v === undefined ? undefined : v), 1), e.target));
    $("#do-restore").addEventListener("click", () => {
      try {
        const v = JSON.parse($("#restore").value);
        if (!v || typeof v !== "object" || !v.done) throw new Error("no done map");
        S = Object.assign({ done: {}, steps: {}, tasks: {}, notes: {} }, v); save(); toast("Progress restored"); go();
      } catch (e) { toast("That is not a backup from this app. Paste the whole copied text."); }
    });
    const reset = $("#do-reset"); let armed = false;
    reset.addEventListener("click", () => {
      if (!armed) { armed = true; reset.textContent = "Click again to erase everything"; reset.classList.add("primary"); setTimeout(() => { armed = false; reset.textContent = "Reset all progress"; reset.classList.remove("primary"); }, 4000); return; }
      S = { done: {}, steps: {}, tasks: {}, notes: {}, theme: S.theme }; save(); toast("Progress reset"); go();
    });
  }

  /* ------------------------------------------------------------ search */
  const index = [];
  for (const s of order) index.push({ id: s.id, where: `${s.week.code} ${s.code}`, title: s.title, text: toText(s.tokens) });
  for (const w of Object.values(weeks)) index.push({ id: w.id, where: w.code, title: w.title, text: toText(w.intro) });
  for (const r of Object.values(routes)) if (r.type === "page") index.push({ id: r.page.id, where: "Guide", title: r.page.title, text: toText(r.page.tokens) });
  index.forEach((e) => { e.lt = e.title.toLowerCase(); e.lx = e.text.toLowerCase(); });

  function search(q) {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    const res = [];
    for (const e of index) {
      if (!terms.every((t) => e.lt.includes(t) || e.lx.includes(t))) continue;
      let score = 0; for (const t of terms) { if (e.lt.includes(t)) score += 10; score += Math.min(5, e.lx.split(t).length - 1); }
      res.push({ e, score });
    }
    return res.sort((a, b) => b.score - a.score).slice(0, 12).map(({ e }) => {
      const i = e.lx.indexOf(terms[0]);
      let snip = i >= 0 ? (i > 50 ? "…" : "") + e.text.slice(Math.max(0, i - 50), i + 110) + "…" : e.text.slice(0, 140);
      snip = esc(snip);
      for (const t of terms) snip = snip.replace(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), (m) => `<mark>${m}</mark>`);
      return `<a href="#${e.id}"><span class="where">${esc(e.where)}</span> ${esc(e.title)}<small>${snip}</small></a>`;
    });
  }

  /* ------------------------------------------------------------ boot */
  function applyTheme() {
    if (S.theme) document.documentElement.setAttribute("data-theme", S.theme); else document.documentElement.removeAttribute("data-theme");
    $("#theme .lbl").textContent = S.theme ? (S.theme === "dark" ? "Dark" : "Light") : "Auto";
  }
  function boot() {
    applyTheme();
    $("#theme").addEventListener("click", () => { S.theme = S.theme === "" ? "light" : S.theme === "light" ? "dark" : ""; save(); applyTheme(); });
    $("#menu").addEventListener("click", () => document.body.classList.toggle("rail-open"));
    const inp = $("#q"), out = $("#results");
    let sel = -1;
    const show = () => { const r = search(inp.value); out.innerHTML = r.join("") || (inp.value.trim() ? `<a><small>No matches.</small></a>` : ""); out.hidden = !inp.value.trim(); sel = -1; };
    inp.addEventListener("input", show);
    inp.addEventListener("keydown", (e) => {
      const links = $$("a[href]", out);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, Math.min(links.length - 1, sel + (e.key === "ArrowDown" ? 1 : -1))); links.forEach((l, i) => l.classList.toggle("sel", i === sel)); }
      else if (e.key === "Enter" && links.length) { location.hash = links[Math.max(0, sel)].getAttribute("href"); inp.value = ""; out.hidden = true; inp.blur(); }
      else if (e.key === "Escape") { inp.value = ""; out.hidden = true; inp.blur(); }
    });
    out.addEventListener("click", (e) => { if (e.target.closest("a[href]")) { inp.value = ""; out.hidden = true; } });
    document.addEventListener("click", (e) => { if (!e.target.closest(".search")) out.hidden = true; });
    document.addEventListener("keydown", (e) => {
      if (e.target.matches("input, textarea") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") { e.preventDefault(); inp.focus(); }
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const a = $(e.key === "ArrowLeft" ? ".pager a.prev" : ".pager a.next"); if (a) location.hash = a.getAttribute("href");
      }
    });
    window.addEventListener("hashchange", go);
    go();
  }
  boot();
})();
