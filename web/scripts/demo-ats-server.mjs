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

const server = createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
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
  console.log(`demo ATS pages on http://jobs.localhost:${PORT}/ (loopback only; Ctrl+C to stop)`);
});
