/**
 * The Resume Score engine, ruleset `v1` (Resume Builder DESIGN 11): a pure, deterministic function from
 * a `ResumeDocument` (+ the template's capabilities, the theme, a measured page count and, later, a job's
 * extract) to a 0-100 score, five (six on ATS templates) checklist groups and one tip per failing rule.
 *
 * Runs in the editor on every change (debounced) so the Insights ring updates as the user types, and in
 * the BFF on save to produce the value Spring persists. Java never evaluates it (DECISIONS #7). No DOM,
 * no clock, no network, no AI: the same input always gives the same report.
 *
 *   score = round( sum_g W_g * f_g / sum_g W_g * 100 )         g over the active groups
 *   f_g   = sum(weight of passed rules) / sum(weight of applicable rules)       (0 / 0 -> 0)
 *
 * Rule thresholds (150 characters, 70 % of bullets ...) belong to the ruleset version; the rule weights,
 * the group weights, the pass threshold and the band copy are settings (`ScoreConfig`).
 */
import { DEFAULT_SECTION_TITLES, type SectionKind, type TemplateCapabilities, type Theme } from "./types";
import { get, isObject, list, str, visibleItems, visibleSections, type JsonObject } from "./doc";
import {
  ACTION_VERBS,
  ADD_REF_PREFIX,
  CLICHES,
  DEFAULT_SCORE_CONFIG,
  DUTY,
  FIRST_PERSON,
  GROUPS,
  METRIC,
  RULES,
  RULESET_VERSION,
  YEARS_SIGNAL,
  type GroupId,
  type RuleId,
  type RuleMeta,
  type ScoreBand,
  type ScoreConfig,
} from "./score-rules";

/* ── public types ─────────────────────────────────────────────────────────────────────────── */

/** What `K5` needs of a job's extract (R5 adds the rest): the key skills the job asks for. */
export interface JdExtract {
  keySkills: ReadonlyArray<{ term: string }>;
  /** Too little detail to score (DESIGN 12.2): K5 stays out of the score. */
  insufficient?: boolean;
}

export interface ScoreContext {
  caps: TemplateCapabilities;
  theme: Theme;
  /** The measured page count, or `null` when unknown (F4 then passes). */
  pages: number | null;
  /** The linked job's extract; `null` = no job, which takes K5 out of the denominator. */
  jobExtract: JdExtract | null;
  /** `YYYY-MM`; unused by v1 rules, reserved for the date-aware rules of later rulesets. */
  now: string;
}

export interface ScoreRuleReport {
  id: RuleId;
  pass: boolean;
  /** The weight in effect (settings over defaults). */
  weight: number;
  /** False when the rule has nothing to say about this document or its weight is 0; it then counts for nothing. */
  applicable: boolean;
  /** The tip, with the numbers/names of this document filled in. */
  message: string;
  /** The `data-field` ref the tip's "Go to" lands on, or `add:<KIND>` when the fix is adding that section. */
  target?: { ref: string };
}

export interface ScoreGroupReport {
  id: GroupId;
  /** The group's name ("Summary"). */
  label: string;
  /** The checklist line for the result: its pass or fail label (DESIGN 11.4). */
  line: string;
  pass: boolean;
  fraction: number;
  weight: number;
  rules: ScoreRuleReport[];
}

export interface ScoreReport {
  rulesetVersion: string;
  /** 0-100, an integer. */
  score: number;
  band: { title: string; body: string };
  groups: ScoreGroupReport[];
}

/** What the BFF sends to Spring and the list reads back (DESIGN 11.5); at most 4 KB. */
export interface PersistedScore {
  rulesetVersion: string;
  score: number;
  groups: Array<{ id: GroupId; pass: boolean; fraction: number }>;
}

/* ── small helpers ────────────────────────────────────────────────────────────────────────── */

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const reCache = new Map<string, RegExp>();

/**
 * `inText(term)`: the term as a whole word / phrase, any case. Boundaries are "not a letter, digit or
 * underscore" on each side, which is `\b` for ordinary words and also works for terms such as `C++`.
 */
