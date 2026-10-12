import { describe, expect, it } from "vitest";
import { DRAFT_KEY, EMPTY_DRAFT, attestationRequired, failureOf, hasErrors, loadDraft, saveDraft, step1Errors, step2Errors, withName, type CreateDraft } from "./create-logic";

const draft = (over: Partial<CreateDraft> = {}): CreateDraft => ({ ...EMPTY_DRAFT, ...over });

describe("withName: the address follows the name until the person edits it", () => {
  it("derives the slug while it is not edited", () => {
    expect(withName(draft(), "Acme Bootcamp").slug).toBe("acme-bootcamp");
    expect(withName(draft({ slug: "acme-bootcamp" }), "Acme Academy").slug).toBe("acme-academy");
  });
  it("leaves an edited slug alone", () => {
    expect(withName(draft({ slug: "my-own", slugEdited: true }), "Something Else").slug).toBe("my-own");
  });
  it("empties the slug when the name is emptied", () => {
    expect(withName(draft({ name: "Acme", slug: "acme" }), "  ").slug).toBe("");
  });
});

describe("screen 1", () => {
  it("needs a name and a type", () => {
    const e = step1Errors(draft());
    expect(e.name).toBeTruthy();
    expect(e.type).toBeTruthy();
    expect(hasErrors(step1Errors(withName(draft({ type: "BOOTCAMP" }), "Acme")))).toBe(false);
  });
  it("refuses a name over 120 characters and a malformed address", () => {
    expect(step1Errors(withName(draft({ type: "COMPANY" }), "x".repeat(121))).name).toBeTruthy();
    expect(step1Errors(draft({ name: "Acme", type: "COMPANY", slug: "a" })).slug).toBeTruthy();
  });
});

describe("screen 2", () => {
  it("needs a size range and a country", () => {
    const e = step2Errors(draft({ type: "COMPANY" }));
    expect(e.sizeBand).toBeTruthy();
    expect(e.country).toBeTruthy();
    expect(hasErrors(step2Errors(draft({ type: "COMPANY", sizeBand: "1_50", country: "US" })))).toBe(false);
  });

  it("asks the 16-and-over attestation of a school or bootcamp and of nobody else", () => {
    expect(attestationRequired("BOOTCAMP")).toBe(true);
    expect(attestationRequired("SCHOOL")).toBe(true);
    for (const t of ["COMPANY", "OUTPLACEMENT", "CONSULTANCY", ""] as const) expect(attestationRequired(t)).toBe(false);
    const base = { sizeBand: "51_200", country: "US" };
    expect(step2Errors(draft({ ...base, type: "SCHOOL" })).attest16).toBeTruthy();
    expect(step2Errors(draft({ ...base, type: "SCHOOL", attest16: true })).attest16).toBeUndefined();
    expect(step2Errors(draft({ ...base, type: "COMPANY" })).attest16).toBeUndefined();
  });
});

describe("failureOf: which screen a refusal belongs to", () => {
  it("a taken address goes back to screen 1 with the API's suggestion", () => {
    expect(failureOf({ status: 409, code: "SLUG_TAKEN", suggestion: "acme-2" })).toMatchObject({ step: 1, field: "slug", suggestion: "acme-2" });
  });
  it("a sensitive-looking name goes to screen 1 on the name", () => {
    expect(failureOf({ status: 422, code: "SENSITIVE_CONTENT", path: "name" })).toMatchObject({ step: 1, field: "name" });
  });
  it("field problems go to the screen that owns the field", () => {
    expect(failureOf({ status: 422, code: "ORG_INVALID", field: "name" }).step).toBe(1);
    expect(failureOf({ status: 422, code: "ORG_INVALID", field: "country" })).toMatchObject({ step: 2, field: "country" });
    expect(failureOf({ status: 422, code: "ORG_INVALID", field: "mystery" })).toMatchObject({ step: 2, field: "form" });
  });
  it("the cap, the demo, a dropped connection and anything else stay on screen 2 with a reason", () => {
    expect(failureOf({ status: 422, code: "ORG_LIMIT_REACHED", max: 3 }).message).toContain("3");
    expect(failureOf({ status: 403, code: "DEMO_READ_ONLY" }).message).toContain("demo");
    expect(failureOf({ status: 0, code: "NETWORK" }).message).toContain("connection");
    expect(failureOf({ status: 500 })).toMatchObject({ step: 2, field: "form" });
  });
});

describe("the draft that survives a reload", () => {
  const mem = () => {
    const store = new Map<string, string>();
    return { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k), store };
  };

  it("round-trips and clears", () => {
    const s = mem();
    saveDraft(s, { step: 2, draft: draft({ name: "Acme", type: "BOOTCAMP", slug: "acme" }) });
    expect(loadDraft(s)).toMatchObject({ step: 2, draft: { name: "Acme", type: "BOOTCAMP" } });
    saveDraft(s, null);
    expect(loadDraft(s)).toBeNull();
  });

  it("ignores garbage, a step 3 and a storage that throws", () => {
    const s = mem();
    s.setItem(DRAFT_KEY, "{nope");
    expect(loadDraft(s)).toBeNull();
    s.setItem(DRAFT_KEY, JSON.stringify({ step: 3, draft: { name: "x" } }));
    expect(loadDraft(s)).toBeNull();
    expect(loadDraft({ getItem: () => { throw new Error("blocked"); } })).toBeNull();
    expect(() => saveDraft({ setItem: () => { throw new Error("blocked"); }, removeItem: () => {} }, { step: 1, draft: draft() })).not.toThrow();
  });
});
