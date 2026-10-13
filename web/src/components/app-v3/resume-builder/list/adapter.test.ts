import { describe, expect, it } from "vitest";
import { toCardModel, type ResumeDto } from "./adapter";

const built = (over: Partial<ResumeDto> = {}): ResumeDto => ({
  id: 7,
  label: "Backend SWE",
  kind: "BUILT",
  templateId: "modern",
  createdAt: "2026-09-15T10:00:00Z",
  archived: false,
  defaultResume: false,
  ...over,
});

describe("toCardModel", () => {
  it("maps the name from the label and falls back when it is blank", () => {
    expect(toCardModel(built({ label: "Backend SWE" })).name).toBe("Backend SWE");
    expect(toCardModel(built({ label: "   " })).name).toBe("Untitled resume");
  });

  it("status is the server's lifecycle", () => {
    expect(toCardModel(built({ lifecycle: "ACTIVE" })).status).toBe("Active");
    expect(toCardModel(built({ lifecycle: "DRAFT" })).status).toBe("Draft");
    expect(toCardModel(built({ lifecycle: "ARCHIVED" })).status).toBe("Archived");
    // the lifecycle wins over the raw flag
    expect(toCardModel(built({ lifecycle: "DRAFT", archived: false })).status).toBe("Draft");
  });

  it("without a lifecycle (an API from before the metadata model) status is Active unless archived", () => {
    expect(toCardModel(built()).status).toBe("Active");
    expect(toCardModel(built({ archived: null })).status).toBe("Active");
    expect(toCardModel(built({ archived: true })).status).toBe("Archived");
  });

  it("primary comes from the primary flag, falling back to defaultResume; an archived resume is never primary", () => {
    expect(toCardModel(built({ primary: true })).isPrimary).toBe(true);
    expect(toCardModel(built({ primary: false, defaultResume: true })).isPrimary).toBe(false);
    expect(toCardModel(built({ defaultResume: true })).isPrimary).toBe(true);
    expect(toCardModel(built({ defaultResume: false })).isPrimary).toBe(false);
    expect(toCardModel(built({ defaultResume: null })).isPrimary).toBe(false);
    expect(toCardModel(built({ defaultResume: true, archived: true })).isPrimary).toBe(false);
    expect(toCardModel(built({ primary: true, lifecycle: "ARCHIVED" })).isPrimary).toBe(false);
  });

  it("createdAt is the DTO's, or null so the card can hide the row", () => {
    expect(toCardModel(built()).createdAt).toBe("2026-09-15T10:00:00Z");
    expect(toCardModel(built({ createdAt: null })).createdAt).toBeNull();
    expect(toCardModel(built({ createdAt: undefined })).createdAt).toBeNull();
  });

  it("modifiedAt prefers updatedAt, falls back to createdAt, else null", () => {
    expect(toCardModel(built({ updatedAt: "2026-10-08T00:00:00Z" })).modifiedAt).toBe("2026-10-08T00:00:00Z");
    expect(toCardModel(built()).modifiedAt).toBe("2026-09-15T10:00:00Z");
    expect(toCardModel(built({ createdAt: null })).modifiedAt).toBeNull();
  });

  it("tags are the resume's own tags, even when there are none", () => {
    expect(toCardModel(built({ tags: ["backend", "2026"] })).tags).toEqual(["backend", "2026"]);
    expect(toCardModel(built({ tags: [] })).tags).toEqual([]);
  });

  it("an API from before the metadata model (no tags field at all) falls back to the kind", () => {
    expect(toCardModel(built()).tags).toEqual(["Built"]);
    expect(toCardModel(built({ tags: null })).tags).toEqual(["Built"]);
    expect(toCardModel(built({ kind: "UPLOADED", templateId: null })).tags).toEqual(["Uploaded"]);
    expect(toCardModel(built({ kind: undefined })).tags).toEqual(["Uploaded"]);
  });

  it("target is the resume's target, or null when blank", () => {
    expect(toCardModel(built({ target: "Backend SWE" })).target).toBe("Backend SWE");
    expect(toCardModel(built({ target: "  " })).target).toBeNull();
    expect(toCardModel(built()).target).toBeNull();
  });

  it("templateId is kept for built resumes only (uploads have no thumbnail)", () => {
    expect(toCardModel(built()).templateId).toBe("modern");
    expect(toCardModel(built({ templateId: "" })).templateId).toBeNull();
    expect(toCardModel(built({ kind: "UPLOADED", templateId: "modern" })).templateId).toBeNull();
  });

  it("atsFriendly only when the template registry marks the template ATS-safe", () => {
    expect(toCardModel(built({ templateId: "modern" })).atsFriendly).toBe(true);
    // unknown template id: the registry cannot vouch for it
    expect(toCardModel(built({ templateId: "not-a-template" })).atsFriendly).toBeUndefined();
    // an uploaded file has no template
    expect(toCardModel(built({ kind: "UPLOADED", templateId: null })).atsFriendly).toBeUndefined();
  });

  it("score is the stored Resume Score of a built resume (null for uploads and never-scored resumes)", () => {
    expect(toCardModel(built({ score: 82 })).score).toBe(82);
    expect(toCardModel(built({ score: 81.6 })).score).toBe(82);
    expect(toCardModel(built({ score: 0 })).score).toBe(0);
    expect(toCardModel(built({ score: null })).score).toBeNull();
    expect(toCardModel(built()).score).toBeNull();
    expect(toCardModel(built({ kind: "UPLOADED", templateId: null, score: 50 })).score).toBeNull();
  });

  it("pdfState compares the exported hash with the content hash (built resumes only)", () => {
    expect(toCardModel(built({ contentHash: "b", exportedHash: "a" })).pdfState).toBe("outOfDate");
    expect(toCardModel(built({ contentHash: "a", exportedHash: "a" })).pdfState).toBe("current");
    expect(toCardModel(built({ contentHash: "a", exportedHash: null })).pdfState).toBe("none");
    expect(toCardModel(built({ kind: "UPLOADED", templateId: null, contentHash: "b", exportedHash: "a" })).pdfState).toBe("none");
  });

  it("pdfState follows the API's PDF job state when it reports one (R3.7)", () => {
    const withPdf = (status: "NONE" | "PENDING" | "RUNNING" | "READY" | "FAILED" | "STALE", over: Partial<ResumeDto> = {}) =>
      toCardModel(built({ contentHash: "b", exportedHash: "a", pdf: { status }, ...over })).pdfState;
    expect(withPdf("PENDING")).toBe("updating");
    expect(withPdf("RUNNING")).toBe("updating");
    expect(withPdf("STALE")).toBe("updating");
    expect(withPdf("FAILED")).toBe("failed");
    expect(withPdf("READY")).toBe("current"); // the job state wins over the legacy hash comparison
    expect(withPdf("NONE")).toBe("none");
    expect(withPdf("FAILED", { kind: "UPLOADED", templateId: null })).toBe("none"); // uploads never have a job
  });

  it("type: Tailored beats Built; an upload is Uploaded", () => {
    expect(toCardModel(built()).type).toBe("Built");
    expect(toCardModel(built({ role: "TAILORED" })).type).toBe("Tailored");
    expect(toCardModel(built({ role: "MASTER" })).type).toBe("Built");
    expect(toCardModel(built({ kind: "UPLOADED", templateId: null })).type).toBe("Uploaded");
  });

  it("score is optional (R2.5 adds it): a number is clamped and rounded, anything else is null", () => {
    expect(toCardModel(built()).score).toBeNull();
    expect(toCardModel(built({ score: 82.4 })).score).toBe(82);
    expect(toCardModel(built({ score: 140 })).score).toBe(100);
    expect(toCardModel(built({ score: -3 })).score).toBe(0);
    expect(toCardModel(built({ score: null })).score).toBeNull();
    expect(toCardModel(built({ score: Number.NaN })).score).toBeNull();
  });

  it("exportedAt is the last stored PDF's time, or null", () => {
    expect(toCardModel(built({ exportedAt: "2026-10-01T00:00:00Z" })).exportedAt).toBe("2026-10-01T00:00:00Z");
    expect(toCardModel(built()).exportedAt).toBeNull();
  });

  it("thumbHash (R3.13) is the server thumbnail's render hash, kept whatever the PDF state, and never on an upload", () => {
    expect(toCardModel(built()).thumbHash).toBeNull();
    expect(toCardModel(built({ thumbHash: "abc" })).thumbHash).toBe("abc");
    expect(toCardModel(built({ thumbHash: "abc", pdf: { status: "PENDING" } })).thumbHash).toBe("abc"); // stale picture kept while the PDF is remade
    expect(toCardModel(built({ thumbHash: "  " })).thumbHash).toBeNull();
    expect(toCardModel(built({ kind: "UPLOADED", templateId: null, thumbHash: "abc" })).thumbHash).toBeNull();
  });

  it("keeps the id and kind", () => {
    const m = toCardModel(built({ id: 42 }));
    expect(m.id).toBe(42);
    expect(m.kind).toBe("BUILT");
  });
});
