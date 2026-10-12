/**
 * The editor reducer (DESIGN 7.2, 10.5): pure functions from `(state, action)` to the next state. Every
 * document edit goes through `commit`, which records an undo step (coalescing typing per field) and
 * bumps `rev`; autosave compares `rev` with `savedRev` to know whether there is anything to save.
 *
 * Limits are the builder config's (`config.limits`, settings `resume.doc.limits.*`), passed at init and
 * carried in the state; `DEFAULT_LIMITS` (the API's declared defaults) is the fallback. The reducer
 * clamps instead of rejecting, so a paste can never produce a document the API would answer 422 to:
 * the section / item / bullet counts, the bullet and summary lengths, and the schema's own short-field
 * lengths (DESIGN 3.1). Structural actions (add / remove / hide / move / duplicate) are one history
 * entry each; typing coalesces per field.
 */
import { RESUME_DEFAULT_SECTION_TITLES, shiftMarks } from "@kiwiply/ui";
import type { ResumeBullet, ResumeDocument, ResumeMark, ResumeSection, ResumeSectionKind, ResumeTheme } from "@kiwiply/ui";
import { DEFAULT_BUILDER_CONFIG } from "@/lib/resume-builder-config.shared";
import { canRedo, canUndo, createHistory, record, redo, undo } from "./history";
import type { BasicsField, DocLimits, EditorAction, EditorState, ItemTextField, SaveStatus, TextRef } from "./types";

/** The API's declared limits: the fallback when the config does not carry them. */
export const DEFAULT_LIMITS: DocLimits = DEFAULT_BUILDER_CONFIG.limits;
export const MAX_ITEMS = DEFAULT_LIMITS.items;
export const MAX_BULLETS = DEFAULT_LIMITS.bullets;
export const MAX_BULLET_CHARS = DEFAULT_LIMITS.bulletChars;
export const MAX_SUMMARY_CHARS = DEFAULT_LIMITS.summaryChars;
// config-literal-ok: short-field maxLength is a schema constant (DESIGN 3.1), not a settings key
export const MAX_SHORT_CHARS = 200;
// config-literal-ok: link url maxLength is a schema constant (DESIGN 3.1)
export const MAX_URL_CHARS = 2048;
/** INTERESTS text (DESIGN 3.2), the section label (DESIGN 3.1), links per header (DESIGN 10.5), skills per group / chars per skill (DESIGN 10.5). */
export const MAX_INTEREST_CHARS = 80;
export const MAX_TITLE_CHARS = 60;
export const MAX_LINKS = 8;
export const MAX_SKILLS = 40;
export const MAX_SKILL_CHARS = 60;

/** `maxLength` of each header field: DESIGN 3.1, tightened to the validator's 200 where it is lower (the e-mail). */
// config-literal-ok: header field lengths are schema constants (DESIGN 3.1), not settings keys
export const BASICS_MAX: Record<BasicsField, number> = { name: 100, headline: 120, email: MAX_SHORT_CHARS, phone: 40, location: 120 };

export interface InitialEditorInput {
  doc: ResumeDocument;
  templateId: string;
  theme: Partial<ResumeTheme> | null;
  docVersion: number;
  /** `config.limits`; absent = {@link DEFAULT_LIMITS}. */
  limits?: DocLimits;
}

export function initEditorState(input: InitialEditorInput): EditorState {
  return {
    history: createHistory(input.doc),
    theme: input.theme,
    templateId: input.templateId,
    docVersion: input.docVersion,
    rev: 0,
    savedRev: 0,
    savedAt: null,
    phase: "idle",
    error: null,
    errorPath: null,
    limits: input.limits ?? DEFAULT_LIMITS,
    conflict: null,
  };
}

/* ── selectors ────────────────────────────────────────────────────────────────────────────── */

export const currentDoc = (s: EditorState): ResumeDocument => s.history.present;
export const hasUnsaved = (s: EditorState): boolean => s.rev > s.savedRev;
export const canUndoEdit = (s: EditorState): boolean => canUndo(s.history);
export const canRedoEdit = (s: EditorState): boolean => canRedo(s.history);

