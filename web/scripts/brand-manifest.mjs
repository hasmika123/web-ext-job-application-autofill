/**
 * The manifest of an organization's own extension build (CUSTOM-DOMAINS-BUILD.md A6, gap D8), as a pure function so it can be tested.
 *
 * Given the built manifest and the organization:
 *   - name, toolbar title and description carry the organization's name. With `whiteLabel`, the description starts with the notice the Chrome Web Store
 *     asks of a white-label enterprise extension ("THIS IS A WHITE LABEL ENTERPRISE EXTENSION FOR <NAME>.", spam policy FAQ, enterprise exception);
 *   - with `web` (white-label), no Kiwiply host is listed anywhere Chrome shows it (host permissions, externally_connectable, content scripts, web
 *     accessible resources). Instead the organization's own addresses are listed EXACTLY: its main site (`web`) and every other address it serves on
 *     (`origins`, e.g. its Kiwiply subdomain and its custom domains), so its pages may connect and send a Prepare batch;
 *   - Kiwiply's `key` is dropped, so the build is its own item with its own ID (nothing depends on the ID: connect goes through the relay);
 *   - the API is listed as a host permission only when it is not a Kiwiply host. Kiwiply's API answers extensions by CORS, so a white-label build
 *     needs no permission for it, and Chrome's install prompt never names Kiwiply (user decision 2026-11-15: the API behind the scenes is fine).
 */
const KIWI = /kiwiply\.com/i;

export function origin(raw) {
  const s = String(raw || "").trim().replace(/\/+$/, "");
  if (!s) return "";
  const u = new URL(s);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error(`not a web origin: ${raw}`);
  return u.origin;
}

export function storeDescription(name) {
  return `THIS IS A WHITE LABEL ENTERPRISE EXTENSION FOR ${name.toUpperCase()}. Fill job applications from your profile; you review and submit.`.slice(0, 132);
}

export function brandManifest(manifest, { name, web, origins = [], api, whiteLabel = Boolean(web) }) {
  const m = JSON.parse(JSON.stringify(manifest));
  m.name = `${name} - Job Autofill`.slice(0, 75);
  m.description = whiteLabel
    ? storeDescription(name)
    : `Fill job applications for ${name} consultants from your profile and resume. Review every field. Never submits for you.`.slice(0, 132);
  if (m.action) m.action.default_title = `${name} - open the autofill drawer`;
  if (!web) return m;
  // Its own store item, with its own ID: Kiwiply's `key` would pin it to Kiwiply's ID, and a first store upload refuses a manifest carrying one.
  delete m.key;

  const site = origin(web);
  const own = [...new Set([site, ...origins.map(origin)].filter(Boolean))].map((o) => `${o}/*`);
  const add = (list, values) => [...new Set([...(list || []), ...values])];
  const kiwi = (p) => KIWI.test(String(p));

  if (m.host_permissions) m.host_permissions = m.host_permissions.filter((p) => !kiwi(p));
  if (api && !kiwi(api)) m.host_permissions = add(m.host_permissions, [`${origin(api)}/*`]);
  if (m.externally_connectable) m.externally_connectable.matches = add(m.externally_connectable.matches.filter((p) => !kiwi(p)), own);
  for (const cs of m.content_scripts || []) {
    const kept = cs.matches.filter((p) => !kiwi(p));
    // A content script that ran on Kiwiply's pages (the connect relay) runs on the organization's own addresses instead.
    cs.matches = kept.length === cs.matches.length ? kept : add(kept, own);
  }
  for (const war of m.web_accessible_resources || []) if (war.matches) war.matches = war.matches.filter((p) => !kiwi(p));
  return m;
}
