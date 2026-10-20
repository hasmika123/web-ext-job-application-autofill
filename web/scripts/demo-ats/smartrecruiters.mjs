/**
 * Local stand-in of ServiceNow's SmartRecruiters posting for the enterprise demo (development only), served by demo-ats-server.mjs on
 * http://jobs.smartrecruiters.localhost:3399. The real application page sits behind a bot check (DataDome), so the demo uses this copy:
 * the job page is the real posting captured on 2026-10-19 (scripts removed, logos served from here); the "oneclick" application is
 * rebuilt in SmartRecruiters' look (smartrecruiters/apply.html + sr.js). Submit only shows a confirmation: nothing is sent anywhere.
 *
 *   /ServiceNow/744000156132859-senior-staff-platform-engineer-kubernetes-federal                          job posting ("I'm interested")
 *   /oneclick-ui/company/ServiceNow/publication/a430bd4c-3faf-4272-a33f-82720f9bc34f?dcr_ci=ServiceNow     the application (2 steps)
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = resolve(dirname(fileURLToPath(import.meta.url)), "smartrecruiters");
const read = (f) => readFileSync(join(DIR, f), "utf8");
const JOB = read("job.html");
const APPLY = read("apply.html");
const TYPES = { ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/png" };
const TITLE = "Senior Staff Platform Engineer - Kubernetes - Federal";
const JOB_PATH = "/ServiceNow/744000156132859-senior-staff-platform-engineer-kubernetes-federal";
const POSTING = {
  "@context": "https://schema.org/", "@type": "JobPosting", title: TITLE, datePosted: "2026-10-02", employmentType: "FULL_TIME",
  hiringOrganization: { "@type": "Organization", name: "ServiceNow", sameAs: "https://www.servicenow.com" },
  jobLocation: { "@type": "Place", address: { "@type": "PostalAddress", streetAddress: "2225 Lawson Lane", addressLocality: "Santa Clara", addressRegion: "CA", addressCountry: "US" } },
  identifier: { "@type": "PropertyValue", name: "ServiceNow", value: "744000156132859" },
};

function html(body, title, css, js) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="icon" href="/__sr/favicon.ico">
${css.map((c) => `<link rel="stylesheet" href="/__sr/${c}">`).join("\n")}
<script type="application/ld+json">${JSON.stringify(POSTING)}</script>
</head>
${body}${js ? `\n<script src="/__sr/${js}"></script>` : ""}
</html>`;
}

export function handleSmartRecruiters(req, res, url) {
  const p = decodeURIComponent(url.pathname);
  if (p.startsWith("/__sr/") || p === "/favicon.ico") {
    const name = p === "/favicon.ico" ? "favicon.ico" : p.slice("/__sr/".length);
    const file = resolve(DIR, name);
    if (!file.startsWith(DIR) || !existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    return res.end(readFileSync(file));
  }
  if (/^\/oneclick-ui\/company\/ServiceNow\/publication\/[0-9a-f-]+\/?$/i.test(p)) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    return res.end(html(APPLY, `${TITLE} | ServiceNow`, ["sr.css"], "sr.js"));
  }
  if (/^\/ServiceNow\/744000156132859/i.test(p)) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    return res.end(html(JOB, `ServiceNow ${TITLE} | SmartRecruiters`, ["jobad.css"], null));
  }
  res.writeHead(302, { location: JOB_PATH });
  res.end();
}
