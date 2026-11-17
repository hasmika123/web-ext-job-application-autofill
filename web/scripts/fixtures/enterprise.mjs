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

/** The one-click HANDLE of a roster member: demo-ent-{orgKey}-{key} (what the Demo accounts tab sends; not a login since the demo is SEPARATE). */
export const demoLogin = (orgKey, key) => `demo-ent-${orgKey}-${key}`;

/** The address the API seeds for a demo person: first.last@{orgKey}.example.com (the default roster). */
export const demoEmail = (orgKey, first, last) => `${first}.${last}@${orgKey}.example.com`.toLowerCase();

// The talent seed's marketers (api TalentDemoSeeder), who are demo people of the organization too but not on the one-click roster.
const MARKETERS = {
  acme: { jessica: ["Jessica", "Davis"], michael: ["Michael", "Park"], emily: ["Emily", "Lawson"], david: ["David", "Kim"], samantha: ["Samantha", "Lee"], ryan: ["Ryan", "Thompson"] },
  beta: { priya: ["Priya", "Nair"], leo: ["Leo", "Fischer"] },
};

/**
 * The ENTERPRISE account login of a demo person (decision O4, the demo is SEPARATE): ent#{tid}#{address}. The real API puts the numeric
 * organization id there; the mock's tid is the org key, so the mock login is ent#acme#sarah.chen@acme.example.com.
 */
export function entLogin(orgKey, key) {
  const t = Object.values(ENTERPRISE_DEMO).find((x) => x.orgKey === orgKey);
  const p = t?.people.find((x) => x.key === key);
  const name = p ? [p.first, p.last] : MARKETERS[orgKey]?.[key];
  if (!name) throw new Error(`enterprise fixture: no demo person ${orgKey}/${key}`);
  return `ent#${orgKey}#${demoEmail(orgKey, name[0], name[1])}`;
}

/** The demo person a mock token's subject names ({ orgKey, key }), or null for any other login. */
export function demoPersonOf(login) {
  const m = /^ent#([a-z]+)#/.exec(login ?? "");
  if (!m) return null;
  const t = Object.values(ENTERPRISE_DEMO).find((x) => x.orgKey === m[1]);
  const keys = [...(t?.people.map((p) => p.key) ?? []), ...Object.keys(MARKETERS[m[1]] ?? {})];
  const key = keys.find((k) => entLogin(m[1], k) === login);
  return key ? { orgKey: m[1], key } : null;
}

/** host -> [{ key, login (the one-click handle), account (the ent# login), name, roles, status }] */
export function demoPeople(host) {
  const t = ENTERPRISE_DEMO[host];
  if (!t) return [];
  return t.people.map((p) => {
    const invited = p.status === "INVITED";
    return { key: p.key, login: invited ? null : demoLogin(t.orgKey, p.key), account: invited ? null : entLogin(t.orgKey, p.key), name: `${p.first} ${p.last}`, roles: p.roles, status: p.status };
  });
}

const fixture = { accounts: {} };
export default fixture;
