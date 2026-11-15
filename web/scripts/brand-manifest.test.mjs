// node --test web/scripts/brand-manifest.test.mjs — the manifest of an organization's own extension build (CUSTOM-DOMAINS-BUILD.md A6).
import { test } from "node:test";
import assert from "node:assert/strict";
import { brandManifest, origin, storeDescription } from "./brand-manifest.mjs";

const built = {
  name: "Kiwiply - Job Autofill",
  key: "MIIBIjANBgkq-public-key",
  description: "Fill job applications with Kiwiply.",
  action: { default_title: "Kiwiply" },
  host_permissions: ["https://*.myworkdayjobs.com/*", "https://api.kiwiply.com/*"],
  externally_connectable: { matches: ["https://kiwiply.com/*", "https://www.kiwiply.com/*", "https://app.kiwiply.com/*", "https://*.kiwiply.com/*"] },
  content_scripts: [
    { matches: ["https://*.myworkdayjobs.com/*"], js: ["content.js"] },
    { matches: ["https://*.kiwiply.com/*"], js: ["connect-relay.js"] },
  ],
  web_accessible_resources: [{ resources: ["panel.html"], matches: ["https://*.myworkdayjobs.com/*", "https://*.kiwiply.com/*"] }],
};

// A white-label build serves on the organization's own domains only: its Kiwiply subdomain would name Kiwiply in Chrome's install prompt.
const org = { name: "Aaruna Technologies", web: "https://careers.aaruna.com/", origins: ["https://jobs.aaruna.com"], api: "https://api.kiwiply.com" };

test("a white-label build lists the organization's own domains exactly and names no Kiwiply host", () => {
  const m = brandManifest(built, org);
  assert.equal(m.name, "Aaruna Technologies - Job Autofill");
  assert.deepEqual(m.externally_connectable.matches, ["https://careers.aaruna.com/*", "https://jobs.aaruna.com/*"]);
  assert.deepEqual(m.content_scripts[1].matches, m.externally_connectable.matches, "the relay runs exactly where connect is trusted");
  assert.deepEqual(m.content_scripts[0].matches, ["https://*.myworkdayjobs.com/*"], "the ATS scripts are untouched");
  assert.deepEqual(m.host_permissions, ["https://*.myworkdayjobs.com/*"], "Kiwiply's API needs no permission (CORS), so Chrome's prompt never names it");
  assert.deepEqual(m.web_accessible_resources[0].matches, ["https://*.myworkdayjobs.com/*"]);
  assert.ok(!/kiwiply/i.test(JSON.stringify(m)), "no Kiwiply anywhere in the manifest");
  assert.equal(m.key, undefined, "its own store item, not Kiwiply's ID");
});

test("the description carries the Chrome Web Store's white-label notice, within 132 characters", () => {
  const m = brandManifest(built, org);
  assert.match(m.description, /^THIS IS A WHITE LABEL ENTERPRISE EXTENSION FOR AARUNA TECHNOLOGIES\. /);
  assert.ok(m.description.length <= 132);
  assert.ok(storeDescription("A very long organization name that keeps going and going for a while").length <= 132);
});

test("an API of the organization's own is a host permission; a plain re-skin (no web) keeps every host", () => {
  const own = brandManifest(built, { ...org, api: "https://api.aaruna.com" });
  assert.ok(own.host_permissions.includes("https://api.aaruna.com/*"));
  const skin = brandManifest(built, { name: "Acme" });
  assert.deepEqual(skin.externally_connectable, built.externally_connectable);
  assert.equal(skin.key, built.key, "a dev re-skin keeps the ID");
  assert.match(skin.description, /^Fill job applications for Acme consultants/);
});

test("origins are normalised and anything that is not a web origin is refused", () => {
  assert.equal(origin("https://Careers.Aaruna.com/path/"), "https://careers.aaruna.com");
  assert.equal(origin(""), "");
  assert.throws(() => origin("ftp://x.example"));
});

test("the package zip holds every file at its relative path, deflated and readable back", async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const { inflateRawSync } = await import("node:zlib");
  const { zipFolder } = await import("./zip-folder.mjs");
  const dir = mkdtempSync(join(tmpdir(), "zip-"));
  mkdirSync(join(dir, "icons"));
  writeFileSync(join(dir, "manifest.json"), '{"name":"Aaruna Technologies - Job Autofill"}');
  writeFileSync(join(dir, "icons", "icon16.png"), Buffer.from([137, 80, 78, 71]));
  const out = `${dir}.zip`;
  assert.equal(zipFolder(dir, out), 2);
  const z = readFileSync(out);
  const end = z.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.equal(z.readUInt16LE(end + 10), 2, "two entries in the central directory");
  const names = [];
  let at = z.readUInt32LE(end + 16);
  for (let i = 0; i < 2; i++) {
    const n = z.readUInt16LE(at + 28);
    const local = z.readUInt32LE(at + 42);
    names.push(z.subarray(at + 46, at + 46 + n).toString("utf8"));
    if (i === 1) {
      const ln = z.readUInt16LE(local + 26);
      const size = z.readUInt32LE(local + 18);
      const data = inflateRawSync(z.subarray(local + 30 + ln, local + 30 + ln + size)).toString("utf8");
      assert.match(data, /Aaruna Technologies/);
    }
    at += 46 + n;
  }
  assert.deepEqual(names, ["icons/icon16.png", "manifest.json"], "forward slashes, manifest at the root");
});