/** The one word the top bar renders ("saved" / "saving" / ...). Unsaved-but-not-yet-sent reads as saving. */
export function saveStatus(s: EditorState): SaveStatus {
  if (s.phase === "conflict") return "conflict";
  if (s.phase === "error") return "error";
  if (s.phase === "retrying") return "retrying";
  if (s.phase === "saving" || hasUnsaved(s)) return "saving";
  return "saved";
}

/* ── document helpers (immutable; untouched branches keep their identity) ─────────────────── */

type AnyItem = Record<string, unknown> & { id: string; bullets?: ResumeBullet[]; marks?: ResumeMark[] };

/** Section kinds whose items carry bullets (DESIGN 3.2). */
const WITH_BULLETS: ReadonlySet<ResumeSectionKind> = new Set(["EXPERIENCE", "EDUCATION", "PROJECTS", "CUSTOM"]);
/** Kinds whose newest item goes on top (a timeline); the rest append. */
const NEWEST_FIRST: ReadonlySet<ResumeSectionKind> = new Set(["EXPERIENCE", "EDUCATION", "PROJECTS", "CUSTOM"]);
const DATE_FIELDS: ReadonlySet<string> = new Set(["start", "end", "date"]);

function mapSection(doc: ResumeDocument, sectionId: string, fn: (s: ResumeSection) => ResumeSection): ResumeDocument {
  let changed = false;
  const sections = doc.sections.map((s) => {
    if (s.id !== sectionId) return s;
    const next = fn(s);
    if (next !== s) changed = true;
    return next;
  });
  return changed ? { ...doc, sections } : doc;
}

function withItems(section: ResumeSection, items: unknown[]): ResumeSection {
  return { ...section, items } as ResumeSection;
}

function mapItem(
  doc: ResumeDocument,
  sectionId: string,
  itemId: string,
  fn: (item: AnyItem, section: ResumeSection) => AnyItem,
): ResumeDocument {
  return mapSection(doc, sectionId, (s) => {
    let changed = false;
    const items = (s.items as AnyItem[]).map((it) => {
      if (it.id !== itemId) return it;
      const next = fn(it, s);
      if (next !== it) changed = true;
      return next;
    });
    return changed ? withItems(s, items) : s;
  });
}

function mapBullets(
  doc: ResumeDocument,
  sectionId: string,
  itemId: string,
  fn: (bullets: ResumeBullet[]) => ResumeBullet[],
): ResumeDocument {
  return mapItem(doc, sectionId, itemId, (it) => {
    const before = it.bullets ?? [];
    const after = fn(before);
    return after === before ? it : { ...it, bullets: after };
  });
}

const clamp = (s: string, max: number) => (s.length > max ? s.slice(0, max) : s);

/** `arr` with the element at `from` moved to `to` (both clamped); the same array when nothing moves. */
function moveIn<T>(arr: readonly T[], from: number, to: number): readonly T[] {
  if (from < 0 || from >= arr.length) return arr;
  const target = Math.max(0, Math.min(arr.length - 1, to));
  if (target === from) return arr;
  const out = arr.slice();
  const [x] = out.splice(from, 1);
  out.splice(target, 0, x);
  return out;
}

/* ── marks that follow the text (DESIGN 3.3: a text edit never leaves a mark outside its text) ─ */

/** Drops marks that no longer sit inside `len` characters (clips the ones that overhang). */
function fitMarks(marks: readonly ResumeMark[], len: number, max: number): ResumeMark[] {
  const out: ResumeMark[] = [];
  for (const m of marks) {
    const e = Math.min(m.e, len);
    if (e > m.s) out.push(e === m.e ? m : { ...m, e });
  }
  return out.slice(0, max);
}

/** Re-bases `marks` from `oldText` to `newText` by the common prefix / suffix (exact for a single-caret edit or a paste). */
function rebaseMarks(oldText: string, newText: string, marks: readonly ResumeMark[], max: number): ResumeMark[] {
  if (marks.length === 0 || oldText === newText) return fitMarks(marks, newText.length, max);
  let p = 0;
  const limit = Math.min(oldText.length, newText.length);
  while (p < limit && oldText.charCodeAt(p) === newText.charCodeAt(p)) p++;
  let q = 0;
  while (q < limit - p && oldText.charCodeAt(oldText.length - 1 - q) === newText.charCodeAt(newText.length - 1 - q)) q++;
  const shifted = shiftMarks(marks, p, oldText.length - p - q, newText.length - p - q);
  return fitMarks(shifted, newText.length, max);
}

