#!/usr/bin/env node
/**
 * Does the extension read the demo resume fully? (development only.) Renders a demo consultant's resume to PDF exactly as demo-setup.mjs does,
 * reads it back with pdf.js and the extension's own local parser (job-autofill/src/lib/parser-core.js, the drawer's Upload path without AI),
 * and compares the result with the resume's source data.
 *
 *   node web/scripts/demo-resume-parse-check.mjs [anika|ben]     env: PDF=<path> to check a saved PDF instead, SHOW=1 prints the parse
 */
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { RESUMES, resumeHtml } from "./demo-resumes.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const require = createRequire(join(root, "package.json"));
const core = require(join(root, "job-autofill/src/lib/parser-core.js"));
const pdfjs = await import(pathToFileURL(join(root, "node_modules/pdfjs-dist/legacy/build/pdf.mjs")).href);

const who = process.argv[2] || "anika";
const r = RESUMES[who];
const NAMES = { anika: ["Anika Rao", { email: "anika.rao@aarunatech.com", phone: "+1 312 555 0142", city: "Chicago", state: "IL" }], ben: ["Vikram Iyer", { email: "vikram.iyer@aarunatech.com", phone: "+1 704 555 0187", city: "Charlotte", state: "NC" }] };
const [name, bio] = NAMES[who];

let pdf;
if (process.env.PDF) pdf = readFileSync(process.env.PDF);
else {
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome" });
  const page = await browser.newPage();
  await page.setContent(resumeHtml(r, name, bio));
  pdf = await page.pdf({ format: "Letter", printBackground: true, preferCSSPageSize: true });
  await browser.close();
}

const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf), useSystemFonts: true }).promise;
let text = "";
for (let p = 1; p <= doc.numPages; p++) {
  const content = await (await doc.getPage(p)).getTextContent();
  const items = content.items.filter((it) => it.str).map((it) => ({ x: it.transform[4], y: it.transform[5], w: it.width, str: it.str }));
  text += core.reconstructPdfText(items) + "\n\n";
}
const s = core.heuristicStructure(text.trim());
const got = core.parseBio(text.trim());
if (process.env.SHOW) console.log(text, "\n", JSON.stringify({ bio: got, ...s }, null, 1));

const results = [];
const check = (what, ok, note = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}${note ? "  (" + note + ")" : ""}`);
};
check("pages", doc.numPages <= 2, `${doc.numPages}`);
check("name, email, phone", got.firstName === name.split(" ")[0] && got.email === bio.email && !!got.phone, JSON.stringify({ f: got.firstName, l: got.lastName, e: got.email, p: got.phone }));
check("summary", s.summary.startsWith(r.summary.slice(0, 40)), s.summary.slice(0, 60));
check(`jobs: ${r.jobs.length}`, s.experience.length === r.jobs.length, `${s.experience.length}`);
r.jobs.forEach(([title, company, , dates, bullets], i) => {
  const e = s.experience[i] || {};
  const [start] = dates.split(" - ");
  check(
    `job ${i + 1}: ${title} at ${company}`,
    e.title === title && e.company === company && e.startDate === start && (e.bullets || []).length === bullets.length,
    JSON.stringify({ t: e.title, c: e.company, l: e.location, s: e.startDate, e: e.endDate, bullets: (e.bullets || []).length }),
  );
});
check(`education: ${r.education.length}`, s.education.length === r.education.length && s.education.every((e, i) => e.school === r.education[i][1] && !!e.degree && e.endDate === r.education[i][2]), JSON.stringify(s.education.map((e) => [e.degree, e.field, e.school, e.endDate])));
const want = r.skills.flatMap(([, list]) => list.split(",").map((x) => x.trim()));
const missing = want.filter((x) => !s.skills.some((y) => y.toLowerCase() === x.toLowerCase()));
const extra = s.skills.filter((y) => !want.some((x) => x.toLowerCase() === y.toLowerCase()));
check(`skills: ${want.length}`, missing.length === 0 && extra.length === 0, `missing ${JSON.stringify(missing)} extra ${JSON.stringify(extra)}`);
check("no stray spoken languages", s.languages.length === 0, JSON.stringify(s.languages).slice(0, 80));
const bad = results.filter((x) => !x).length;
console.log(`\n${results.length - bad}/${results.length} checks passed`);
process.exit(bad ? 1 : 0);
