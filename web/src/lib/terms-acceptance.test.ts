import { describe, expect, it } from "vitest";
import { isUpdate, parseTermsStatus, pendingDocuments } from "./terms-acceptance";

const doc = (over: Record<string, unknown> = {}) => ({ currentVersion: "2026-10", accepted: true, lastAcceptedVersion: "2026-10", lastAcceptedAt: "2026-10-01T00:00:00Z", ...over });

describe("terms acceptance status", () => {
  it("reads the API's status and nothing else", () => {
    const s = parseTermsStatus({ terms: doc(), privacy: doc(), upToDate: true });
    expect(s).toEqual({
      terms: { currentVersion: "2026-10", accepted: true, lastAcceptedVersion: "2026-10" },
      privacy: { currentVersion: "2026-10", accepted: true, lastAcceptedVersion: "2026-10" },
      upToDate: true,
    });
  });

  it("returns null for a shape it does not know, so the banner stays away", () => {
    expect(parseTermsStatus(null)).toBeNull();
    expect(parseTermsStatus({ terms: doc() })).toBeNull();
    expect(parseTermsStatus({ terms: { currentVersion: 5 }, privacy: doc() })).toBeNull();
  });

  it("lists only the documents still to accept, with the version in force", () => {
    const s = parseTermsStatus({ terms: doc({ currentVersion: "2027-01", accepted: false }), privacy: doc(), upToDate: false })!;
    expect(pendingDocuments(s)).toEqual([{ document: "TERMS", version: "2027-01" }]);
    expect(isUpdate(s)).toBe(true);
  });

  it("is not an update when there is no earlier acceptance at all", () => {
    const none = { accepted: false, lastAcceptedVersion: null };
    const s = parseTermsStatus({ terms: doc(none), privacy: doc(none), upToDate: false })!;
    expect(pendingDocuments(s).map((d) => d.document)).toEqual(["TERMS", "PRIVACY"]);
    expect(isUpdate(s)).toBe(false);
  });
});
