import { beforeEach, describe, expect, it, vi } from "vitest";

const parseResumeWithAi = vi.fn();
const parseResume = vi.fn();
const parseTextWithAi = vi.fn();
const parseText = vi.fn();

vi.mock("@/lib/resume-parse", () => ({
  parseResumeWithAi: (...a: unknown[]) => parseResumeWithAi(...a),
  parseResume: (...a: unknown[]) => parseResume(...a),
  parseTextWithAi: (...a: unknown[]) => parseTextWithAi(...a),
  parseText: (...a: unknown[]) => parseText(...a),
}));

import { NothingFoundError, parseFileForResume, parseFileForSetup, parseTextForSetup } from "./parse";

const ok = (source: "ai" | "heuristic" = "ai") => ({
  structured: {
    summary: "",
    skills: ["Go"],
    experience: [{ company: "Acme", title: "Engineer", location: "", startDate: "2020", endDate: "", current: true, bullets: ["Shipped"] }],
    education: [],
    languages: [],
    projects: [],
  },
  bio: { firstName: "Jane" },
  rawText: "Jane\nGo",
  source,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("parseFileForSetup", () => {
  it("strips never-collected values from the extracted text and never lets the AI parser take the file", async () => {
    let seen = "";
    parseResumeWithAi.mockImplementation(async (_f: File, opts: { prepareText: (t: string) => string; textOnly: boolean }) => {
      seen = opts.prepareText("Led a team\nSSN 123-45-6789\nDOB: 04/05/1990");
      expect(opts.textOnly).toBe(true);
      return ok();
    });
    const out = await parseFileForSetup(new File(["x"], "cv.pdf", { type: "application/pdf" }), true);
    expect(seen).not.toContain("123-45-6789");
    expect(seen).not.toContain("04/05/1990");
    expect(seen).toContain("Led a team");
    expect(out.removed).toBe(2);
    expect(out.source).toBe("ai");
    expect(out.draft.candidates).toHaveLength(1);
  });

  it("uses the local parser when the user opted out of AI, still redacting first", async () => {
    parseResume.mockImplementation(async (_f: File, opts: { prepareText: (t: string) => string }) => {
      expect(opts.prepareText("EIN: 12-3456789")).not.toContain("12-3456789");
      return ok("heuristic");
    });
    const out = await parseFileForSetup(new File(["x"], "cv.txt"), false);
    expect(parseResumeWithAi).not.toHaveBeenCalled();
    expect(out.source).toBe("heuristic");
    expect(out.removed).toBe(1);
  });

  it("explains a PDF whose text is unreadable instead of importing nothing", async () => {
    parseResumeWithAi.mockResolvedValue({ structured: { summary: "", skills: [], experience: [], education: [], languages: [], projects: [] }, bio: {}, rawText: "", source: "heuristic", garbled: true });
    await expect(parseFileForSetup(new File(["x"], "scan.pdf"), true)).rejects.toThrow(/scan/);
    await expect(parseFileForSetup(new File(["x"], "scan.pdf"), true)).rejects.toBeInstanceOf(NothingFoundError);
  });
});

describe("parseFileForResume (the new-resume chooser's upload)", () => {
  it("redacts the text first, never lets the AI parser take the file, and returns the structure with its indexes intact", async () => {
    let seen = "";
    parseResumeWithAi.mockImplementation(async (_f: File, opts: { prepareText: (t: string) => string; textOnly: boolean }) => {
      seen = opts.prepareText("Led a team\nSSN 123-45-6789");
      expect(opts.textOnly).toBe(true);
      return {
        ...ok(),
        structured: {
          ...ok().structured,
          // a value the parser put back after the text was redacted, in the SECOND role: it is cleaned, not dropped
          experience: [ok().structured.experience[0], { ...ok().structured.experience[0], company: "Globex", bullets: ["Visa number: A12345678 was handled"] }],
        },
      };
    });
    const out = await parseFileForResume(new File(["x"], "cv.pdf", { type: "application/pdf" }), true);
    expect(seen).not.toContain("123-45-6789");
    expect(out.structured.experience).toHaveLength(2); // indexes are what the KeepMask refers to
    expect(out.structured.experience[1].company).toBe("Globex");
    expect(JSON.stringify(out.structured)).not.toContain("A12345678");
    expect(out.bio).toEqual({ firstName: "Jane" });
    expect(out.source).toBe("ai");
    expect(out.removed).toBeGreaterThanOrEqual(2);
  });

  it("uses the local parser without AI", async () => {
    parseResume.mockResolvedValue(ok("heuristic"));
    const out = await parseFileForResume(new File(["x"], "cv.txt"), false);
    expect(parseResumeWithAi).not.toHaveBeenCalled();
    expect(out.source).toBe("heuristic");
  });

  it("refuses a file with nothing in it, saying why", async () => {
    parseResumeWithAi.mockResolvedValue({ structured: { summary: "", skills: [], experience: [], education: [], languages: [], projects: [] }, bio: {}, rawText: "", source: "heuristic", garbled: true });
    await expect(parseFileForResume(new File(["x"], "scan.pdf"), true)).rejects.toBeInstanceOf(NothingFoundError);
  });
});

describe("parseTextForSetup", () => {
  it("redacts the pasted text before it is sent to the AI parser", async () => {
    parseTextWithAi.mockResolvedValue(ok());
    const out = await parseTextForSetup("Acme engineer\nTax ID: 12-3456789\nPassport number: X1234567", true);
    const sent = parseTextWithAi.mock.calls[0][0] as string;
    expect(sent).not.toContain("12-3456789");
    expect(sent).not.toContain("X1234567");
    expect(out.removed).toBe(2);
  });

  it("parses locally without AI", async () => {
    parseText.mockReturnValue(ok("heuristic"));
    await parseTextForSetup("Acme engineer", false);
    expect(parseTextWithAi).not.toHaveBeenCalled();
    expect(parseText).toHaveBeenCalledWith("Acme engineer");
  });

  it("says so when there is nothing to build from", async () => {
    parseText.mockReturnValue({ structured: { summary: "", skills: [], experience: [], education: [], languages: [], projects: [] }, bio: {}, rawText: "hi", source: "heuristic" });
    await expect(parseTextForSetup("hi there hi there hi there hi there hi", false)).rejects.toThrow(/couldn't find/);
  });
});
