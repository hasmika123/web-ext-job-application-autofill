#!/usr/bin/env node
/**
 * Enterprise demo: the steps that follow a fresh demo database (development only). Run once the API has finished its demo seeders.
 *   1. Anika and Ben get an AI budget (the platform admin's per-person AI override), so the extension's Pro tools work for them.
 *   2. The demo mailbox holds its staged emails back again (for a new rehearsal without restarting the API).
 *   3. A short check of what the demo needs: the prepare switch for Anika, her inbox licence, the AI budget.
 *
 *   node web/scripts/demo-setup.mjs        # env: DEMO_API (http://localhost:18183)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RESUMES, parsedResume, resumeHtml } from "./demo-resumes.mjs";
import { REAL_JOBS } from "./demo-real-jobs.mjs";

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
const acme = { "X-Kiwiply-Host": "aaruna.localhost", ...(secret ? { "X-Kiwiply-Host-Secret": secret } : {}) };
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
//    workspace's sample resumes are records only, so each walkthrough consultant gets one real, full resume with a PDF (demo-resumes.mjs).
//    An older demo resume of theirs (same name, another title) is replaced. Anika's PDF is also saved to DEMO_RESUME_DIR (the Desktop).
async function ensureResume(who) {
  const t = await token(`demo-ent-acme-${who}`, acme);
  const h = { ...acme, authorization: `Bearer ${t}`, accept: "application/json" };
  let bio = {};
  try {
    bio = JSON.parse((await (await fetch(`${API}/api/profile`, { headers: h })).json()).payload || "{}");
  } catch {
    bio = {};
  }
  const r = RESUMES[who];
  const name = `${bio.firstName || who} ${bio.lastName || ""}`.trim();
  const label = `${name} - ${r.title}`;
  const have = await (await fetch(`${API}/api/profile/resumes`, { headers: h })).json();
  const list = Array.isArray(have) ? have.filter((x) => !x.archived) : [];
  if (list.some((x) => x.label === label) && !process.env.REFRESH_RESUMES) return line(true, `${who} already has "${label}"`);
  for (const old of list.filter((x) => x.label === label || (x.label || "").startsWith(`${name} - `))) {
    await fetch(`${API}/api/profile/resumes/${old.id}`, { method: "DELETE", headers: h });
  }
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome" });
  const page = await browser.newPage();
  await page.setContent(resumeHtml(r, name, bio));
  const pdf = await page.pdf({ format: "Letter", printBackground: true, preferCSSPageSize: true });
  await browser.close();
  const created = await fetch(`${API}/api/profile/resumes`, {
    method: "POST",
    headers: { ...h, "content-type": "application/json" },
    body: JSON.stringify({ label, status: "CONFIRMED", parsedJson: JSON.stringify(parsedResume(r, name, bio)), defaultResume: true }),
  });
  if (!created.ok) return line(false, `${who}: resume not created (${created.status} ${(await created.text()).slice(0, 120)})`);
  const id = (await created.json()).id;
  const fileName = `${name.replace(/\s+/g, "-")}-Resume.pdf`;
  const form = new FormData();
  form.append("file", new Blob([pdf], { type: "application/pdf" }), fileName);
  const up = await fetch(`${API}/api/resumes/${id}/file`, { method: "POST", headers: { ...acme, authorization: `Bearer ${t}` }, body: form });
  if (who === "anika" && process.env.DEMO_RESUME_DIR !== "") {
    const dir = process.env.DEMO_RESUME_DIR || join(process.env.USERPROFILE || process.env.HOME || ".", "OneDrive", "Desktop");
    try {
      writeFileSync(join(dir, fileName), pdf);
    } catch (e) {
      console.log(`      (could not save the PDF to ${dir}: ${e.message})`);
    }
  }
  line(up.ok, `${who}: resume "${label}" with a PDF, set as default (${up.status})`);
}
for (const who of ["anika", "ben"]) {
  try {
    await ensureResume(who);
  } catch (e) {
    line(false, `${who}: resume step failed (${String(e.message).slice(0, 120)})`);
  }
}

// 4. Real postings on Greenhouse, Ashby, Lever, Workday and SmartRecruiters, saved by Rahul for Anika (as the extension's "Save for consultant"
//    does), so her Assigned Opportunities and Autopilot open real employers' pages. Each link is checked first; a closed one is reported.
{
  const rahul = { ...acme, authorization: `Bearer ${await token("demo-ent-acme-omar", acme)}`, accept: "application/json" };
  const orgId = (await (await fetch(`${API}/api/me/tenant`, { headers: rahul })).json()).org.id;
  // The walkthrough has Rahul as Anika's (and Vikram's) marketer; the seed gives Anika to Priya, so Priya assigns her to Rahul, as on her
  // Marketing Assignments page. Already his: nothing changes.
  const rahulMember = (await (await fetch(`${API}/api/me/tenant`, { headers: rahul })).json()).member?.id;
  const priya = { ...acme, authorization: `Bearer ${await token("demo-ent-acme-sarah", acme)}`, accept: "application/json", "content-type": "application/json" };
  const all = await (await fetch(`${API}/api/orgs/${orgId}/mkt/opportunities/options?q=Anika`, { headers: priya })).json();
  const anika = (all.consultants || []).find((c) => c.name === "Anika Rao");
  if (anika && rahulMember) {
    const r = await fetch(`${API}/api/orgs/${orgId}/marketing-assignments/assign`, {
      method: "POST",
      headers: { ...priya, "idempotency-key": `demo-setup-anika-rahul-${Date.now()}` },
      body: JSON.stringify({ consultantIds: [anika.id], marketerMemberId: rahulMember, allowOverCapacity: true, reason: "Demo setup: Rahul markets Anika" }),
    });
    line(r.ok, `Anika's marketer is Rahul Mehta (${r.status})`);
  }
  const opts = await (await fetch(`${API}/api/orgs/${orgId}/mkt/opportunities/options?q=Anika`, { headers: rahul })).json();
  const anikaId = (opts.consultants || []).find((c) => c.name === "Anika Rao")?.id;
  if (!anikaId) line(false, "real postings: Anika is not one of Rahul's consultants");
  // A liveSave posting (Adobe, Workday) is left for Rahul to save from the extension during the demo.
  for (const j of anikaId ? REAL_JOBS.filter((x) => !x.liveSave) : []) {
    let live = false;
    try {
      const r = await fetch(j.jobUrl, { redirect: "follow", headers: { "user-agent": "Mozilla/5.0" } });
      live = r.ok;
    } catch (e) {
      live = false;
    }
    const body = {
      jobUrl: j.jobUrl, title: j.title, company: j.company, location: j.location, workMode: j.workMode, employmentType: "Full-time",
      externalJobId: j.externalJobId, atsPlatform: j.ats, postedOn: new Date().toISOString().slice(0, 10), keyInfo: j.note, priority: j.priority,
      dueOn: new Date(Date.now() + j.dueInDays * 86_400_000).toISOString().slice(0, 10), consultantIds: [anikaId], extensionVersion: "demo-setup",
    };
    const r = await fetch(`${API}/api/orgs/${orgId}/mkt/opportunities/from-extension`, {
      method: "POST",
      headers: { ...rahul, "content-type": "application/json", "idempotency-key": `demo-${j.externalJobId}` },
      body: JSON.stringify(body),
    });
    const saved = r.ok || r.status === 409;
    line(saved && live, `real posting (${j.ats}): ${j.company}, ${j.title} ${saved ? "saved for Anika" : `not saved (${r.status})`}${live ? "" : " - LINK DID NOT ANSWER: the posting may have closed"}`);
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
