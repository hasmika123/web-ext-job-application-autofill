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