/** The marks of `text[from, to)`, shifted to start at 0. */
function sliceMarks(marks: readonly ResumeMark[], from: number, to: number): ResumeMark[] {
  const out: ResumeMark[] = [];
  for (const m of marks) {
    const s = Math.max(m.s, from);
    const e = Math.min(m.e, to);
    if (e > s) out.push({ ...m, s: s - from, e: e - from });
  }
  return out;
}

/** `obj` with `marks` set, or the key removed when there are none (an absent key is the canonical "no marks"). */
function withMarks<T extends object>(obj: T, marks: readonly ResumeMark[] | undefined): T {
  const had = (obj as { marks?: ResumeMark[] }).marks;
  if (marks && marks.length > 0) return { ...obj, marks: marks.slice() };
  if (had === undefined) return obj;
  const { marks: _drop, ...rest } = obj as T & { marks?: ResumeMark[] };
  void _drop;
  return rest as T;
}

/** The marks an edit leaves on a text: those the caller computed (the toolbar), else the old ones re-based. */
function nextMarks(oldText: string, newText: string, old: ResumeMark[] | undefined, given: ResumeMark[] | undefined, max: number) {
  if (given) return fitMarks(given, newText.length, max);
  return old && old.length > 0 ? rebaseMarks(oldText, newText, old, max) : undefined;
}

/* ── new items, by kind ───────────────────────────────────────────────────────────────────── */

function newItem(kind: ResumeSectionKind, itemId: string, bulletId: string): AnyItem | null {
  const bullet = [{ id: bulletId, text: "", src: "user" as const }];
  switch (kind) {
    case "EXPERIENCE":
    case "CUSTOM":
      return { id: itemId, title: "", org: "", start: null, end: null, current: false, bullets: bullet };
    case "EDUCATION":
      return { id: itemId, school: "", degree: "", field: "", location: "", start: null, end: null, gpa: "", bullets: [] };
    case "PROJECTS":
      return { id: itemId, title: "", url: "", start: null, end: null, bullets: bullet };
    case "SKILLS":
      return { id: itemId, group: "", skills: [] };
    case "CERTIFICATIONS":
      return { id: itemId, title: "", org: "", date: null, url: "" };
    case "LANGUAGES":
      return { id: itemId, name: "", level: "" };
    case "ACHIEVEMENTS":
      return { id: itemId, text: "", date: null };
    case "INTERESTS":
      return { id: itemId, text: "" };
    case "SUMMARY":
      return null; // the summary's one item is created by its first edit (`summary/edit`)
  }
}

/** The longest value `field` may hold in a section of `kind`. */
function maxFor(field: ItemTextField, kind: ResumeSectionKind, limits: DocLimits): number {
  if (field === "url") return MAX_URL_CHARS;
  if (field === "text") return kind === "INTERESTS" ? MAX_INTEREST_CHARS : limits.bulletChars;
  return MAX_SHORT_CHARS;
}

type EditAction = Exclude<EditorAction, { type: `save/${string}` | `conflict/${string}` | `history/${string}` | `presentation/${string}` }>;

