/**
 * The small Markdown subset a tenant policy is written in (docs/enterprise-v2/62): headings (`#` to `###`), paragraphs, bullet and numbered
 * lists, `**bold**`, `*italic*` and `[text](target)` links. It is parsed to a plain tree and rendered to React elements, never to an HTML
 * string, so nothing in a policy can inject markup. The API refuses HTML, images and unsafe links when the text is saved; this parser applies
 * the same link rule again (defence in depth): a target other than `https:`, `mailto:`, a same-host path or an in-page anchor is shown as
 * plain text.
 */
export type Inline =
  | { t: "text"; v: string }
  | { t: "bold"; c: Inline[] }
  | { t: "italic"; c: Inline[] }
  | { t: "link"; href: string; c: Inline[] };

export type Block =
  | { t: "heading"; level: 1 | 2 | 3; c: Inline[] }
  | { t: "p"; c: Inline[] }
  | { t: "ul"; items: Inline[][] }
  | { t: "ol"; items: Inline[][] };

/** Whether a link target may be clickable. Mirrors the API's rule (`PolicyBodySanitizer.allowedTarget`). */
export function safeHref(target: string): boolean {
  const t = target.trim();
  if (!t) return false;
  const lower = t.toLowerCase();
  if (lower.startsWith("https://") || lower.startsWith("mailto:")) return true;
  if (t.startsWith("//")) return false;
  return t.startsWith("/") || t.startsWith("#");
}

const LINK = /^\[([^\]]*)\]\(\s*((?:[^()\s]|\([^()]*\))*)(?:\s+[^)]*)?\)/;

/** Inline parse. Unbalanced markers are literal text. Depth is bounded by the nesting of `**` / `*` / `[ ]`, itself bounded by the line length. */
export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let text = "";
  const flush = () => {
    if (text) out.push({ t: "text", v: text });
    text = "";
  };
  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);
    if (rest.startsWith("**")) {
      const end = src.indexOf("**", i + 2);
      if (end > i + 2) {
        flush();
        out.push({ t: "bold", c: parseInline(src.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    } else if (rest[0] === "*" || rest[0] === "_") {
      const mark = rest[0];
      const end = src.indexOf(mark, i + 1);
      const prev = i === 0 ? " " : src[i - 1];
      if (end > i + 1 && (mark === "*" || !/\w/.test(prev))) {
        flush();
        out.push({ t: "italic", c: parseInline(src.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    } else if (rest[0] === "[") {
      const m = LINK.exec(rest);
      if (m) {
        flush();
        if (safeHref(m[2])) out.push({ t: "link", href: m[2].trim(), c: parseInline(m[1]) });
        else out.push({ t: "text", v: m[1] });
        i += m[0].length;
        continue;
      }
    }
    text += src[i];
    i += 1;
  }
  flush();
  return out;
}

/** Block parse: blank lines separate blocks; consecutive list lines form one list; consecutive text lines are one paragraph. */
export function parsePolicy(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flushPara = () => {
    if (para.length) blocks.push({ t: "p", c: parseInline(para.join(" ")) });
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push({ t: list.ordered ? "ol" : "ul", items: list.items.map(parseInline) });
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushPara();
      flushList();
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      flushPara();
      flushList();
      blocks.push({ t: "heading", level: h[1].length as 1 | 2 | 3, c: parseInline(h[2].trim()) });
      continue;
    }
    const li = /^\s*(?:([-*+])|(\d{1,3})[.)])\s+(.*)$/.exec(line);
    if (li) {
      flushPara();
      const ordered = li[2] !== undefined;
      if (list && list.ordered !== ordered) flushList();
      if (!list) list = { ordered, items: [] };
      list.items.push(li[3].trim());
      continue;
    }
    flushList();
    para.push(line.trim());
  }
  flushPara();
  flushList();
  return blocks;
}

/** The plain text of a block list (page descriptions, tests). */
export function plainText(blocks: Block[]): string {
  const inline = (c: Inline[]): string => c.map((x) => (x.t === "text" ? x.v : inline(x.c))).join("");
  return blocks.map((b) => (b.t === "ul" || b.t === "ol" ? b.items.map(inline).join(" ") : inline(b.c))).join(" ");
}

/** The first heading's text, if any. */
export function firstHeading(blocks: Block[]): string | null {
  const h = blocks.find((b) => b.t === "heading");
  return h && h.t === "heading" ? plainText([h]) : null;
}
