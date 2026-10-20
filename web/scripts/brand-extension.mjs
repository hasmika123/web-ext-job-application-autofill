#!/usr/bin/env node
/**
 * Re-skin a BUILT copy of the extension for one organization (development and demo only; the white-label spin-off proper is later work).
 *
 * Takes a build (default job-autofill/.output/chrome-mv3-dev), copies it to a new folder, and swaps what a person sees:
 *   - the name in Chrome's extension list and the toolbar tooltip ("Acme Staffing - Job Autofill"),
 *   - the toolbar icons (from the organization's logo mark),
 *   - the logo in the drawer header and on the on-page review panel (mark + organization name),
 *   - the accent colour of the drawer and the options page (buttons, chips, highlights),
 *   - the "Prepared by Kiwiply" line on prepared tabs.
 * Everything else (the engine, the extension ID, the connection to the API) is the same build, so connecting from the organization's own
 * web pages keeps working. Nothing in the source tree changes.
 *
 *   - with --web: white-label. No "Kiwiply" anywhere a person can see it (names, links, messages, tab titles, Chrome's permission list);
 *     sign-in and every link go to the organization's own site, which may hand the session to this build directly (its /connect page).
 *     The build stops with a list if any visible "Kiwiply" is left.
 *
 *   node web/scripts/brand-extension.mjs --name "Aaruna Technologies" --logo C:/work_bench_claude/brand/acme-logo.png --primary "#1d5bd8" \
 *     --web http://aaruna.localhost:3200 --api http://localhost:18183
 *   options: --src <built folder> --out <new folder> (default <src>-<slug>) --short <name in "<short> AI", default the first word>
 *   (--web: the organization's site, --api: the API the build calls)
 */
import { chromium } from "@playwright/test";
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const NAME = args.name || "Acme Staffing";
// White-label: the organization's own site (where the extension signs in), the API it calls, and the short name used in "<Short> AI".
const WEB = (args.web || "").replace(/\/+$/, "");
const API = (args.api || "").replace(/\/+$/, "");
const SHORT = args.short || NAME.split(/\s+/)[0];
const SITE = `the ${NAME} site`;
const LOGO = resolve(args.logo || "");
const PRIMARY = (args.primary || "#1d5bd8").toLowerCase();
const SRC = resolve(args.src || join(here, "../../job-autofill/.output/chrome-mv3-dev"));
const slug = NAME.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const OUT = resolve(args.out || `${SRC}-${slug}`);

if (!existsSync(join(SRC, "manifest.json"))) throw new Error(`no built extension at ${SRC}`);
if (!existsSync(LOGO)) throw new Error(`no logo at ${LOGO} (pass --logo <png>)`);

// ---- colours: the organization's primary, plus a lighter, a soft and a deep shade of it ----------------------------------------------
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (rgb) => "#" + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
const mix = (a, b, t) => toHex(hex(a).map((v, i) => v + (hex(b)[i] - v) * t));
const shades = { accent: PRIMARY, accent2: mix(PRIMARY, "#ffffff", 0.35), soft: mix(PRIMARY, "#ffffff", 0.82), deep: mix(PRIMARY, "#000000", 0.25) };
const darkShades = { accent: mix(PRIMARY, "#ffffff", 0.2), accent2: mix(PRIMARY, "#ffffff", 0.4), soft: mix(PRIMARY, "#000000", 0.55), deep: mix(PRIMARY, "#ffffff", 0.45) };
const css = `
/* ${NAME} branding (web/scripts/brand-extension.mjs) */
:root{--color-accent:${shades.accent};--color-accent-2:${shades.accent2};--color-accent-soft:${shades.soft};--color-accent-deep:${shades.deep};}
.dark{--color-accent:${darkShades.accent};--color-accent-2:${darkShades.accent2};--color-accent-soft:${darkShades.soft};--color-accent-deep:${darkShades.deep};}
`;

// ---- copy, then re-skin the copy -------------------------------------------------------------------------------------------------------
rmSync(OUT, { recursive: true, force: true });
cpSync(SRC, OUT, { recursive: true });

const manifestPath = join(OUT, "manifest.json");
const m = JSON.parse(readFileSync(manifestPath, "utf8"));
m.name = `${NAME} - Job Autofill`;
m.description = `Fill job applications for ${NAME} consultants from your profile and resume. Review every field. Never submits for you.`.slice(0, 132);
if (m.action) m.action.default_title = `${NAME} - open the autofill drawer`;
if (WEB) {
  // The spin-off names no Kiwiply host: Chrome would show them in its permission prompt ("Read and change your data on kiwiply.com").
  // The organization's own site is listed exactly, so it may hand the session to the extension (the connect page on that site).
  const kiwi = (p) => /kiwiply\.com/i.test(String(p));
  const add = (list, v) => (list.includes(v) ? list : [...list, v]);
  if (m.host_permissions) m.host_permissions = m.host_permissions.filter((p) => !kiwi(p));
  if (API) m.host_permissions = add(m.host_permissions || [], `${API}/*`);
  if (m.externally_connectable) m.externally_connectable.matches = add(m.externally_connectable.matches.filter((p) => !kiwi(p)), `${WEB}/*`);
  for (const cs of m.content_scripts || []) {
    const kept = cs.matches.filter((p) => !kiwi(p));
    cs.matches = kept.length === cs.matches.length ? kept : add(kept, `${WEB}/*`);
  }
  for (const war of m.web_accessible_resources || []) if (war.matches) war.matches = war.matches.filter((p) => !kiwi(p));
}
writeFileSync(manifestPath, JSON.stringify(m, null, 2));