/** The next document for an edit action, or the same `doc` when it is a no-op. */
function applyEdit(doc: ResumeDocument, a: EditAction, limits: DocLimits): ResumeDocument {
  switch (a.type) {
    case "title/edit": {
      const title = clamp(a.title, MAX_SHORT_CHARS);
      return doc.meta.title === title ? doc : { ...doc, meta: { ...doc.meta, title } };
    }

    /* ── header ─────────────────────────────────────────────────────────────────────── */
    case "basics/field": {
      const value = clamp(a.value, BASICS_MAX[a.field]);
      return (doc.basics[a.field] ?? "") === value ? doc : { ...doc, basics: { ...doc.basics, [a.field]: value } };
    }

    case "basics/link.add": {
      const links = doc.basics.links ?? [];
      if (links.length >= MAX_LINKS) return doc;
      return { ...doc, basics: { ...doc.basics, links: [...links, { label: null, url: "" }] } };
    }

    case "basics/link.edit": {
      const links = doc.basics.links ?? [];
      const link = links[a.index];
      if (!link) return doc;
      const value = clamp(a.value, a.field === "url" ? MAX_URL_CHARS : MAX_SHORT_CHARS);
      if ((link[a.field] ?? "") === value) return doc;
      return { ...doc, basics: { ...doc.basics, links: links.map((l, i) => (i === a.index ? { ...l, [a.field]: value } : l)) } };
    }

    case "basics/link.remove": {
      const links = doc.basics.links ?? [];
      if (a.index < 0 || a.index >= links.length) return doc;
      return { ...doc, basics: { ...doc.basics, links: links.filter((_, i) => i !== a.index) } };
    }

    /* ── sections ───────────────────────────────────────────────────────────────────── */
    case "section/add": {
      if (doc.sections.length >= limits.sections) return doc;
      if (a.kind !== "CUSTOM" && doc.sections.some((s) => s.kind === a.kind)) return doc; // one section per kind except CUSTOM
      if (doc.sections.some((s) => s.id === a.sectionId)) return doc;
      // A custom section must have a title (the validator rejects an untitled one): default to the kind's.
      const title = a.kind === "CUSTOM" ? clamp(a.title?.trim() || RESUME_DEFAULT_SECTION_TITLES.CUSTOM, MAX_TITLE_CHARS) : a.title ? clamp(a.title, MAX_TITLE_CHARS) : undefined;
      const section = { id: a.sectionId, kind: a.kind, ...(title ? { title } : {}), items: [] } as ResumeSection;
      return { ...doc, sections: [...doc.sections, section] };
    }

    case "section/remove": {
      const sections = doc.sections.filter((s) => s.id !== a.sectionId);
      return sections.length === doc.sections.length ? doc : { ...doc, sections };
    }

    case "section/hide":
      return mapSection(doc, a.sectionId, (s) => ((s.hidden ?? false) === a.hidden ? s : { ...s, hidden: a.hidden }));

    case "section/rename":
      return mapSection(doc, a.sectionId, (s) => {
        const raw = a.title === null ? "" : clamp(a.title, MAX_TITLE_CHARS);
        if (s.kind === "CUSTOM") {
          if (raw.trim() === "") return s; // a custom section keeps a title
          return s.title === raw ? s : { ...s, title: raw };
        }
        if (raw.trim() === "") {
          if (s.title == null) return s;
          const { title: _drop, ...rest } = s;
          void _drop;
          return rest as ResumeSection;
        }
        return s.title === raw ? s : { ...s, title: raw };
      });

    case "section/move": {
      const from = doc.sections.findIndex((s) => s.id === a.sectionId);
      const sections = moveIn(doc.sections, from, a.to);
      return sections === doc.sections ? doc : { ...doc, sections: sections as ResumeSection[] };
    }

    /* ── summary ────────────────────────────────────────────────────────────────────── */
    case "summary/edit": {
      const text = clamp(a.text, limits.summaryChars);
      return mapSection(doc, a.sectionId, (s) => {
        if (s.kind !== "SUMMARY") return s;
        const first = s.items[0];
        if (!first) return { ...s, items: [withMarks({ id: a.newItemId, text, src: "user" as const }, a.marks && fitMarks(a.marks, text.length, limits.marks))] };
        if (first.text === text && !a.marks) return s;
        const marks = nextMarks(first.text ?? "", text, first.marks, a.marks, limits.marks);
        return { ...s, items: [withMarks({ ...first, text, src: "user" as const }, marks), ...s.items.slice(1)] };
      });
    }

    /* ── items ──────────────────────────────────────────────────────────────────────── */
    case "item/field": {
      return mapItem(doc, a.sectionId, a.itemId, (it, section) => {
        const raw = clamp(a.value, maxFor(a.field, section.kind, limits));
        const value = DATE_FIELDS.has(a.field) ? raw || null : raw;
        if (it[a.field] === value || (value === "" && (it[a.field] ?? "") === "")) return it;
        if (a.field === "text" && section.kind === "ACHIEVEMENTS") {
          const old = typeof it.text === "string" ? it.text : "";
          return withMarks({ ...it, text: value }, nextMarks(old, raw, it.marks, undefined, limits.marks));
        }
        return { ...it, [a.field]: value };
      });
    }

    case "item/current":
      return mapItem(doc, a.sectionId, a.itemId, (it) => ((it.current ?? false) === a.current ? it : { ...it, current: a.current }));

    case "item/add":
      return mapSection(doc, a.sectionId, (s) => {
        if (s.items.length >= limits.items) return s;
        if ((s.items as AnyItem[]).some((it) => it.id === a.itemId)) return s;
        const item = newItem(s.kind, a.itemId, a.bulletId);
        if (!item) return s;
        // A timeline lists the latest entry on top; the other kinds append.
        return withItems(s, NEWEST_FIRST.has(s.kind) ? [item, ...s.items] : [...s.items, item]);
      });

    case "item/remove":
      return mapSection(doc, a.sectionId, (s) => {
        const items = (s.items as AnyItem[]).filter((it) => it.id !== a.itemId);
        return items.length === s.items.length ? s : withItems(s, items);
      });

    case "item/duplicate":
      return mapSection(doc, a.sectionId, (s) => {
        const items = s.items as AnyItem[];
        const i = items.findIndex((it) => it.id === a.itemId);
        if (i < 0 || items.length >= limits.items || s.kind === "SUMMARY") return s;
        const src = items[i];
        // Fresh ids (item and bullets); the copy is not the profile's item any more.
        const { profileItemId: _link, ...rest } = src as AnyItem & { profileItemId?: unknown };
        void _link;
        const copy: AnyItem = { ...rest, id: a.newItemId };
        if (src.bullets) copy.bullets = src.bullets.map((b, k) => ({ ...b, id: a.newBulletIds[k] ?? b.id }));
        const out = items.slice();
        out.splice(i + 1, 0, copy);
        return withItems(s, out);
      });

    case "item/hide":
      return mapItem(doc, a.sectionId, a.itemId, (it) => ((it.hidden ?? false) === a.hidden ? it : { ...it, hidden: a.hidden }));

    case "item/move":
      return mapSection(doc, a.sectionId, (s) => {
        const items = s.items as AnyItem[];
        const next = moveIn(items, items.findIndex((it) => it.id === a.itemId), a.to);
        return next === items ? s : withItems(s, next as AnyItem[]);
      });

    /* ── skills ─────────────────────────────────────────────────────────────────────── */
    case "skills/group.edit":
      return mapItem(doc, a.sectionId, a.itemId, (it) => {
        const value = clamp(a.value, MAX_SHORT_CHARS);
        return (it.group ?? "") === value ? it : { ...it, group: value };
      });

    case "skills/set":
      return mapItem(doc, a.sectionId, a.itemId, (it) => {
        const skills = a.skills.map((x) => clamp(x, MAX_SKILL_CHARS)).slice(0, MAX_SKILLS);
        const before = (it.skills as string[] | undefined) ?? [];
        return before.length === skills.length && before.every((x, i) => x === skills[i]) ? it : { ...it, skills };
      });

    case "skills/add":
      return mapItem(doc, a.sectionId, a.itemId, (it) => {
        const before = (it.skills as string[] | undefined) ?? [];
        const skill = clamp(a.skill.trim(), MAX_SKILL_CHARS);
        if (!skill || before.length >= MAX_SKILLS || before.some((x) => x.toLowerCase() === skill.toLowerCase())) return it;
        return { ...it, skills: [...before, skill] };
      });

    case "skills/remove":
      return mapItem(doc, a.sectionId, a.itemId, (it) => {
        const before = (it.skills as string[] | undefined) ?? [];
        if (a.index < 0 || a.index >= before.length) return it;
        return { ...it, skills: before.filter((_, i) => i !== a.index) };
      });

    case "skills/move":
      return mapItem(doc, a.sectionId, a.itemId, (it) => {
        const before = (it.skills as string[] | undefined) ?? [];
        const next = moveIn(before, a.from, a.to);
        return next === before ? it : { ...it, skills: next as string[] };
      });

    /* ── lists, replaced text ───────────────────────────────────────────────────────── */
    case "list/set":
      return mapSection(doc, a.sectionId, (s) => {
        if (s.kind === "SUMMARY") {
          const first = s.items[0];
          if (!first || (first.list ?? null) === a.style) return s;
          return { ...s, items: [{ ...first, list: a.style }, ...s.items.slice(1)] };
        }
        if (!WITH_BULLETS.has(s.kind) || !a.itemId) return s;
        let changed = false;
        const items = (s.items as AnyItem[]).map((it) => {
          if (it.id !== a.itemId || (it.listStyle ?? null) === a.style) return it;
          changed = true;
          return { ...it, listStyle: a.style };
        });
        return changed ? withItems(s, items) : s;
      });

    case "text/replace":
      return replaceText(doc, a.ref, a.text, limits);

    /* ── bullets ────────────────────────────────────────────────────────────────────── */
    case "bullet/edit": {
      const text = clamp(a.text, limits.bulletChars);
      return mapBullets(doc, a.sectionId, a.itemId, (bs) => {
        const i = bs.findIndex((b) => b.id === a.bulletId);
        if (i < 0 || (bs[i].text === text && !a.marks)) return bs;
        const marks = nextMarks(bs[i].text, text, bs[i].marks, a.marks, limits.marks);
        return bs.map((b, j) => (j === i ? withMarks({ ...b, text, src: "user" as const }, marks) : b));
      });
    }

    case "bullet/add":
      return mapBullets(doc, a.sectionId, a.itemId, (bs) =>
        bs.length >= limits.bullets ? bs : [...bs, { id: a.bulletId, text: "", src: "user" as const }],
      );

    case "bullet/split":
      return mapBullets(doc, a.sectionId, a.itemId, (bs) => {
        const i = bs.findIndex((b) => b.id === a.bulletId);
        if (i < 0 || bs.length >= limits.bullets) return bs;
        const out = bs.slice();
        // The text before the caret keeps its marks; the text after takes the marks that were over it.
        const old = bs[i];
        const before = clamp(a.before, limits.bulletChars);
        const after = clamp(a.after, limits.bulletChars);
        const marks = old.marks ?? [];
        const afterFrom = old.text.length - a.after.length;
        out[i] = withMarks({ ...old, text: before, src: "user" as const }, marks.length ? sliceMarks(marks, 0, before.length) : undefined);
        out.splice(i + 1, 0, withMarks({ id: a.newBulletId, text: after, src: "user" as const } as ResumeBullet, marks.length ? sliceMarks(marks, Math.max(0, afterFrom), old.text.length) : undefined));
        return out;
      });

    case "bullet/remove":
      return mapBullets(doc, a.sectionId, a.itemId, (bs) => {
        const out = bs.filter((b) => b.id !== a.bulletId);
        return out.length === bs.length ? bs : out;
      });

    case "bullet/mergeUp":
      return mapBullets(doc, a.sectionId, a.itemId, (bs) => {
        const i = bs.findIndex((b) => b.id === a.bulletId);
        if (i <= 0) return bs; // the first bullet has nothing above it
        const merged = bs[i - 1].text + bs[i].text;
        if (merged.length > limits.bulletChars) return bs; // would overflow the cap: leave both
        const out = bs.slice();
        const lower = (bs[i].marks ?? []).map((m) => ({ ...m, s: m.s + bs[i - 1].text.length, e: m.e + bs[i - 1].text.length }));
        const marks = [...(bs[i - 1].marks ?? []), ...lower].slice(0, limits.marks);
        out[i - 1] = withMarks({ ...bs[i - 1], text: merged, src: "user" as const }, marks);
        out.splice(i, 1);
        return out;
      });

    case "bullet/move":
      return mapBullets(doc, a.sectionId, a.itemId, (bs) => {
        const next = moveIn(bs, bs.findIndex((b) => b.id === a.bulletId), a.to);
        return next === bs ? bs : (next as ResumeBullet[]);
      });
  }
}

