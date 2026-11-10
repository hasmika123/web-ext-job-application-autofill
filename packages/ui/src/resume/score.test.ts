import { describe, expect, it } from "vitest";
import { ATS_STRICT, DESIGN_FREE } from "./capabilities";
import { DEFAULT_THEME } from "./theme";
import { fixtureText } from "./test-fixtures";
import { ACTION_VERBS, DEFAULT_SCORE_CONFIG, GROUPS, RULES } from "./score-rules";
import { failingRules, scoreResume, toPersistedScore, type JdExtract, type ScoreContext } from "./score";
import type { ResumeDocument, TemplateCapabilities, Theme } from "./types";

const load = (name: string): ResumeDocument => JSON.parse(fixtureText(`${name}.json`)) as ResumeDocument;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const ctx = (caps: TemplateCapabilities, over: Partial<ScoreContext> = {}, theme: Partial<Theme> = {}): ScoreContext => ({
  caps,
  theme: { ...DEFAULT_THEME, ...theme },
  pages: 1,
  jobExtract: null,
  now: "2026-10",
  ...over,
});

const empty = load("score-empty");
const strong = load("score-strong");
const mid = load("score-mid");

const group = (r: ReturnType<typeof scoreResume>, id: string) => r.groups.find((g) => g.id === id)!;
const frac = (r: ReturnType<typeof scoreResume>, id: string) => group(r, id).fraction;