function termRe(term: string): RegExp {
  let re = reCache.get(term);
  if (!re) {
    if (reCache.size > 400) reCache.clear();
    re = new RegExp(`(?<![\\p{L}\\p{N}_])${esc(term)}(?![\\p{L}\\p{N}_])`, "iu");
    reCache.set(term, re);
  }
  return re;
}
const inText = (term: string, text: string) => term.trim() !== "" && termRe(term.trim()).test(text);

const wordCount = (t: string) => t.trim().split(/\s+/).length;
const firstWord = (t: string) => (t.trim().split(/\s+/)[0] ?? "").toLowerCase().replace(/[^\p{L}]/gu, "");

const isBlank = (v: unknown): boolean => {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (typeof v === "boolean") return true;
  if (Array.isArray(v)) return v.every(isBlank);
  if (isObject(v)) return Object.entries(v).every(([k, x]) => k === "id" || k === "src" || k === "marks" || isBlank(x));
  return false;
};
/** An item with every content field empty (flags, ids, marks and provenance are not content). */
const itemIsEmpty = (item: JsonObject) =>
  Object.entries(item).every(([k, v]) => k === "id" || k === "hidden" || k === "profileItemId" || k === "list" || k === "listStyle" || k === "current" || isBlank(v));

const idOf = (o: JsonObject): string => (typeof o.id === "string" ? o.id : "");
const clampWeight = (w: unknown, fallback: number): number => (typeof w === "number" && Number.isFinite(w) && w >= 0 ? w : fallback);

interface BulletRef {
  id: string;
  text: string;
  itemId: string;
  marks: unknown[];
}
const bulletsOf = (item: JsonObject): BulletRef[] => {
  const out: BulletRef[] = [];
  for (const b of list(item, "bullets")) {
    if (!isObject(b)) continue;
    const text = str(b, "text");
    if (text) out.push({ id: idOf(b), text, itemId: idOf(item), marks: list(b, "marks") });
  }
  return out;
};

const DATE_MONTH = /^\d{4}-\d{2}$/;
const DATE_YEAR = /^\d{4}$/;
/** `YYYY` -> first month for a start, last month for an end, so a year-only date compares sensibly. */
const monthKey = (d: string, end: boolean) => (DATE_YEAR.test(d) ? `${d}-${end ? "12" : "01"}` : d);

/* ── the document as the rules see it ─────────────────────────────────────────────────────── */

interface Facts {
  doc: unknown;
  ctx: ScoreContext;
  headline: string;
  summary: string;
  summaryRef: string;
  skills: string[];
  skillsRef: string;
  expItems: JsonObject[];
  /** Bullets of visible EXPERIENCE / PROJECTS / CUSTOM items (`bullets(doc)`). */
  bullets: BulletRef[];
  /** Bullets of every visible item (empty-bullet and length checks look at all of them). */
  allBullets: BulletRef[];
  /** summary + bullets: what a skill must appear in to be "in context". */
  prose: string;
}

const BULLET_KINDS: SectionKind[] = ["EXPERIENCE", "PROJECTS", "CUSTOM"];

function sectionRef(doc: unknown, kind: SectionKind): string {
  const any = list(doc, "sections").find((s) => isObject(s) && s.kind === kind);
  return any && isObject(any) && idOf(any) ? idOf(any) : `${ADD_REF_PREFIX}${kind}`;
}

function gather(doc: unknown, ctx: ScoreContext): Facts {
  const summaryItems = visibleSections(doc, "SUMMARY").flatMap(visibleItems);
  const summary = summaryItems.map((i) => str(i, "text")).filter(Boolean).join(" ");
  const summarySource = summaryItems.find((i) => str(i, "text")) ?? summaryItems[0];
  const summaryRef = summarySource ? `${idOf(summarySource)}.text` : sectionRef(doc, "SUMMARY");

  const seen = new Set<string>();
  const skills: string[] = [];
  const skillItems = visibleSections(doc, "SKILLS").flatMap(visibleItems);
  for (const item of skillItems) {
    for (const s of list(item, "skills")) {
      const t = typeof s === "string" ? s.trim() : "";
      if (t && !seen.has(t.toLowerCase())) {
        seen.add(t.toLowerCase());
        skills.push(t);
      }
    }
  }
  const skillsRef = skillItems[0] ? `${idOf(skillItems[0])}.skills` : sectionRef(doc, "SKILLS");

  const expItems = visibleSections(doc, "EXPERIENCE")
    .flatMap(visibleItems)
    .filter((i) => str(i, "title") || str(i, "org"));

  const bullets = BULLET_KINDS.flatMap((k) => visibleSections(doc, k).flatMap(visibleItems)).flatMap(bulletsOf);
  const allBullets = visibleSections(doc).flatMap(visibleItems).flatMap(bulletsOf);

  return {
    doc,
    ctx,
    headline: str(get(doc, "basics"), "headline"),
    summary,
    summaryRef,
    skills,
    skillsRef,
    expItems,
    bullets,
    allBullets,
    prose: [summary, ...bullets.map((b) => b.text)].join("\n"),
  };
}

