/* fixture-scrub.js — deterministic, local-only scrubber for ATS HTML fixtures.
 *
 * It keeps the structure the matcher reads while removing executable content, control values,
 * third-party URLs, and the synthetic capture's accidental PII. It never uploads or mutates the
 * source file; callers choose where to write the returned HTML.
 */
const { JSDOM } = require("jsdom");

const MAX_BYTES = 1.5 * 1024 * 1024;
const DEFAULT_PERSONA = {
  email: "synthetic@example.test",
  phone: "555-0100",
  name: "Synthetic Candidate",
};

function scrubText(text, replacements) {
  let out = String(text || "");
  out = out.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, replacements.email);
  out = out.replace(/(?:\+?\d[\d .()\-]{7,}\d)/g, replacements.phone);
  for (const [from, to] of Object.entries(replacements)) {
    if (from === "email" || from === "phone" || from === "name") continue;
    if (from) out = out.split(from).join(to);
  }
  return out;
}

function scrubHtml(html, options) {
  const opts = options || {};
  const raw = String(html || "");
  const maxBytes = opts.maxBytes == null ? MAX_BYTES : opts.maxBytes;
  if (Buffer.byteLength(raw, "utf8") > maxBytes) throw new Error(`fixture exceeds ${maxBytes} bytes`);

  const origin = new URL(opts.origin || "https://fixture.invalid");
  const replacements = { ...DEFAULT_PERSONA, ...(opts.replacements || {}) };
  const dom = new JSDOM(raw, { url: origin.href });
  const doc = dom.window.document;

  doc.querySelectorAll("script, link[rel~='preload']").forEach((el) => el.remove());
  for (const el of Array.from(doc.querySelectorAll("*"))) {
    for (const attr of Array.from(el.attributes || [])) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on")) { el.removeAttribute(attr.name); continue; }
      if (/data:[^,;]+;base64,/i.test(attr.value)) {
        el.setAttribute(attr.name, "about:blank");
        continue;
      }
      if (name !== "src" && name !== "href") continue;
      const value = attr.value.trim();
      let external = false;
      try {
        const url = new URL(value, origin.href);
        external = url.protocol === "data:" || url.protocol === "javascript:" || url.host !== origin.host;
      } catch (e) { external = true; }
      if (external || /^data:/i.test(value) || /^javascript:/i.test(value)) el.setAttribute(attr.name, "about:blank");
    }

    const tag = el.tagName.toLowerCase();
    if (tag === "input") {
      el.removeAttribute("value");
      el.removeAttribute("checked");
    } else if (tag === "textarea") {
      el.textContent = "";
    } else if (tag === "select") {
      el.removeAttribute("value");
      el.querySelectorAll("option[selected]").forEach((option) => option.removeAttribute("selected"));
    }
  }

  const walker = doc.createTreeWalker(doc.body || doc, dom.window.NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);
  for (const node of textNodes) {
    if (node.parentElement && node.parentElement.closest("option")) continue;
    node.nodeValue = scrubText(node.nodeValue, replacements);
  }

  const output = dom.serialize();
  if (Buffer.byteLength(output, "utf8") > maxBytes) throw new Error(`scrubbed fixture exceeds ${maxBytes} bytes`);
  return output;
}

if (require.main === module) {
  const fs = require("fs");
  const path = require("path");
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error("usage: node scripts/fixture-scrub.js input.html output.html");
  const html = scrubHtml(fs.readFileSync(input, "utf8"), { origin: "https://fixture.invalid" });
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, html);
}

module.exports = { MAX_BYTES, scrubHtml };
