#!/usr/bin/env node
/**
 * Enterprise demo rehearsal of the email flow (development only), through the same calls the pages make:
 *   1. Anika connects the demo Gmail (the sample mailbox; any 16 letters);
 *   2. the presenter "sends" the Orbit Freight interview emails from the demo mailbox page; Anika presses Check now;
 *      Orbit Freight moves to Interview with the phone screen's time;
 *   3. the presenter sends the Cedar Analytics rejection; it waits under "Needs your review" (never applied on its own).
 * It disconnects first, so it can run again. Prints PASS/FAIL per step.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const API = process.env.DEMO_API || "http://localhost:18183";
const secret = process.env.DOSSIER_TENANT_HOST_SECRET || (/DOSSIER_TENANT_HOST_SECRET=([^"\r\n]+)/.exec(readFileSync(join(here, "../../.claude/ent-demo-api.cmd"), "utf8")) || [])[1];
const acme = { "X-Kiwiply-Host": "acme.localhost", "X-Kiwiply-Host-Secret": secret };
const fixture = JSON.parse(readFileSync(join(here, "../../api/src/main/resources/demo/inbox-demo.json"), "utf8"));
const results = [];
const step = (name, ok, note = "") => results.push(ok) && console.log(`${ok ? "PASS" : "FAIL"}  ${name}${note ? "  (" + note + ")" : ""}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tok = async (login, h = {}) => (await (await fetch(`${API}/api/authenticate/demo`, { method: "POST", headers: { "content-type": "application/json", ...h }, body: JSON.stringify({ login }) })).json()).accessToken;

const admin = { authorization: `Bearer ${await tok("demo-admin")}` };
const anika = { ...acme, authorization: `Bearer ${await tok("demo-ent-acme-anika", acme)}`, accept: "application/json" };
const org = (await (await fetch(`${API}/api/me/tenant`, { headers: anika })).json()).org.id;
const base = `${API}/api/orgs/${org}/me-workspace/inbox`;
const page = async () => (await fetch(base, { headers: anika })).json();
const stageOf = (p, company) => (p.updates || []).find((u) => u.company === company)?.stage;

await fetch(base, { method: "DELETE", headers: anika });
await fetch(`${API}/api/admin/demo/inbox/reset`, { method: "POST", headers: admin });
const c = await fetch(base, { method: "POST", headers: { ...anika, "content-type": "application/json" }, body: JSON.stringify({ address: fixture.address, appPassword: "abcdefghijklmnop" }) });
step("Anika connects the demo Gmail", c.ok, `${c.status} ${fixture.address}`);
let p = await page();
for (let i = 0; i < 30 && !p.inbox?.lastCheckedAt; i++) await sleep(2000), (p = await page());
step("first read done; Orbit Freight still Applied (its interview email is not sent yet)", stageOf(p, "Orbit Freight") === "APPLIED", `Orbit ${stageOf(p, "Orbit Freight")}, Northwind ${stageOf(p, "Northwind Labs")}`);

const d1 = await fetch(`${API}/api/admin/demo/inbox/orbit-interview/deliver`, { method: "POST", headers: admin });
step("presenter sends the Orbit Freight interview email", d1.ok);
const n1 = await fetch(`${base}/check-now`, { method: "POST", headers: anika });
step("Anika presses Check now", n1.status === 202, String(n1.status));
for (let i = 0; i < 20 && stageOf(p, "Orbit Freight") !== "INTERVIEW"; i++) await sleep(2000), (p = await page());
const orbit = (p.updates || []).find((u) => u.company === "Orbit Freight");
step("Orbit Freight moved to Interview, with the phone screen on the row", orbit?.stage === "INTERVIEW" && !!orbit?.interview, `${orbit?.stage} ${orbit?.interview ? orbit.interview.startsAt : "no interview line"}`);

await sleep(61_000); // Check now allows one manual read a minute
const d2 = await fetch(`${API}/api/admin/demo/inbox/cedar-rejection/deliver`, { method: "POST", headers: admin });
step("presenter sends the Cedar Analytics rejection", d2.ok);
const n2 = await fetch(`${base}/check-now`, { method: "POST", headers: anika });
step("Anika presses Check now again", n2.status === 202, String(n2.status));
let held = [];
for (let i = 0; i < 20 && !held.length; i++) {
  await sleep(2000);
  const r = await (await fetch(`${base}/review`, { headers: anika })).json();
  held = (r.items || r || []).filter?.((x) => JSON.stringify(x).includes("Cedar")) || [];
}
step("the rejection waits under Needs your review (not applied on its own)", held.length > 0, `${held.length} held`);

console.log(`\n${results.filter(Boolean).length}/${results.length} steps passed`);
process.exit(results.every(Boolean) ? 0 : 1);