/** `text/replace`: one bullet, or the item's own `text` (summary / achievement / interest); its marks are cleared. */
function replaceText(doc: ResumeDocument, ref: TextRef, text: string, limits: DocLimits): ResumeDocument {
  if (ref.bulletId) {
    const value = clamp(text, limits.bulletChars);
    return mapBullets(doc, ref.sectionId, ref.itemId, (bs) => {
      const i = bs.findIndex((b) => b.id === ref.bulletId);
      if (i < 0) return bs;
      return bs.map((b, j) => (j === i ? withMarks({ ...b, text: value, src: "user" as const }, undefined) : b));
    });
  }
  return mapItem(doc, ref.sectionId, ref.itemId, (it, section) => {
    const value = clamp(text, section.kind === "SUMMARY" ? limits.summaryChars : maxFor("text", section.kind, limits));
    return withMarks({ ...it, text: value, ...(section.kind === "SUMMARY" ? { src: "user" } : {}) }, undefined);
  });
}

/** Typing into the same field within the coalescing window is one undo step. */
function coalesceKey(a: EditorAction): string | undefined {
  switch (a.type) {
    case "title/edit":
      return "title";
    case "basics/field":
      return `basics:${a.field}`;
    case "basics/link.edit":
      return `link:${a.index}:${a.field}`;
    case "section/rename":
      return `sectionTitle:${a.sectionId}`;
    case "summary/edit":
      return `summary:${a.sectionId}`;
    case "item/field":
      return `${a.itemId}:${a.field}`;
    case "skills/group.edit":
      return `${a.itemId}:group`;
    case "bullet/edit":
      return `bullet:${a.bulletId}`;
    default:
      return undefined;
  }
}