describe("Resume Score ruleset v1: the DESIGN 11.6 test vectors", () => {
  it("empty doc scores 13", () => {
    const r = scoreResume(empty, ctx(DESIGN_FREE));
    expect(r.score).toBe(13);
    expect(r.band.title).toBe("Needs work");
    expect(r.groups.map((g) => g.id)).toEqual(["G1", "G2", "G3", "G4", "G5"]);
    expect(r.groups.every((g) => !g.pass)).toBe(true);
    expect(frac(r, "G1")).toBe(0);
    expect(frac(r, "G2")).toBe(0);
    expect(frac(r, "G3")).toBeCloseTo(2 / 12, 10);
    expect(frac(r, "G4")).toBeCloseTo(8 / 16, 10);
    expect(frac(r, "G5")).toBe(0);
  });

  it("strong doc scores 100 on both profiles", () => {
    const free = scoreResume(strong, ctx(DESIGN_FREE));
    expect(free.score).toBe(100);
    expect(free.band.title).toBe("Great match!");
    expect(free.groups.every((g) => g.pass && g.fraction === 1 || g.id === "G3")).toBe(true);
    expect(frac(free, "G3")).toBe(1);
    expect(failingRules(free)).toEqual([]);

    const ats = scoreResume(strong, ctx(ATS_STRICT));
    expect(ats.score).toBe(100);
    expect(ats.groups.map((g) => g.id)).toContain("G6");
    expect(frac(ats, "G6")).toBe(1);
    expect(ats.band.title).toBe("Great match!");
  });

  it("mid doc scores 62 and fails G1/G3", () => {
    const r = scoreResume(mid, ctx(DESIGN_FREE, {}, { showPhoto: true }));
    expect(r.score).toBe(62);
    expect(r.band.title).toBe("Good progress");
    expect(group(r, "G1").pass).toBe(false);
    expect(group(r, "G1").fraction).toBe(0);
    expect(group(r, "G2").pass).toBe(true);
    expect(frac(r, "G2")).toBeCloseTo(17 / 23, 10);
    expect(group(r, "G3").pass).toBe(false);
    expect(frac(r, "G3")).toBeCloseTo(6 / 12, 10);
    expect(group(r, "G4").pass).toBe(true);
    expect(frac(r, "G4")).toBeCloseTo(15 / 16, 10);
    expect(group(r, "G5").pass).toBe(true);
    expect(frac(r, "G5")).toBeCloseTo(9 / 12, 10);
    expect(group(r, "G1").line).toBe("Make your summary clearer");
    expect(group(r, "G2").line).toBe("Relevant work experience");
  });

  it("mid doc on an ATS template: G6 fails (italic, photo) and the score stays 62", () => {
    const r = scoreResume(mid, ctx(ATS_STRICT, {}, { showPhoto: true }));
    expect(frac(r, "G6")).toBeCloseTo(5 / 8, 10);
    expect(group(r, "G6").pass).toBe(false);
    expect(group(r, "G6").line).toBe("Fix ATS formatting");
    expect(group(r, "G6").rules.filter((x) => !x.pass).map((x) => x.id)).toEqual(["A2", "A3"]);
    expect(r.score).toBe(62);
  });

  it("ATS rules raise mid doc to 66 when clean", () => {
    const clean = clone(mid);
    delete (clean.sections[1]!.items[0] as { bullets: Array<{ marks?: unknown }> }).bullets[0]!.marks;
    const r = scoreResume(clean, ctx(ATS_STRICT, {}, { showPhoto: false }));
    expect(frac(r, "G6")).toBe(1);
    expect(r.score).toBe(66);
  });

  it("K5 only applies with a job extract (5/10 key skills fails, 8/10 passes)", () => {
    const k5 = (r: ReturnType<typeof scoreResume>) => group(r, "G3").rules.find((x) => x.id === "K5")!;
    const without = scoreResume(strong, ctx(DESIGN_FREE));
    expect(k5(without).applicable).toBe(false);

    const covered = ["SQL", "Python", "Figma", "Roadmapping", "Analytics", "Pricing", "Customer research", "A/B testing"];
    const eight: JdExtract = { keySkills: [...covered, "Stakeholder management", "Agile"].map((term) => ({ term })) };
    const pass = scoreResume(strong, ctx(DESIGN_FREE, { jobExtract: eight }));
    expect(k5(pass).applicable).toBe(true);
    expect(k5(pass).pass).toBe(true);
    expect(frac(pass, "G3")).toBe(1);
    expect(pass.score).toBe(100);

    const five: JdExtract = { keySkills: [...covered.slice(0, 5), "Stakeholder management", "Agile", "Kubernetes", "Terraform", "Excel"].map((term) => ({ term })) };
    const fail = scoreResume(strong, ctx(DESIGN_FREE, { jobExtract: five }));
    expect(k5(fail).pass).toBe(false);
    expect(frac(fail, "G3")).toBeCloseTo(12 / 16, 10);
    expect(fail.score).toBe(95);

    const insufficient = scoreResume(strong, ctx(DESIGN_FREE, { jobExtract: { keySkills: [{ term: "SQL" }], insufficient: true } }));
    expect(k5(insufficient).applicable).toBe(false);
  });

  it("weights from config override defaults", () => {
    const cfg = { ...DEFAULT_SCORE_CONFIG, groupWeights: { ...DEFAULT_SCORE_CONFIG.groupWeights, G1: 0, G2: 0, G3: 0, G5: 0, G4: 20 } };
    // only G4 counts: empty doc G4 is 8/16 -> 50
    expect(scoreResume(empty, ctx(DESIGN_FREE), cfg).score).toBe(50);
    const rule = { ...DEFAULT_SCORE_CONFIG, weights: { ...DEFAULT_SCORE_CONFIG.weights, F4: 12 } };
    // F4 (passing, vacuous) now weighs 12: G4 = (12 + 2 + 1 + 2) / (3 + 1 + 4 + 12 + 2 + 1 + 2) = 17/25
    expect(frac(scoreResume(empty, ctx(DESIGN_FREE), rule), "G4")).toBeCloseTo(17 / 25, 10);
  });

  it("a missing weight falls back to the v1 default; a bad one is ignored", () => {
    const cfg = { ...DEFAULT_SCORE_CONFIG, weights: { K3: -4 as number }, groupWeights: {} };
    expect(scoreResume(empty, ctx(DESIGN_FREE), cfg).score).toBe(13);
  });

  it("zero weight removes a rule from the denominator", () => {
    const base = scoreResume(empty, ctx(DESIGN_FREE));
    expect(frac(base, "G3")).toBeCloseTo(2 / 12, 10);
    const cfg = { ...DEFAULT_SCORE_CONFIG, weights: { ...DEFAULT_SCORE_CONFIG.weights, K4: 0 } };
    const r = scoreResume(empty, ctx(DESIGN_FREE), cfg);
    expect(frac(r, "G3")).toBeCloseTo(2 / 10, 10);
    const k4 = group(r, "G3").rules.find((x) => x.id === "K4")!;
    expect(k4.applicable).toBe(false);
    expect(failingRules(r).some((x) => x.id === "K4")).toBe(false);
    // a group whose every rule is weightless contributes 0, never NaN
    const allZero = { ...DEFAULT_SCORE_CONFIG, weights: Object.fromEntries(RULES.map((x) => [x.id, 0])) };
    expect(scoreResume(strong, ctx(DESIGN_FREE), allZero).score).toBe(0);
  });

  it("pages null passes F4; a measured overflow fails it with the page count in the tip", () => {
    const f4 = (r: ReturnType<typeof scoreResume>) => group(r, "G4").rules.find((x) => x.id === "F4")!;
    expect(f4(scoreResume(strong, ctx(DESIGN_FREE, { pages: null }))).pass).toBe(true);
    const over = f4(scoreResume(strong, ctx(DESIGN_FREE, { pages: 3 })));
    expect(over.pass).toBe(false);
    expect(over.message).toBe("Still 3 pages — hide a section or shorten bullets.");
    expect(f4(scoreResume(strong, ctx(DESIGN_FREE, { pages: 2 }, { fit: { mode: "auto", target: 2, step: 0 } }))).pass).toBe(true);
    expect(f4(scoreResume(strong, ctx({ ...DESIGN_FREE, maxPages: 1 }, { pages: 2 }, { fit: { mode: "auto", target: 2, step: 0 } }))).pass).toBe(false);
  });

  it("each rule has a tip message and a target ref", () => {
    for (const doc of [empty, mid, strong]) {
      for (const caps of [DESIGN_FREE, ATS_STRICT]) {
        const r = scoreResume(doc, ctx(caps, { pages: 3 }, { showPhoto: true }));
        for (const g of r.groups) {
          for (const rule of g.rules) {
            expect(rule.message.length).toBeGreaterThan(5);
            expect(rule.target?.ref).toBeTruthy();
          }
        }
      }
    }
    // the empty doc points the missing-section rules at "add this section"
    const e = scoreResume(empty, ctx(DESIGN_FREE));
    expect(group(e, "G1").rules[0]!.target!.ref).toBe("add:SUMMARY");
    const f3 = group(e, "G4").rules.find((x) => x.id === "F3")!;
    expect(f3.pass).toBe(false);
    expect(f3.message).toBe("Add the missing section: Summary, Experience, Education, Skills.");
    // the mid doc's tips land on real fields
    const m = scoreResume(mid, ctx(DESIGN_FREE));
    expect(group(m, "G1").rules[0]!.target!.ref).toBe("i_summary1.text");
    expect(group(m, "G2").rules.find((x) => x.id === "E5")!.target!.ref).toBe("b_exp0004");
    expect(group(m, "G4").rules.find((x) => x.id === "F2")!.target!.ref).toBe("basics.link.0.url");
  });

  it("report is deterministic (two runs equal)", () => {
    for (const doc of [empty, mid, strong]) {
      expect(scoreResume(doc, ctx(ATS_STRICT))).toEqual(scoreResume(clone(doc), ctx(ATS_STRICT)));
    }
  });

  it("scores the full-v2 fixture in 5 ms or less", () => {
    const doc = load("full-v2");
    const c = ctx(DESIGN_FREE);
    scoreResume(doc, c); // warm the regex cache like a live editor does
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < 25; i++) {
      const t = performance.now();
      scoreResume(doc, c);
      best = Math.min(best, performance.now() - t);
    }
    expect(best).toBeLessThanOrEqual(5);
  });
});

