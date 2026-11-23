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
const TEXT_ATTRIBUTES = new Set([
  "alt",
  "title",
  "placeholder",
  "aria-label",
  "aria-description",
  "aria-valuetext",
  "data-label",
  "data-name",
]);
const URL_ATTRIBUTES = new Set(["src", "href", "action", "formaction", "poster", "cite", "background", "manifest"]);

function scrubUrl(value, origin) {
  const raw = String(value || "").trim();
  if (!raw) return raw;
  if (/^(?:data|javascript|vbscript|blob):/i.test(raw)) return "about:blank";
  try {
    const url = new URL(raw, origin.href);
    if (url.protocol !== origin.protocol || url.host !== origin.host) return "about:blank";
    url.search = "";
    url.hash = "";
    return url.href;
  } catch (e) {
    return "about:blank";
  }
}

function scrubSrcset(value, origin) {
  return String(value || "").split(",").map((candidate) => {
    const match = candidate.trim().match(/^(\S+)(.*)$/);
    return match ? scrubUrl(match[1], origin) + match[2] : "";
  }).filter(Boolean).join(", ");
}

function scrubMetaContent(value, origin) {
  const raw = String(value || "");
  const refresh = raw.match(/^(\s*\d+\s*;\s*url\s*=\s*)(.*)$/i);
  return refresh ? refresh[1] + scrubUrl(refresh[2].trim(), origin) : scrubUrl(raw, origin);
}

function scrubStyle(value, origin) {
  return String(value || "").replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (whole, quote, url) => `url(${quote}${scrubUrl(url, origin)}${quote})`);
}

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

  doc.querySelectorAll("script, style, link[rel~='preload']").forEach((el) => el.remove());
  for (const el of Array.from(doc.querySelectorAll("*"))) {
    const tag = el.tagName.toLowerCase();
    for (const attr of Array.from(el.attributes || [])) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on")) { el.removeAttribute(attr.name); continue; }
      if (name === "data-cfemail") { el.removeAttribute(attr.name); continue; }
      if (/data:[^,;]+;base64,/i.test(attr.value)) {
        el.setAttribute(attr.name, "about:blank");
        continue;
      }
      if (name === "srcset" || name === "imagesrcset") {
        el.setAttribute(attr.name, scrubSrcset(attr.value, origin));
        continue;
      }
      if (name === "style") {
        el.setAttribute(attr.name, scrubStyle(attr.value, origin));
        continue;
      }
      if (URL_ATTRIBUTES.has(name)) {
        el.setAttribute(attr.name, scrubUrl(attr.value, origin));
        continue;
      }
      if (name === "content" && tag === "meta" && (/(?:url|image|refresh|logo)/i.test(`${el.getAttribute("property") || ""} ${el.getAttribute("name") || ""} ${el.getAttribute("itemprop") || ""} ${el.getAttribute("http-equiv") || ""}`) || /^(?:https?|data|javascript):/i.test(attr.value.trim()))) {
        el.setAttribute(attr.name, scrubMetaContent(attr.value, origin));
        continue;
      }
      if (TEXT_ATTRIBUTES.has(name)) {
        el.setAttribute(attr.name, scrubText(attr.value, replacements));
        continue;
      }
    }

    if (tag === "input") {
      el.removeAttribute("value");
      el.removeAttribute("checked");
    } else if (tag === "button" || tag === "option") {
      el.removeAttribute("value");
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

  const comments = [];
  const commentWalker = doc.createTreeWalker(doc, dom.window.NodeFilter.SHOW_COMMENT);
  while (commentWalker.nextNode()) comments.push(commentWalker.currentNode);
  comments.forEach((comment) => comment.remove());

  const output = dom.serialize();
  if (Buffer.byteLength(output, "utf8") > maxBytes) throw new Error(`scrubbed fixture exceeds ${maxBytes} bytes`);
  return output;
}

if (require.main === module) {
  const fs = require("fs");
  const path = require("path");
  const [input, output, replacementsJson] = process.argv.slice(2);
  if (!input || !output) throw new Error("usage: node scripts/fixture-scrub.js input.html output.html");
  let replacements = {};
  if (replacementsJson) {
    try { replacements = JSON.parse(replacementsJson); } catch (e) { throw new Error("replacements must be a JSON object"); }
  }
  const html = scrubHtml(fs.readFileSync(input, "utf8"), { origin: "https://fixture.invalid", replacements });
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, html);
}

module.exports = { MAX_BYTES, scrubHtml };
