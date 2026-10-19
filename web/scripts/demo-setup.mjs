#!/usr/bin/env node
/**
 * Enterprise demo: the steps that follow a fresh demo database (development only). Run once the API has finished its demo seeders.
 *   1. Anika and Ben get an AI budget (the platform admin's per-person AI override), so the extension's Pro tools work for them.
 *   2. The demo mailbox holds its staged emails back again (for a new rehearsal without restarting the API).
 *   3. A short check of what the demo needs: the prepare switch for Anika, her inbox licence, the AI budget.
 *
 *   node web/scripts/demo-setup.mjs        # env: DEMO_API (http://localhost:18183)
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const API = process.env.DEMO_API || "http://localhost:18183";
const json = { "content-type": "application/json", accept: "application/json" };
let secret = process.env.DOSSIER_TENANT_HOST_SECRET;
if (!secret) {
  try {
    secret = (/DOSSIER_TENANT_HOST_SECRET=([^"\r\n]+)/.exec(readFileSync(join(here, "../../.claude/ent-demo-api.cmd"), "utf8")) || [])[1];
  } catch {
    secret = undefined;
  }
}
const acme = { "X-Kiwiply-Host": "acme.localhost", ...(secret ? { "X-Kiwiply-Host-Secret": secret } : {}) };
const ok = [];
const bad = [];
const line = (good, text) => (good ? ok : bad).push(text) && console.log(`${good ? "OK  " : "FAIL"}  ${text}`);

async function token(login, headers = {}) {
  const r = await fetch(`${API}/api/authenticate/demo`, { method: "POST", headers: { ...json, ...headers }, body: JSON.stringify({ login }) });
  if (!r.ok) throw new Error(`demo sign-in ${login}: ${r.status}`);
  return (await r.json()).accessToken;
}

const admin = await token("demo-admin");
for (const who of ["anika", "ben"]) {
  const r = await fetch(`${API}/api/admin/users/demo-ent-acme-${who}/ai-quota`, { method: "PUT", headers: { ...json, authorization: `Bearer ${admin}` }, body: JSON.stringify({ budgetCents: 600 }) });
  line(r.ok, `AI budget for ${who} (${r.status})`);
}
const reset = await fetch(`${API}/api/admin/demo/inbox/reset`, { method: "POST", headers: { authorization: `Bearer ${admin}` } });
line(reset.ok, `demo emails held back again (${reset.status}${reset.status === 404 ? ": start the API with DOSSIER_DEMO_INBOX_STAGED=true" : ""})`);

// 3. A resume the extension can use (its "Choose a resume" list, best resume, Check fit, and the file it attaches to the form). The
//    workspace's sample resumes are records only, so each walkthrough consultant gets one real resume with a PDF, built from the profile.
const PEOPLE = {
  anika: { title: "Platform Engineer", years: 7, skills: ["Python", "SQL", "AWS", "Kubernetes", "Terraform", "Airflow", "CI/CD", "Monitoring"],
    jobs: [["Senior Platform Engineer", "Brightwave Systems", "2022 - Present", ["Built the data platform's Airflow and Kubernetes pipelines on AWS, used by 6 product teams", "Moved infrastructure to Terraform modules with review gates; releases became weekly instead of monthly"]],
           ["Data Engineer", "Copperline Analytics", "2019 - 2022", ["Designed Python and SQL ingestion for 40+ sources with data-quality checks", "Ran on-call for the pipelines and wrote the runbooks the team still uses"]]] },
  ben: { title: "DevOps Engineer", years: 9, skills: ["AWS", "Kubernetes", "Terraform", "Docker", "GitHub Actions", "Python", "Linux"],
    jobs: [["DevOps Engineer", "Meridian Freight", "2021 - Present", ["Runs Kubernetes on AWS for 30 services with zero-downtime deploys", "Cut build times in half with cached GitHub Actions pipelines"]],
           ["Systems Engineer", "Tidewater Software", "2016 - 2021", ["Automated server builds with Terraform and Ansible", "Owned monitoring and incident response for customer-facing systems"]]] },
};
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
async function ensureResume(who) {
  const t = await token(`demo-ent-acme-${who}`, acme);
  const h = { ...acme, authorization: `Bearer ${t}`, accept: "application/json" };
  const have = await (await fetch(`${API}/api/profile/resumes`, { headers: h })).json();
  if (Array.isArray(have) && have.some((r) => !r.archived)) return line(true, `${who} already has a resume the extension can use`);
  let bio = {};
  try {
    bio = JSON.parse((await (await fetch(`${API}/api/profile`, { headers: h })).json()).payload || "{}");
  } catch {
    bio = {};
  }
  const p = PEOPLE[who];
  const name = `${bio.firstName || who} ${bio.lastName || ""}`.trim();
  const label = `${name} - ${p.title}`;
  const parsed = {
    fullName: name, email: bio.email || "", phone: bio.phone || "", city: bio.city || "", state: bio.state || "", headline: p.title,
    summary: `${p.title} with ${p.years} years building reliable cloud infrastructure and data pipelines.`,
    skills: p.skills,
    experience: p.jobs.map(([title, company, dates, bullets]) => ({ title, company, dates, bullets })),
  };
  const html = `<!doctype html><html><body style="font:11pt/1.45 Arial,sans-serif;color:#1f2937;margin:40px 48px">
    <h1 style="margin:0;font-size:22pt">${esc(name)}</h1><div style="color:#4b5563">${esc(p.title)} · ${esc(bio.email || "")} · ${esc(bio.phone || "")} · ${esc([bio.city, bio.state].filter(Boolean).join(", "))}</div>
    <h3 style="margin:18px 0 6px;border-bottom:1px solid #d1d5db">Summary</h3><div>${esc(parsed.summary)}</div>
    <h3 style="margin:18px 0 6px;border-bottom:1px solid #d1d5db">Skills</h3><div>${esc(p.skills.join(" · "))}</div>
    <h3 style="margin:18px 0 6px;border-bottom:1px solid #d1d5db">Experience</h3>
    ${p.jobs.map(([title, company, dates, bullets]) => `<div style="margin-bottom:10px"><b>${esc(title)}</b>, ${esc(company)} <span style="float:right;color:#6b7280">${esc(dates)}</span><ul style="margin:4px 0 0 18px;padding:0">${bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul></div>`).join("")}
  </body></html>`;
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome" });
  const page = await browser.newPage();
  await page.setContent(html);
  const pdf = await page.pdf({ format: "Letter" });
  await browser.close();
  const created = await fetch(`${API}/api/profile/resumes`, {
    method: "POST",
    headers: { ...h, "content-type": "application/json" },
    body: JSON.stringify({ label, status: "CONFIRMED", parsedJson: JSON.stringify(parsed), defaultResume: true }),
  });
  if (!created.ok) return line(false, `${who}: resume not created (${created.status} ${(await created.text()).slice(0, 120)})`);
  const id = (await created.json()).id;
  const form = new FormData();
  form.append("file", new Blob([pdf], { type: "application/pdf" }), `${name.replace(/\s+/g, "-")}-Resume.pdf`);
  const up = await fetch(`${API}/api/resumes/${id}/file`, { method: "POST", headers: { ...acme, authorization: `Bearer ${t}` }, body: form });
  line(up.ok, `${who}: resume "${label}" with a PDF, set as default (${up.status})`);
}
for (const who of ["anika", "ben"]) {
  try {
    await ensureResume(who);
  } catch (e) {
    line(false, `${who}: resume step failed (${String(e.message).slice(0, 120)})`);
  }
}

const anika = await token("demo-ent-acme-anika", acme);
const ah = { ...acme, authorization: `Bearer ${anika}`, accept: "application/json" };
const me = await (await fetch(`${API}/api/me/tenant`, { headers: ah })).json();
const org = me.org.id;
const prep = await (await fetch(`${API}/api/orgs/${org}/con/prepare/status`, { headers: ah })).json();
line(prep.enabled === true, `Anika can prepare selected openings (${prep.enabled ? `up to ${prep.maxBatch} at a time` : prep.reason})`);
const inbox = await (await fetch(`${API}/api/orgs/${org}/me-workspace/inbox`, { headers: ah })).json();
line(inbox.inbox?.entitled === true, `Anika's licence includes inbox tracking${inbox.inbox?.connected ? " (a mailbox is already connected)" : ""}`);
const ver = await (await fetch(`${API}/api/profile/version`, { headers: ah })).json();
line(ver.plan === "PRO", `the extension sees Anika's Pro tools (plan ${ver.plan})`);

console.log(`\n${ok.length} ok, ${bad.length} failed`);
process.exit(bad.length ? 1 : 0);
