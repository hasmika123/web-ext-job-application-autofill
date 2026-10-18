/**
 * Deterministic JSON writer + canonical form + content hash - the TypeScript twin of
 * `ResumeDocumentJson` and `ResumeDocumentCanonical`. It exists so Java and TS agree byte for byte.
 *
 * Writer rules: object keys in insertion order (or sorted when `canonical`); compact when
 * `indent == 0`, otherwise `JSON.stringify(x, null, indent)` layout (`"key": value`, `[]`, `{}`,
 * `\n` newlines, no trailing newline). Strings escape `"` `\` and `\b \f \n \r \t`; any other char
 * below U+0020 and any lone UTF-16 surrogate is `\u` + four LOWERCASE hex digits; everything else
 * (U+007F, U+2028, U+2029, all non-ASCII) is raw. Numbers are plain decimal integers.
 *
 * Canonical form: every string value trimmed with `trimWs`, every object's keys sorted ascending by
 * UTF-16 code unit (default `Array.prototype.sort`), arrays kept in order - except an array under the
 * key `marks` whose elements are all `{s, e, t}` objects, which is sorted by (s, e, t) - compact output,
 * UTF-8, no trailing newline. `contentHash` = lowercase-hex SHA-256 of those bytes.
 */
import { trimWs, isObject, type Json } from "./doc";

export interface WriteOptions {
  /** 0 = compact. */
  indent?: number;
  /** Trim string values and sort object keys (the canonical form). */
  canonical?: boolean;
}

export function writeJson(value: Json, opts: WriteOptions = {}): string {
  const out: string[] = [];
  write(out, value, opts.indent ?? 0, 0, opts.canonical === true);
  return out.join("");
}

/** The canonical compact JSON text of a document. */
export function canonicalJson(doc: Json): string {
  return writeJson(doc, { canonical: true });
}

/** Lowercase-hex SHA-256 of the canonical UTF-8 bytes (uses Web Crypto: browsers, Node 20+, Chromium). */
export async function contentHash(doc: Json): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(doc));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  let hex = "";
  for (const b of new Uint8Array(digest)) hex += b.toString(16).padStart(2, "0");
  return hex;
}

/**
 * The render hash of a built resume (DESIGN 8.5) - twin of Java `ResumeRenderHash.compute`:
 * `sha256(contentHash + "|" + templateId + "|" + canonicalJson(theme))`, lowercase hex. An absent or
 * null theme is `{}`. The stored PDF is out of date exactly when its hash differs from this.
 */
export async function renderHash(contentHashValue: string, templateId: string, theme: Json | undefined): Promise<string> {
  const themeJson = theme === null || theme === undefined ? "{}" : canonicalJson(theme);
  const bytes = new TextEncoder().encode(`${contentHashValue}|${templateId}|${themeJson}`);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  let hex = "";
  for (const b of new Uint8Array(digest)) hex += b.toString(16).padStart(2, "0");
  return hex;
}

function newline(out: string[], indent: number, depth: number): void {
  if (indent <= 0) return;
  out.push("\n", " ".repeat(indent * depth));
}

function write(out: string[], v: Json, indent: number, depth: number, canonical: boolean): void {
  if (v === null || v === undefined) {
    out.push("null");
  } else if (typeof v === "string") {
    string(out, canonical ? trimWs(v) : v);
  } else if (typeof v === "boolean") {
    out.push(v ? "true" : "false");
  } else if (typeof v === "number") {
    out.push(Number.isFinite(v) ? String(v) : "null");
  } else if (Array.isArray(v)) {
    if (v.length === 0) {
      out.push("[]");
      return;
    }
    out.push("[");
    v.forEach((child, i) => {
      if (i > 0) out.push(",");
      newline(out, indent, depth + 1);
      write(out, child, indent, depth + 1, canonical);
    });
    newline(out, indent, depth);
    out.push("]");
  } else if (isObject(v)) {
    const keys = Object.keys(v);
    if (canonical) keys.sort();
    if (keys.length === 0) {
      out.push("{}");
      return;
    }
    out.push("{");
    keys.forEach((k, i) => {
      if (i > 0) out.push(",");
      newline(out, indent, depth + 1);
      string(out, k);
      out.push(indent > 0 ? ": " : ":");
      write(out, canonical && k === "marks" ? sortedMarks(v[k]) : v[k], indent, depth + 1, canonical);
    });
    newline(out, indent, depth);
    out.push("}");
  } else {
    out.push("null");
  }
}

const isInt32 = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= -2147483648 && n <= 2147483647;

/** A well-formed mark list sorted by (s, e, t); anything else is returned as it is (mirrors the Java canonicaliser). */
function sortedMarks(v: Json): Json {
  if (!Array.isArray(v)) return v;
  for (const m of v) {
    if (!isObject(m) || !isInt32(m.s) || !isInt32(m.e) || typeof m.t !== "string") return v;
  }
  const list = v as Array<{ s: number; e: number; t: string }>;
  // `t` is compared as the canonical (trimmed) value, like the Java side, which sorts after trimming.
  return [...list].sort((a, b) => {
    const ta = trimWs(a.t);
    const tb = trimWs(b.t);
    return a.s - b.s || a.e - b.e || (ta < tb ? -1 : ta > tb ? 1 : 0);
  });
}

function unicode(c: number): string {
  return "\\u" + c.toString(16).padStart(4, "0");
}

function string(out: string[], s: string): void {
  let r = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x22) r += '\\"';
    else if (c === 0x5c) r += "\\\\";
    else if (c === 0x08) r += "\\b";
    else if (c === 0x0c) r += "\\f";
    else if (c === 0x0a) r += "\\n";
    else if (c === 0x0d) r += "\\r";
    else if (c === 0x09) r += "\\t";
    else if (c < 0x20) r += unicode(c);
    else if (c >= 0xd800 && c <= 0xdbff) {
      const next = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
      if (next >= 0xdc00 && next <= 0xdfff) {
        r += s[i] + s[i + 1];
        i++;
      } else {
        r += unicode(c);
      }
    } else if (c >= 0xdc00 && c <= 0xdfff) r += unicode(c);
    else r += s[i];
  }
  out.push(r + '"');
}
