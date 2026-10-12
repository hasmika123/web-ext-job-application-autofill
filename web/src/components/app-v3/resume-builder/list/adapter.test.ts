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

  it("status is Active unless archived; Draft is never produced yet", () => {
    expect(toCardModel(built()).status).toBe("Active");
    expect(toCardModel(built({ archived: null })).status).toBe("Active");
    expect(toCardModel(built({ archived: true })).status).toBe("Archived");
  });

  it("primary comes from defaultResume, and an archived resume is never primary", () => {
    expect(toCardModel(built({ defaultResume: true })).isPrimary).toBe(true);
    expect(toCardModel(built({ defaultResume: false })).isPrimary).toBe(false);
    expect(toCardModel(built({ defaultResume: null })).isPrimary).toBe(false);
    expect(toCardModel(built({ defaultResume: true, archived: true })).isPrimary).toBe(false);
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

  it("tags are the resume kind", () => {
    expect(toCardModel(built()).tags).toEqual(["Built"]);
    expect(toCardModel(built({ kind: "UPLOADED", templateId: null })).tags).toEqual(["Uploaded"]);
    expect(toCardModel(built({ kind: undefined })).tags).toEqual(["Uploaded"]);
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

  it("keeps the id and kind", () => {
    const m = toCardModel(built({ id: 42 }));
    expect(m.id).toBe(42);
    expect(m.kind).toBe("BUILT");
  });
});