function commit(state: EditorState, next: ResumeDocument, key: string | undefined, at: number): EditorState {
  if (next === state.history.present) return state;
  return {
    ...state,
    history: record(state.history, next, { key, at }),
    rev: state.rev + 1,
    // A new edit after a failed save is a new attempt: the autosave controller will try again.
    phase: state.phase === "error" ? "idle" : state.phase,
    error: state.phase === "error" ? null : state.error,
    errorPath: null,
  };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "history/undo": {
      const history = undo(state.history);
      return history === state.history ? state : { ...state, history, rev: state.rev + 1, errorPath: null };
    }
    case "history/redo": {
      const history = redo(state.history);
      return history === state.history ? state : { ...state, history, rev: state.rev + 1, errorPath: null };
    }

    case "presentation/set": {
      const templateId = action.templateId ?? state.templateId;
      const theme = action.theme === undefined ? state.theme : action.theme;
      return templateId === state.templateId && theme === state.theme ? state : { ...state, templateId, theme };
    }

    case "presentation/version":
      return state.docVersion === action.version ? state : { ...state, docVersion: action.version };

    case "save/start":
      return state.phase === "conflict" ? state : { ...state, phase: "saving", error: null };

    case "save/ok": {
      // Only what was *sent* is saved: edits made while the request was in flight stay unsaved.
      const savedRev = Math.max(state.savedRev, action.rev);
      return {
        ...state,
        docVersion: action.version,
        savedRev,
        savedAt: action.at,
        phase: "idle",
        error: null,
        errorPath: null,
      };
    }

    case "save/retrying":
      return state.phase === "conflict" ? state : { ...state, phase: "retrying" };

    case "save/conflict":
      return { ...state, phase: "conflict", conflict: { serverVersion: action.serverVersion, doc: action.doc } };

    case "save/failed":
      return { ...state, phase: "error", error: action.message, errorPath: action.path ?? null };

    case "conflict/keepMine": {
      if (!state.conflict) return state;
      // My document stays; the next save is sent against the server's version, so it wins.
      return { ...state, docVersion: state.conflict.serverVersion, conflict: null, phase: "idle", error: null, errorPath: null };
    }

    case "conflict/takeTheirs": {
      if (!state.conflict) return state;
      const rev = state.rev + 1;
      return {
        ...state,
        history: createHistory(state.conflict.doc),
        docVersion: state.conflict.serverVersion,
        rev,
        savedRev: rev, // identical to the server's copy: nothing left to save
        conflict: null,
        phase: "idle",
        error: null,
        errorPath: null,
      };
    }

    default: {
      const next = applyEdit(state.history.present, action, state.limits);
      return commit(state, next, coalesceKey(action), action.at);
    }
  }
}
