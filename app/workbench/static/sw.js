// Service worker for installing the workbench as an app. It caches nothing: the
// workbench is a live editor and terminal, so stale pages would only mislead.
// When the server can't be reached, navigations get a short offline page instead
// of the browser's error screen.
const OFFLINE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>arm-on-zynq</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f151b;color:#dde5eb;
font:15px/1.5 system-ui,sans-serif;padding:16px;text-align:center}button{margin-top:12px;padding:10px 16px;border:0;border-radius:7px;
background:#79a6ff;color:#0f151b;font:600 14px system-ui}</style><div><h1 style="font-size:20px;margin:0 0 6px">Workbench unreachable</h1>
<p style="margin:0;color:#93a3b0">The server didn't answer. Check that you're on Tailscale or your home network.</p>
<button onclick="location.reload()">Try again</button></div>`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return;
  e.respondWith(fetch(e.request).catch(() => new Response(OFFLINE, { headers: { "Content-Type": "text/html" } })));
});
