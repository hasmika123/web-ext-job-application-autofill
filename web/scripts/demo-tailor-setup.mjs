#!/usr/bin/env node
/**
 * Enterprise demo: the "tailor a resume, then assign" story (DEMO-PLAN section 16), preset for one job (web/src/lib/ent/demo/tailor-preset.json).
 * Run by demo-setup.mjs (step 5), or alone to reset just this story before a rehearsal:
 *
 *   node web/scripts/demo-tailor-setup.mjs        # env: DEMO_API (http://localhost:18183), REFRESH_RESUMES=1 rebuilds the tailored PDF
 *
 *   a. The job, on Rahul's Job Discovery: he saves it for Vikram (a job needs one consultant to exist), so Anika is NOT on it yet; Rahul tailors her
 *      resume and assigns her live.
 *   b. Anika's tailored resume: a real resume with its PDF, built from the same text the tailor sheet shows. It stays ARCHIVED (out of her lists and the
 *      extension's pick) until she approves it by preparing that job. A rehearsal that already approved it is archived again.
 * Not undone here: an assignment a rehearsal made (Anika on the job). Use a fresh database for a clean run (DEMO-PLAN section 7).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RESUMES, parsedResume, resumeHtml, tailoredResume } from "./demo-resumes.mjs";

const here = dirname(fileURLToPath(import.meta.url));

export async function setupTailorStory({ API, acme, token, line }) {
  const preset = JSON.parse(readFileSync(join(here, "../src/lib/ent/demo/tailor-preset.json"), "utf8"));
  const rahul = { ...acme, authorization: `Bearer ${await token("demo-ent-acme-omar", acme)}`, accept: "application/json" };
  const orgId = (await (await fetch(`${API}/api/me/tenant`, { headers: rahul })).json()).org.id;
  // the options list is capped, so each name is searched for; a paused holder is fine (the job is still created, with nobody assigned)
  const find = async (name) => ((await (await fetch(`${API}/api/orgs/${orgId}/mkt/opportunities/options?q=${encodeURIComponent(name.split(" ")[0])}`, { headers: rahul })).json()).consultants || []).find((c) => c.name === name);
  const holder = (await find("Vikram Iyer")) || (await find("Ben Okafor"));
  if (!holder) line(false, "tailor story: Vikram is not one of Rahul's consultants");
  else {
    const j = preset.job;
    const r = await fetch(`${API}/api/orgs/${orgId}/mkt/opportunities/from-extension`, {
      method: "POST",
      headers: { ...rahul, "content-type": "application/json", "idempotency-key": `demo-${j.externalJobId}-${holder.id}` },
      body: JSON.stringify({
        jobUrl: j.jobUrl, title: j.title, company: j.company, location: j.location, workMode: "REMOTE", employmentType: "Contract",
        externalJobId: j.externalJobId, atsPlatform: "greenhouse", postedOn: new Date().toISOString().slice(0, 10), skills: j.skills, keyInfo: j.keyInfo,
        priority: "HIGH", dueOn: new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10), consultantIds: [holder.id], extensionVersion: "demo-setup",
      }),
    });
    line(r.ok || r.status === 409, `tailor story: "${j.title}" at ${j.company} is on Job Discovery (${r.status}${r.ok || r.status === 409 ? "" : ` ${(await r.text()).slice(0, 160)}`})`);
  }

  const t = await token(preset.consultant.login, acme);
  const h = { ...acme, authorization: `Bearer ${t}`, accept: "application/json" };
  const have = await (await fetch(`${API}/api/profile/resumes`, { headers: h })).json();
  const mine = (Array.isArray(have) ? have : []).filter((x) => x.label === preset.resume.label);
  const archive = (id) => fetch(`${API}/api/profile/resumes/${id}`, { method: "PUT", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify({ archived: true }) });
  if (mine.length && !process.env.REFRESH_RESUMES) {
    for (const x of mine.filter((x) => !x.archived)) await archive(x.id);
    line(true, `tailor story: Anika's tailored resume is ready, waiting for her approval ("${preset.resume.label}")`);
    return;
  }
  for (const x of mine) await fetch(`${API}/api/profile/resumes/${x.id}`, { method: "DELETE", headers: h });
  let bio = {};
  try {
    bio = JSON.parse((await (await fetch(`${API}/api/profile`, { headers: h })).json()).payload || "{}");
  } catch {
    bio = {};
  }
  const name = `${bio.firstName || "Anika"} ${bio.lastName || "Rao"}`.trim();
  const r = tailoredResume(RESUMES.anika, preset);
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome" });
  const page = await browser.newPage();
  await page.setContent(resumeHtml(r, name, bio));
  const pdf = await page.pdf({ format: "Letter", printBackground: true, preferCSSPageSize: true });
  await browser.close();
  const created = await fetch(`${API}/api/profile/resumes`, {
    method: "POST",
    headers: { ...h, "content-type": "application/json" },
    body: JSON.stringify({ label: preset.resume.label, status: "CONFIRMED", parsedJson: JSON.stringify(parsedResume(r, name, bio)), defaultResume: false }),
  });
  if (!created.ok) return line(false, `tailor story: tailored resume not created (${created.status})`);
  const id = (await created.json()).id;
  const form = new FormData();
  form.append("file", new Blob([pdf], { type: "application/pdf" }), preset.resume.fileName);
  const up = await fetch(`${API}/api/resumes/${id}/file`, { method: "POST", headers: { ...acme, authorization: `Bearer ${t}` }, body: form });
  const arch = await archive(id);
  line(up.ok && arch.ok, `tailor story: Anika's tailored resume with its PDF, waiting for her approval (${up.status}/${arch.status})`);
}

// Run alone: the same sign-in and host headers as demo-setup.mjs.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const API = process.env.DEMO_API || "http://localhost:18183";
  let secret = process.env.DOSSIER_TENANT_HOST_SECRET;
  if (!secret) {
    try {
      secret = (/DOSSIER_TENANT_HOST_SECRET=([^"\r\n]+)/.exec(readFileSync(join(here, "../../.claude/ent-demo-api.cmd"), "utf8")) || [])[1];
    } catch {
      secret = undefined;
    }
  }
  const acme = { "X-Kiwiply-Host": "aaruna.localhost", ...(secret ? { "X-Kiwiply-Host-Secret": secret } : {}) };
  const token = async (login, headers = {}) => {
    const r = await fetch(`${API}/api/authenticate/demo`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ login }) });
    if (!r.ok) throw new Error(`demo sign-in ${login}: ${r.status}`);
    return (await r.json()).accessToken;
  };
  let bad = 0;
  const line = (good, text) => {
    if (!good) bad++;
    console.log(`${good ? "OK  " : "FAIL"}  ${text}`);
  };
  await setupTailorStory({ API, acme, token, line });
  process.exit(bad ? 1 : 0);
}
