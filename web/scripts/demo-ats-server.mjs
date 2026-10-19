#!/usr/bin/env node
/**
 * Local stand-in employer pages for the enterprise demo (development only).
 *
 * Serves a Greenhouse-style application form (the fixture of video 09, `web/e2e/videos/v3/fixtures/greenhouse-apply.html`) for ANY path of the shape
 * `/<ats>/<company-slug>/<id>?t=<title>&l=<location>`, with the company name read from the slug and the title from `?t=`. The form's own Submit button
 * shows a confirmation on the page; nothing is sent anywhere, and nothing here is reachable from outside this machine (it binds to 127.0.0.1).
 *
 * Why: the seeded demo openings link to `jobs.example.com` (a 404 in a real browser), and the extension only runs on hosts it has permission for.
 * With `dossier.demo.job-link-base=http://jobs.localhost:3399/greenhouse` on the API and `WXT_DEV_ATS_ORIGINS=http://jobs.localhost:3399` on a
 * development build of the extension, every assigned opening opens here, the extension fills it, and the consultant presses the page's Submit.
 * Chrome resolves `*.localhost` to the loopback address by itself (no hosts-file entry).
 *
 *   node web/scripts/demo-ats-server.mjs            # http://jobs.localhost:3399/greenhouse/acme-staffing/1?t=Platform%20Engineer
 *   DEMO_ATS_PORT=3399 node web/scripts/demo-ats-server.mjs
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = readFileSync(resolve(here, "../e2e/videos/v3/fixtures/greenhouse-apply.html"), "utf8");
const PORT = Number(process.env.DEMO_ATS_PORT || 3399);

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const titleCase = (slug) =>
  String(slug || "")
    .split(/[-_.]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

function page(url) {
  const parts = url.pathname.split("/").filter(Boolean); // [ats, company-slug, id]
  const company = parts.length >= 2 ? titleCase(parts[1]) : "Northwind Labs";
  const title = (url.searchParams.get("t") || "").trim() || "Data Platform Engineer";
  const location = (url.searchParams.get("l") || "").trim() || "Remote, United States";
  return TEMPLATE.replaceAll("Northwind Labs", esc(company)).replaceAll("Data Platform Engineer", esc(title)).replaceAll("Remote, United States", esc(location));
}

// ---- the demo mailbox (http://mail.localhost:<port>/): a Gmail-style view of the API's SAMPLE mailbox ----------------------------------
// It shows what the sample mailbox holds and lets the presenter "send" the held-back emails (live-arrival mode,
// DOSSIER_DEMO_INBOX_STAGED=true on the API). It talks to the API as the demo platform admin (DEMO_ADMIN_ENABLED=true on the API).
const API = process.env.DEMO_API || "http://localhost:18183";
const MAILBOX = readFileSync(resolve(here, "demo-mailbox.html"), "utf8");
let adminToken = null;
async function admin(path, method = "GET", retry = true) {
  if (!adminToken) {
    const r = await fetch(`${API}/api/authenticate/demo`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ login: "demo-admin" }) });
    adminToken = r.ok ? (await r.json()).accessToken : null;
    if (!adminToken) return { status: 502, body: "{}" };
  }
  const r = await fetch(`${API}${path}`, { method, headers: { authorization: `Bearer ${adminToken}`, accept: "application/json" } });
  if (r.status === 401 && retry) {
    adminToken = null;
    return admin(path, method, false);
  }
  return { status: r.status, body: await r.text() };
}

async function mailbox(req, res, url) {
  if (url.pathname === "/demo-api/inbox") {
    const r = await admin("/api/admin/demo/inbox");
    res.writeHead(r.status, { "content-type": "application/json", "cache-control": "no-store" });
    return res.end(r.body);
  }
  const m = /^\/demo-api\/deliver\/([a-z0-9-]+)$/.exec(url.pathname);
  if (m && req.method === "POST") {
    const r = await admin(`/api/admin/demo/inbox/${m[1]}/deliver`, "POST");
    res.writeHead(r.status, { "content-type": "application/json" });
    return res.end(r.body);
  }
  if (url.pathname === "/demo-api/reset" && req.method === "POST") {
    const r = await admin("/api/admin/demo/inbox/reset", "POST");
    res.writeHead(r.status, { "content-type": "application/json" });
    return res.end(r.body);
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  res.end(MAILBOX);
}

const server = createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (url.hostname.startsWith("mail.")) {
    mailbox(req, res, url).catch((e) => {
      res.writeHead(502, { "content-type": "text/plain" });
      res.end(String(e && e.message));
    });
    return;
  }
  if (url.pathname === "/" || url.pathname === "/healthz") {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end(`Kiwiply demo stand-in employer pages. Open /<ats>/<company-slug>/<id>?t=<title> (example: /greenhouse/acme-staffing/1?t=Platform%20Engineer).\n`);
    return;
  }
  if (url.pathname === "/favicon.ico") {
    res.writeHead(204);
    res.end();
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  res.end(page(url));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`demo ATS pages on http://jobs.localhost:${PORT}/ and the demo mailbox on http://mail.localhost:${PORT}/ (loopback only; Ctrl+C to stop)`);
});