// White-label text: every Kiwiply name and link a person can meet (drawer, options page, review panel, messages, links, tab titles) becomes
// the organization's. Internal names nobody sees (message types such as KIWIPLY_CONNECT, which the web pages also send, element ids, function
// names) are kept as they are, so the engine and the web hand-off keep working.
const KEEP = /KIWIPLY_[A-Z_]+|createKiwiplyProvider|__kiwiply\w*|kiwiply-(?:sync|panel)\b/g;
function whiteLabel(src) {
  const kept = [];
  let s = src.replace(KEEP, (k) => `\u0000${kept.push(k) - 1}\u0000`);
  s = s
    .replace(/https:\/\/(?:www\.|app\.)?kiwiply\.com\/connect/g, `${WEB}/connect`)
    .replace(/https:\/\/(?:www\.|app\.)?kiwiply\.com\/(?:dashboard|pricing)/g, `${WEB}/`)
    .replace(/https:\/\/api\.kiwiply\.com/g, API || WEB)
    .replace(/https:\/\/\*\.kiwiply\.com\/\*/g, `${WEB}/*`)
    .replace(/https:\/\/(?:www\.|app\.)?kiwiply\.com/g, WEB)
    .replace(/\.kiwiply\.com/g, `.${new URL(WEB).hostname}`)
    .replace(/kiwiply\.com(?:\/[a-z][a-z/-]*)?/gi, SITE)
    .replace(/Kiwiply AI/g, `${SHORT} AI`)
    .replace(/Kiwiply/g, NAME);
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => kept[Number(i)]);
}
/** What would still show "Kiwiply" after the pass (internal names excluded): the build fails on any. */
function leftovers(src) {
  return [...src.replace(KEEP, "").matchAll(/.{0,50}kiwiply.{0,40}/gi)].map((x) => x[0]);
}

let cssFiles = 0;
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const left = [];
for (const f of walk(OUT)) {
  if (f.endsWith(".css")) {
    writeFileSync(f, readFileSync(f, "utf8") + css);
    cssFiles++;
  }
  if (/\.(js|html|json)$/.test(f)) {
    const before = readFileSync(f, "utf8");
    let after = before.replaceAll("Prepared by Kiwiply", `Prepared by ${NAME}`);
    if (WEB) after = whiteLabel(after);
    if (after !== before) writeFileSync(f, after);
    if (WEB) for (const l of leftovers(after)) left.push(`${f.slice(OUT.length + 1)}: ${l}`);
  }
  if (WEB && /kiwiply/i.test(basename(f))) left.push(`file name: ${f.slice(OUT.length + 1)}`);
}
if (WEB && left.length) {
  console.error(`"Kiwiply" is still visible in ${left.length} place(s):\n  ${left.slice(0, 40).join("\n  ")}`);
  process.exit(1);
}

// ---- icons and logos, drawn from the organization's mark in a headless browser ----------------------------------------------------------
const logoData = `data:image/png;base64,${readFileSync(LOGO).toString("base64")}`;
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome" });
const page = await browser.newPage({ deviceScaleFactor: 1 });
async function shoot(html, width, height, file) {
  await page.setViewportSize({ width, height });
  await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${html}</body></html>`);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
  await page.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width, height } });
}
for (const size of [16, 48, 128]) await shoot(`<img src="${logoData}" style="width:${size}px;height:${size}px;display:block">`, size, size, join(OUT, "icons", `icon${size}.png`));
await shoot(`<img src="${logoData}" style="width:128px;height:128px;display:block">`, 128, 128, join(OUT, "icons", "logo-icon.png"));
const lockup = (color) =>
  `<div style="display:flex;align-items:center;gap:14px;height:96px;font:700 52px/1 'Segoe UI',Inter,Arial,sans-serif;color:${color};white-space:nowrap">` +
  `<img src="${logoData}" style="width:84px;height:84px;border-radius:14px">${NAME.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</div>`;
const lockupWidth = Math.ceil(110 + NAME.length * 31);
await shoot(lockup("#1f2937"), lockupWidth, 96, join(OUT, "icons", "logo.png"));
await shoot(lockup("#f3f4f6"), lockupWidth, 96, join(OUT, "icons", "logo-dark-mode.png"));
await browser.close();

console.log(`branded "${NAME}" build: ${OUT}`);
console.log(`  name: ${m.name} | colour ${PRIMARY} (${cssFiles} stylesheets) | icons + logos from ${basename(LOGO)}`);
console.log(`  load it unpacked in Chrome (chrome://extensions, Developer mode, Load unpacked). Same extension ID as the build it came from.`);