/* ── rules ────────────────────────────────────────────────────────────────────────────────── */

interface Outcome {
  pass: boolean;
  /** `false` = n/a (K5 without a job): out of the denominator. */
  applicable?: boolean;
  /** Where "Go to" lands. */
  ref?: string;
  /** Replaces the table's tip text (the numbers / names of this document). */
  message?: string;
}

const NAME_REF = "basics.name";

/** A section kind (any visibility) has content: at least one visible, non-empty item in a visible section. */
const hasContent = (doc: unknown, kind: SectionKind) =>
  visibleSections(doc, kind).some((s) => visibleItems(s).some((i) => !itemIsEmpty(i)));

/** Every date field of every visible item, with the item it belongs to. */
function allDates(doc: unknown): Array<{ value: string; itemId: string }> {
  const out: Array<{ value: string; itemId: string }> = [];
  for (const item of visibleSections(doc).flatMap(visibleItems)) {
    for (const f of ["start", "end", "date"]) {
      const v = str(item, f);
      if (v) out.push({ value: v, itemId: idOf(item) });
    }
  }
  return out;
}

/** The rule evaluators, one per rule id; the table (ids, weights, tips) is in `score-rules.ts`. */
const EVALUATORS: Record<RuleId, (f: Facts) => Outcome> = {
  /* G1 Summary */
  S1: (f) => ({ pass: f.summary.length >= 150, ref: f.summaryRef }),
  S2: (f) => ({ pass: f.summary.length >= 150 && f.summary.length <= 700, ref: f.summaryRef }),
  S3: (f) => ({ pass: f.skills.filter((s) => inText(s, f.summary)).length >= 2, ref: f.summaryRef }),
  S4: (f) => ({ pass: f.summary !== "" && !FIRST_PERSON.test(f.summary), ref: f.summaryRef }),
  S5: (f) => ({
    pass: f.summary !== "" && (YEARS_SIGNAL.test(f.summary) || (f.headline !== "" && f.summary.toLowerCase().includes(f.headline.toLowerCase()))),
    ref: f.summaryRef,
  }),

  /* G2 Experience */
  E1: (f) => ({ pass: f.expItems.length >= 1, ref: sectionRef(f.doc, "EXPERIENCE") }),
  E2: (f) => {
    const bad = f.expItems.find((i) => !str(i, "title") || !str(i, "org"));
    return { pass: f.expItems.length > 0 && !bad, ref: idOf(bad ?? f.expItems[0] ?? {}) || sectionRef(f.doc, "EXPERIENCE") };
  },
  E3: (f) => {
    const bad = f.expItems.find((i) => !str(i, "start") || !(str(i, "end") || get(i, "current") === true));
    return { pass: f.expItems.length > 0 && !bad, ref: idOf(bad ?? f.expItems[0] ?? {}) || sectionRef(f.doc, "EXPERIENCE") };
  },
  E4: (f) => {
    const latest = f.expItems.slice(0, 3);
    const bad = latest.find((i, idx) => bulletsOf(i).length < (idx === 0 ? 3 : 2));
    return { pass: latest.length > 0 && !bad, ref: idOf(bad ?? latest[0] ?? {}) || sectionRef(f.doc, "EXPERIENCE") };
  },
  E5: (f) => {
    const bad = f.bullets.find((b) => !ACTION_VERBS.has(firstWord(b.text)));
    const good = f.bullets.filter((b) => ACTION_VERBS.has(firstWord(b.text))).length;
    return { pass: f.bullets.length > 0 && good / f.bullets.length >= 0.7, ref: bad?.id ?? sectionRef(f.doc, "EXPERIENCE") };
  },
  E6: (f) => {
    const inRange = (b: BulletRef) => {
      const n = wordCount(b.text);
      return n >= 8 && n <= 30;
    };
    const bad = f.bullets.find((b) => !inRange(b));
    return { pass: f.bullets.length > 0 && f.bullets.filter(inRange).length / f.bullets.length >= 0.7, ref: bad?.id ?? sectionRef(f.doc, "EXPERIENCE") };
  },
  E7: (f) => {
    const kinds: SectionKind[] = ["EXPERIENCE", "EDUCATION", "PROJECTS", "CUSTOM"];
    const dated = kinds.flatMap((k) => visibleSections(f.doc, k).flatMap(visibleItems)).filter((i) => str(i, "start") || str(i, "end") || get(i, "current") === true);
    const bad = dated.find((i) => {
      const s = str(i, "start");
      const e = str(i, "end");
      if (get(i, "current") === true && e) return true;
      return s !== "" && e !== "" && monthKey(s, false) > monthKey(e, true);
    });
    return { pass: dated.length > 0 && !bad, ref: idOf(bad ?? dated[0] ?? {}) || sectionRef(f.doc, "EXPERIENCE") };
  },

  /* G3 Keywords */
  K1: (f) => ({ pass: f.skills.length >= 8, ref: f.skillsRef }),
  K2: (f) => ({ pass: f.skills.length > 0 && f.skills.filter((s) => inText(s, f.prose)).length / f.skills.length >= 0.5, ref: f.skillsRef }),
  K3: (f) => {
    const hit = CLICHES.find((c) => inText(c, f.prose));
    const where = hit ? f.bullets.find((b) => inText(hit, b.text)) : undefined;
    return { pass: !hit, ref: where?.id ?? f.summaryRef };
  },
  K4: (f) => ({ pass: f.headline !== "", ref: "basics.headline" }),
  K5: (f) => {
    const job = f.ctx.jobExtract;
    const terms = job && !job.insufficient ? job.keySkills.map((k) => k.term).filter((t) => typeof t === "string" && t.trim() !== "") : [];
    if (terms.length === 0) return { pass: true, applicable: false, ref: f.skillsRef };
    // What the match reads: skills + summary + bullets + titles + orgs.
    const heads = visibleSections(f.doc).flatMap(visibleItems).flatMap((i) => [str(i, "title"), str(i, "org")]);
    const haystack = [f.skills.join("\n"), f.prose, f.headline, ...heads].join("\n");
    const covered = terms.filter((t) => inText(t, haystack)).length;
    return { pass: covered / terms.length >= 0.6, ref: f.skillsRef };
  },

  /* G4 Format */
  F1: (f) => {
    const basics = get(f.doc, "basics");
    const missing = (["email", "phone", "location"] as const).find((k) => !str(basics, k));
    return { pass: !missing, ref: missing ? `basics.${missing}` : "basics.email" };
  },
  F2: (f) => {
    const links = list(get(f.doc, "basics"), "links");
    return { pass: links.some((l) => /^https?:\/\//i.test(str(l, "url"))), ref: "basics.link.0.url" };
  },
  F3: (f) => {
    const needs: Array<{ kinds: SectionKind[] }> = [{ kinds: ["SUMMARY"] }, { kinds: ["EXPERIENCE", "PROJECTS"] }, { kinds: ["EDUCATION"] }, { kinds: ["SKILLS"] }];
    const missing = needs.filter((n) => !n.kinds.some((k) => hasContent(f.doc, k)));
    if (missing.length === 0) return { pass: true, ref: NAME_REF };
    return {
      pass: false,
      ref: sectionRef(f.doc, missing[0]!.kinds[0]!),
      message: `Add the missing section: ${missing.map((m) => DEFAULT_SECTION_TITLES[m.kinds[0]!]).join(", ")}.`,
    };
  },
  F4: (f) => {
    const { pages, theme, caps } = f.ctx;
    const pass = pages == null || (pages <= theme.fit.target && pages <= caps.maxPages);
    const last = list(f.doc, "sections").filter(isObject).at(-1);
    return { pass, ref: (last && idOf(last)) || NAME_REF, message: pass || pages == null ? undefined : `Still ${pages} ${pages === 1 ? "page" : "pages"} — hide a section or shorten bullets.` };
  },
  F5: (f) => {
    const emptyItem = visibleSections(f.doc).flatMap(visibleItems).find(itemIsEmpty);
    let emptyBullet: string | undefined;
    for (const item of visibleSections(f.doc).flatMap(visibleItems)) {
      const b = list(item, "bullets").find((x) => isObject(x) && str(x, "text") === "");
      if (b && isObject(b)) {
        emptyBullet = idOf(b);
        break;
      }
    }
    return { pass: !emptyItem && emptyBullet === undefined, ref: (emptyItem && idOf(emptyItem)) || emptyBullet || NAME_REF };
  },
  F6: (f) => {
    const dates = allDates(f.doc).filter((d) => DATE_MONTH.test(d.value) || DATE_YEAR.test(d.value));
    const months = dates.filter((d) => DATE_MONTH.test(d.value));
    const mixed = months.length > 0 && months.length < dates.length;
    const odd = mixed ? (months.length >= dates.length - months.length ? dates.find((d) => DATE_YEAR.test(d.value)) : months[0]) : undefined;
    return { pass: !mixed, ref: odd?.itemId || NAME_REF };
  },
  F7: (f) => {
    const long = f.allBullets.find((b) => b.text.length > 300);
    return { pass: !long, ref: long?.id ?? NAME_REF };
  },

  /* G5 Results */
  M1: (f) => {
    const hasMetric = (i: JsonObject) => bulletsOf(i).some((b) => METRIC.test(b.text));
    const without = f.expItems.find((i) => !hasMetric(i));
    return { pass: f.expItems.length > 0 && f.expItems.filter(hasMetric).length / f.expItems.length >= 0.5, ref: idOf(without ?? f.expItems[0] ?? {}) || sectionRef(f.doc, "EXPERIENCE") };
  },
  M2: (f) => {
    const plain = f.bullets.find((b) => !METRIC.test(b.text));
    return { pass: f.bullets.length > 0 && f.bullets.filter((b) => METRIC.test(b.text)).length / f.bullets.length >= 0.3, ref: plain?.id ?? sectionRef(f.doc, "EXPERIENCE") };
  },
  M3: (f) => {
    const duty = f.bullets.find((b) => DUTY.test(b.text));
    return { pass: f.bullets.length > 0 && !duty, ref: duty?.id ?? f.bullets[0]?.id ?? sectionRef(f.doc, "EXPERIENCE") };
  },

  /* G6 ATS */
  A1: (f) => {
    if (f.ctx.caps.headings === "standard") return { pass: true };
    const renamed = visibleSections(f.doc).find((s) => {
      const kind = s.kind as SectionKind;
      const title = str(s, "title");
      return kind !== "CUSTOM" && title !== "" && title !== DEFAULT_SECTION_TITLES[kind];
    });
    return { pass: !renamed, ref: renamed ? `${idOf(renamed)}.title` : NAME_REF };
  },
  A2: (f) => {
    const allowed = new Set<string>(f.ctx.caps.marks);
    const bad = (m: unknown) => isObject(m) && !allowed.has(String(m.t));
    for (const item of visibleSections(f.doc).flatMap(visibleItems)) {
      if (list(item, "marks").some(bad)) return { pass: false, ref: `${idOf(item)}.text` };
      const b = list(item, "bullets").find((x) => isObject(x) && list(x, "marks").some(bad));
      if (b && isObject(b)) return { pass: false, ref: idOf(b) };
    }
    return { pass: true, ref: NAME_REF };
  },
  A3: (f) => {
    const photo = get(get(f.doc, "basics"), "photo");
    return { pass: !(f.ctx.theme.showPhoto === true && isObject(photo) && str(photo, "key") !== ""), ref: "basics.photo" };
  },
  A4: (f) => {
    const customs = visibleSections(f.doc, "CUSTOM");
    const { custom, customLimit } = f.ctx.caps;
    const limit = custom === "none" ? 0 : custom === "limited" ? customLimit : Number.POSITIVE_INFINITY;
    return { pass: customs.length <= limit, ref: idOf(customs[Number.isFinite(limit) ? limit : 0] ?? {}) || NAME_REF };
  },
  A5: (f) => {
    const bad = allDates(f.doc).find((d) => !DATE_MONTH.test(d.value));
    return { pass: !bad, ref: bad?.itemId || NAME_REF };
  },
};

/* ── the engine ───────────────────────────────────────────────────────────────────────────── */

const roundHalfUp = (x: number) => Math.floor(x + 0.5 + 1e-9);

function pickBand(score: number, bands: ScoreBand[]): { title: string; body: string } {
  const sorted = [...(bands.length > 0 ? bands : DEFAULT_SCORE_CONFIG.bands)].sort((a, b) => b.min - a.min);
  const band = sorted.find((b) => score >= b.min) ?? sorted[sorted.length - 1]!;
  return { title: band.title, body: band.body };
}

/**
 * Scores `doc`. `config` is the builder config's `score` block (defaults when omitted); a rule or
 * group missing from it uses the v1 default weight, a weight of 0 takes a rule out of its group.
 * Deterministic; no side effects.
 */
export function scoreResume(doc: unknown, ctx: ScoreContext, config: ScoreConfig = DEFAULT_SCORE_CONFIG): ScoreReport {
  const facts = gather(doc, ctx);
  const threshold = typeof config.passThreshold === "number" && Number.isFinite(config.passThreshold) ? config.passThreshold : DEFAULT_SCORE_CONFIG.passThreshold;
  const groups: ScoreGroupReport[] = [];
  let weighted = 0;
  let total = 0;

  for (const g of GROUPS) {
    if (g.id === "G6" && !ctx.caps.ats) continue;
    const rules: ScoreRuleReport[] = [];
    let num = 0;
    let den = 0;
    for (const meta of RULES.filter((r) => r.group === g.id)) {
      const weight = clampWeight(config.weights?.[meta.id], meta.weight);
      const out = EVALUATORS[meta.id](facts);
      const applicable = out.applicable !== false && weight > 0;
      if (applicable) {
        den += weight;
        if (out.pass) num += weight;
      }
      rules.push(ruleReport(meta, out, weight, applicable));
    }
    const fraction = den > 0 ? num / den : 0;
    const pass = fraction >= threshold;
    const groupWeight = clampWeight(config.groupWeights?.[g.id], g.weight);
    weighted += groupWeight * fraction;
    total += groupWeight;
    groups.push({ id: g.id, label: g.label, line: pass ? g.passLabel : g.failLabel, pass, fraction, weight: groupWeight, rules });
  }

  const score = total > 0 ? Math.min(100, Math.max(0, roundHalfUp((weighted / total) * 100))) : 0;
  return { rulesetVersion: RULESET_VERSION, score, band: pickBand(score, config.bands), groups };
}

function ruleReport(meta: RuleMeta, out: Outcome, weight: number, applicable: boolean): ScoreRuleReport {
  return {
    id: meta.id,
    pass: out.pass,
    weight,
    applicable,
    message: out.message ?? meta.tip,
    target: { ref: out.ref || NAME_REF },
  };
}

/** The rules a user can act on: applicable and failing, in group order. */
export function failingRules(report: ScoreReport): Array<ScoreRuleReport & { group: GroupId }> {
  return report.groups.flatMap((g) => g.rules.filter((r) => r.applicable && !r.pass).map((r) => ({ ...r, group: g.id })));
}

/** The compact record Spring stores (`resume_doc.score_json`); DESIGN 11.5. */
export function toPersistedScore(report: ScoreReport): PersistedScore {
  return {
    rulesetVersion: report.rulesetVersion,
    score: report.score,
    groups: report.groups.map((g) => ({ id: g.id, pass: g.pass, fraction: Math.round(g.fraction * 10000) / 10000 })),
  };
}
