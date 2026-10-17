import { describe, expect, it } from "vitest";
import { canonicalJson, writeJson } from "./json";
import { fixtureText, onePageSample, sampleDoc } from "./test-fixtures";
import { SECTION_KINDS, type ResumeDocument } from "./types";

const ID = /^[a-z]_[A-Za-z0-9]{6,12}$/;
const DATE = /^(19|20)\d{2}(-(0[1-9]|1[0-2]))?$/;

/** Every id in the document, in order. */
function ids(doc: ResumeDocument): string[] {
  const out: string[] = [];
  for (const s of doc.sections) {
    out.push(s.id);
    for (const it of s.items as Array<{ id: string; bullets?: Array<{ id: string }> }>) {
      out.push(it.id);
      for (const b of it.bullets ?? []) out.push(b.id);
    }
  }
  return out;
}

describe("sample-resume.json (the shared template fixture)", () => {
  const doc = sampleDoc();

  it("is a schema 2 document with well-formed unique ids, valid dates and in-range marks (the Java validator accepts it too)", () => {
    expect(doc.schema).toBe(2);
    const all = ids(doc);
    expect(new Set(all).size).toBe(all.length);
    for (const id of all) expect(id, id).toMatch(ID);
    for (const s of doc.sections) {
      for (const it of s.items as Array<Record<string, unknown>>) {
        for (const k of ["start", "end", "date"]) {
          const v = it[k];
          if (typeof v === "string" && v) expect(v, `${k} ${v}`).toMatch(DATE);
        }
        const texts = [it, ...(((it.bullets as Array<Record<string, unknown>>) ?? []))];
        for (const t of texts) {
          const text = typeof t.text === "string" ? t.text : "";
          for (const m of (t.marks as Array<{ s: number; e: number; t: string; href?: string }>) ?? []) {
            expect(m.s).toBeGreaterThanOrEqual(0);
            expect(m.e).toBeLessThanOrEqual(text.length);
            expect(m.s).toBeLessThan(m.e);
            expect(m.t === "a").toBe(m.href !== undefined);
          }
        }
      }
    }
  });

  it("canonical-writes: re-parsing the canonical form is the same document", () => {
    expect(JSON.parse(canonicalJson(doc))).toEqual(JSON.parse(JSON.stringify(doc)));
    expect(JSON.parse(writeJson(doc))).toEqual(doc);
  });

  it("has every section kind, once each (CUSTOM is Volunteering)", () => {
    expect(doc.sections.map((s) => s.kind).sort()).toEqual([...SECTION_KINDS].sort());
    expect(doc.sections.find((s) => s.kind === "CUSTOM")?.title).toBe("Volunteering");
    const exp = doc.sections.find((s) => s.kind === "EXPERIENCE")!.items;
    expect(exp).toHaveLength(3);
    expect(exp.filter((i) => (i as { current?: boolean }).current)).toHaveLength(1);
    expect(doc.sections.find((s) => s.kind === "SKILLS")!.items).toHaveLength(5);
  });

  it("never carries sensitive personal data: no date of birth, SSN-like or long digit runs, no ID words; the phone is the fictional 555-01xx range", () => {
    const text = fixtureText("sample-resume.json");
    expect(text).not.toMatch(/\d{3}-\d{2}-\d{4}/); // SSN shape
    expect(text).not.toMatch(/\d{9,}/); // 9+ digit runs (account / ID numbers)
    expect(text).not.toMatch(/(19|20)\d{2}-\d{2}-\d{2}/); // full dates (a date of birth)
    expect(text).not.toMatch(/date of birth|DOB|SSN|passport|social security|tax id|ITIN/i);
    expect(doc.basics.phone).toMatch(/555\) 010-/);
    expect(doc.basics.email).toMatch(/@example\.com$/);
    for (const l of doc.basics.links ?? []) expect(l.url).toMatch(/example/);
  });

  it("onePageSample hides the third role, the second project and the Volunteering section, and changes nothing else", () => {
    const one = onePageSample();
    expect(one.sections.find((s) => s.kind === "CUSTOM")?.hidden).toBe(true);
    const exp = one.sections.find((s) => s.kind === "EXPERIENCE")!.items as Array<{ hidden?: boolean }>;
    expect(exp.map((i) => !!i.hidden)).toEqual([false, false, true]);
    const prj = one.sections.find((s) => s.kind === "PROJECTS")!.items as Array<{ hidden?: boolean }>;
    expect(prj.map((i) => !!i.hidden)).toEqual([false, true]);
    expect(sampleDoc()).toEqual(doc); // a fresh copy each call; the original is untouched
  });
});
