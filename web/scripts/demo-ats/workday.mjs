/**
 * Local stand-in of Adobe's Workday careers site for the enterprise demo (development only), served by demo-ats-server.mjs on
 * http://adobe.wd5.myworkdayjobs.localhost:3399 (Chrome resolves *.localhost to the loopback address by itself).
 *
 * The job page, the "Start Your Application" page and step 1 of the application are the real pages captured from
 * adobe.wd5.myworkdayjobs.com on 2026-10-19 (scripts removed, logos and fonts served from here); flow.js builds the remaining steps
 * (My Experience, Application Questions, Voluntary Disclosures, Review) from the same Workday components. Submit only shows a
 * confirmation on the page: nothing is sent anywhere.
 *
 *   /en-US/external_experienced/job/San-Jose/Senior-Backend-Engineer---Cloud-Platform_R168509                       job posting
 *   .../apply                                                                                                         Start Your Application
 *   .../apply/applyManually                                                                                           the application (5 steps)
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = resolve(dirname(fileURLToPath(import.meta.url)), "workday");
const read = (f) => readFileSync(join(DIR, f), "utf8");
const BODY = { job: read("job.html"), apply: read("apply.html"), flow: read("flow.html") };
const POSTING = JSON.parse(read("jobposting.json"));
export const WORKDAY_JOB_PATH = "/en-US/external_experienced/job/San-Jose/Senior-Backend-Engineer---Cloud-Platform_R168509";
const TYPES = { ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".png": "image/png", ".woff2": "font/woff2", ".ico": "image/x-icon" };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function page(kind) {
  const desc = String(POSTING.description || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 600);
  const flow = kind === "flow";
  return `<!doctype html>
<html lang="en-US"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(POSTING.title)}</title>
<meta name="description" property="og:description" content="${esc(desc)}">
<link rel="icon" href="/__wd/favicon.ico">
<link rel="stylesheet" href="/__wd/wd.css">${flow ? '\n<link rel="stylesheet" href="/__wd/flow.css">' : ""}
<style>html,body{margin:0}body{background:#f0f1f2}</style>
<script type="application/ld+json">${JSON.stringify(POSTING).replace(/</g, "\\u003c")}</script>
</head>
${BODY[kind].replace(/<body[^>]*>/, '<body data-whatinput="initial">')}${flow ? '\n<script src="/__wd/flow.js"></script>' : ""}
</html>`;
}

export function handleWorkday(req, res, url) {
  const p = decodeURIComponent(url.pathname);
  if (p.startsWith("/__wd/") || p === "/favicon.ico") {
    const name = p === "/favicon.ico" ? "favicon.ico" : p.slice("/__wd/".length);
    const file = resolve(DIR, name);
    if (!file.startsWith(DIR) || !existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    return res.end(readFileSync(file));
  }
  const m = /^(?:\/en-US)?\/external_experienced\/job\/[^/]+\/[^/]+?(\/apply(?:\/(applyManually|autofillWithResume|useMyLastApplication))?)?\/?$/.exec(p);
  if (!m) {
    res.writeHead(302, { location: WORKDAY_JOB_PATH });
    return res.end();
  }
  const kind = m[2] ? "flow" : m[1] ? "apply" : "job";
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  res.end(page(kind));
}