describe("Resume Score ruleset v1: rule edges", () => {
  const failing = (doc: unknown, caps = DESIGN_FREE, over: Partial<ScoreContext> = {}) => failingRules(scoreResume(doc, ctx(caps, over))).map((r) => r.id);

  it("ships the published word list (at least 150 action verbs, the spec's examples)", () => {
    expect(ACTION_VERBS.size).toBeGreaterThanOrEqual(150);
    for (const v of ["led", "drove", "partnered", "launched", "analysed", "analyzed", "optimised", "optimized", "spearheaded", "wrote"]) expect(ACTION_VERBS.has(v)).toBe(true);
  });

  it("rule table: every rule belongs to a group, ids are unique, defaults sum to the declared group weights' rules", () => {
    expect(new Set(RULES.map((r) => r.id)).size).toBe(RULES.length);
    for (const r of RULES) expect(GROUPS.some((g) => g.id === r.group)).toBe(true);
    expect(RULES.filter((r) => r.group === "G6").reduce((a, r) => a + r.weight, 0)).toBe(8);
    expect(GROUPS.reduce((a, g) => a + g.weight, 0)).toBe(110);
  });

  it("E7 flags a start after its end and a current role with an end date", () => {
    const d = clone(strong);
    (d.sections[1]!.items[1] as { start: string }).start = "2023-01";
    expect(failing(d)).toContain("E7");
    const e = clone(strong);
    (e.sections[1]!.items[0] as { end?: string }).end = "2023-01";
    expect(failing(e)).toContain("E7");
    expect(failing(strong)).not.toContain("E7");
  });

  it("F6 flags mixed date precision; A5 flags a year-only date on an ATS template", () => {
    const d = clone(strong);
    (d.sections[2]!.items[0] as { start: string; end: string }).start = "2015";
    expect(failing(d)).toContain("F6");
    expect(failing(d, ATS_STRICT)).toContain("A5");
    expect(failing(strong, ATS_STRICT)).not.toContain("A5");
  });

  it("F5 flags an empty bullet and an empty item; hidden things are ignored everywhere", () => {
    const d = clone(strong);
    (d.sections[1]!.items[0] as { bullets: Array<{ id: string; text: string }> }).bullets.push({ id: "b_blank001", text: "  " });
    expect(failing(d)).toContain("F5");
    const e = clone(strong);
    e.sections[3]!.items.push({ id: "i_blank001", group: "", skills: [] } as never);
    expect(failing(e)).toContain("F5");
    const h = clone(e);
    (h.sections[3]!.items[1] as { hidden?: boolean }).hidden = true;
    expect(failing(h)).not.toContain("F5");
    const hiddenSection = clone(strong);
    hiddenSection.sections[1]!.hidden = true;
    expect(failing(hiddenSection)).toContain("E1");
  });

  it("A1 flags a renamed built-in heading only when the template allows free headings", () => {
    const d = clone(strong);
    d.sections[1]!.title = "My Journey";
    const freeHeadings = { ...ATS_STRICT, headings: "free" as const };
    expect(failing(d, freeHeadings)).toContain("A1");
    expect(failing(d, ATS_STRICT)).not.toContain("A1");
  });

  it("A4 counts custom sections against the template's limit", () => {
    const d = clone(strong);
    for (const n of [1, 2]) d.sections.push({ id: `s_custom0${n}`, kind: "CUSTOM", title: `Extra ${n}`, items: [] } as never);
    expect(failing(d, ATS_STRICT)).toContain("A4");
    expect(failing(d, { ...ATS_STRICT, custom: "limited", customLimit: 2 })).not.toContain("A4");
    expect(failing(d, { ...ATS_STRICT, custom: "none" })).toContain("A4");
  });

  it("whole-word matching: a skill is not 'in context' inside a longer word, symbols still match", () => {
    const d = clone(strong);
    const k2 = (doc: ResumeDocument) => group(scoreResume(doc, ctx(DESIGN_FREE)), "G3").rules.find((x) => x.id === "K2")!.pass;
    (d.sections[0]!.items[0] as { text: string }).text = "Worked at Google on JavaScript tooling.";
    (d.sections[1]!.items[0] as { bullets: Array<{ text: string }> }).bullets[0]!.text = "Led a team of 8 shipping C++ services, increasing speed by 35%.";
    (d.sections[1]!.items[1] as { bullets: Array<{ text: string }> }).bullets = [{ id: "b_exp0004", text: "Launched 2 features." }] as never;
    (d.sections[1]!.items[0] as { bullets: Array<{ text: string }> }).bullets.splice(1);
    (d.sections[3]!.items[0] as { skills: string[] }).skills = ["Go", "Java"];
    expect(k2(d)).toBe(false); // "Go" is not inside "Google", "Java" not inside "JavaScript"
    (d.sections[3]!.items[0] as { skills: string[] }).skills = ["C++", "Go"];
    expect(k2(d)).toBe(true); // C++ is found although its edge is a symbol
  });

  it("tolerates garbage: missing sections, wrong types, no basics", () => {
    expect(() => scoreResume({}, ctx(DESIGN_FREE))).not.toThrow();
    expect(() => scoreResume({ sections: [null, 4, { kind: "EXPERIENCE", items: "x" }], basics: 3 }, ctx(DESIGN_FREE))).not.toThrow();
  });

  it("toPersistedScore keeps the compact record Spring stores (well under 4 KB)", () => {
    const p = toPersistedScore(scoreResume(strong, ctx(ATS_STRICT)));
    expect(p).toMatchObject({ rulesetVersion: "v1", score: 100 });
    expect(p.groups).toHaveLength(6);
    expect(JSON.stringify(p).length).toBeLessThan(1024);
  });

  it("bands come from the config, highest min first", () => {
    const cfg = { ...DEFAULT_SCORE_CONFIG, bands: [{ min: 0, title: "Low", body: "b0" }, { min: 90, title: "High", body: "b9" }] };
    expect(scoreResume(strong, ctx(DESIGN_FREE), cfg).band).toEqual({ title: "High", body: "b9" });
    expect(scoreResume(empty, ctx(DESIGN_FREE), cfg).band).toEqual({ title: "Low", body: "b0" });
  });
});
