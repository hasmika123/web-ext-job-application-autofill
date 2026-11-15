#!/usr/bin/env node
/**
 * Make one organization's own extension package (CUSTOM-DOMAINS-BUILD.md A6, gap D8): a white-label build, zipped for its own UNLISTED Chrome Web
 * Store item, with the listing text alongside.
 *
 *   1. npm run build -w job-autofill                       (the production build: job-autofill/.output/chrome-mv3)
 *   2. on the organization's admin page, "Extension package" -> Download settings  (<slug>-extension.json)
 *   3. node web/scripts/package-org-extension.mjs --config <slug>-extension.json [--out <folder>] [--logo <png>] [--src <build>]
 *
 * The settings name the organization's live custom domains (the build serves there only, so no Kiwiply host is ever listed), its colour, its
 * published logo (fetched here from the public asset endpoint, picked by host) and the API, which stays Kiwiply's behind the scenes. --logo uses a
 * local PNG instead (the toolbar icon is drawn from it, so a square mark works best). Writes <out>/<slug>-extension/ (load it unpacked for a
 * pilot), <slug>-extension.zip (the store upload) and <slug>-extension-store-listing.txt. The branding pass stops if any "Kiwiply" is still visible.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
if (!args.config) {
  console.error("usage: node web/scripts/package-org-extension.mjs --config <slug>-extension.json [--out <folder>] [--logo <png>] [--src <build>]");
  process.exit(2);
}
const cfg = JSON.parse(readFileSync(resolve(args.config), "utf8"));
for (const k of ["slug", "name", "web", "api"]) if (!cfg[k]) throw new Error(`the settings have no "${k}" (download them again from the admin page)`);
const origins = (cfg.origins || []).filter((o) => o !== cfg.web);
if (/kiwiply/i.test([cfg.web, ...origins].join(" "))) throw new Error("a white-label build serves on the organization's own domains only");

const SRC = resolve(args.src || join(here, "../../job-autofill/.output/chrome-mv3"));
if (!existsSync(join(SRC, "manifest.json"))) {
  console.error(`no production build at ${SRC}: run "npm run build -w job-autofill" first`);
  process.exit(1);
}
const OUT_DIR = resolve(args.out || "org-extensions");
mkdirSync(OUT_DIR, { recursive: true });
const OUT = join(OUT_DIR, `${cfg.slug}-extension`);

let logo = args.logo ? resolve(args.logo) : "";
if (!logo) {
  if (!cfg.logo?.url) {
    console.error(`${cfg.name} has no published logo: publish one on its branding page, or pass --logo <png>`);
    process.exit(1);
  }
  const res = await fetch(cfg.logo.url, { headers: { "X-Kiwiply-Host": cfg.logo.host } });
  if (!res.ok) throw new Error(`the logo did not download (${res.status} from ${cfg.logo.url})`);
  const type = (res.headers.get("content-type") || "").toLowerCase();
  const ext = type.includes("svg") ? "svg" : type.includes("jpeg") ? "jpg" : type.includes("webp") ? "webp" : "png";
  logo = join(OUT_DIR, `${cfg.slug}-logo.${ext}`);
  writeFileSync(logo, Buffer.from(await res.arrayBuffer()));
}

const brand = [
  join(here, "brand-extension.mjs"),
  "--name", cfg.name,
  "--short", cfg.shortName || cfg.name.split(/\s+/)[0],
  "--logo", logo,
  "--web", cfg.web,
  "--api", cfg.api,
  "--src", SRC,
  "--out", OUT,
  "--zip", "yes",
  ...(origins.length ? ["--origins", origins.join(",")] : []),
  ...(cfg.primaryColor ? ["--primary", cfg.primaryColor] : []),
];
const run = spawnSync(process.execPath, brand, { stdio: "inherit" });
if (run.status !== 0) process.exit(run.status ?? 1);
console.log(`\nNext: upload ${OUT}.zip as a NEW item in the Chrome Web Store developer dashboard, set Visibility to Unlisted, paste the text from`);
console.log(`${OUT}-store-listing.txt, and send ${cfg.name} the item's link once it is approved.`);
