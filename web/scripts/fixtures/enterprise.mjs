// The enterprise demo roster for the mock API (X1.12; DEV ONLY): the same people the real API's EnterpriseDemoSeeder creates, from
// the shared table `enterprise-demo.json` (the API's EnterpriseDemoSeederIT diffs it against the seed).
//
//   npm run dev:demo -w web     then   http://acme.localhost:3100/login   -> "Demo accounts" tab on the left edge
//
// As a MOCK_FIXTURE it adds no personal accounts (the tenants' members sign in through the demo tab, not a password).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function load() {
  try {
    return JSON.parse(readFileSync(new URL("./enterprise-demo.json", import.meta.url), "utf8"));
  } catch {
    // a bundler (vitest) rewrites import.meta.url: fall back to the working directory (web/ or the repo root)
    for (const base of ["scripts/fixtures", "web/scripts/fixtures"]) {
      try {
        return JSON.parse(readFileSync(resolve(process.cwd(), base, "enterprise-demo.json"), "utf8"));
      } catch {
        /* try the next */
      }
    }
    throw new Error("enterprise fixture: cannot read enterprise-demo.json");
  }
}

export const ENTERPRISE_DEMO = load().tenants;

/** The login of a roster member: demo-ent-{orgKey}-{key} (the API's namespace). */
export const demoLogin = (orgKey, key) => `demo-ent-${orgKey}-${key}`;

/** host -> [{ login, name, roles, status }] */
export function demoPeople(host) {
  const t = ENTERPRISE_DEMO[host];
  if (!t) return [];
  return t.people.map((p) => ({ key: p.key, login: p.status === "INVITED" ? null : demoLogin(t.orgKey, p.key), name: `${p.first} ${p.last}`, roles: p.roles, status: p.status }));
}

const fixture = { accounts: {} };
export default fixture;
