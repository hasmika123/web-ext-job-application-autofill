// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseResume, parseTextWithAi } from "@/lib/resume-parse";

// X11.7: the text of an uploaded resume is stripped of never-collected values BEFORE it is parsed, stored as parsedJson or sent to the AI parser.
const TEXT = [
  "Jane Doe",
  "jane@example.com",
  "SSN: 123-45-6789",
  "Bank account number: 123456789012",
  "Senior Engineer at Acme, 2019 - 2024",
].join("\n");

describe("resume parse scrubs never-collected values", () => {
  it("parseResume removes an SSN and a bank number from the text it structures", async () => {
    const file = new File([TEXT], "resume.txt", { type: "text/plain" });
    const parsed = await parseResume(file);
    expect(parsed.rawText).not.toContain("123-45-6789");
    expect(parsed.rawText).not.toContain("123456789012");
    expect(JSON.stringify(parsed.structured)).not.toContain("123-45-6789");
    expect(parsed.rawText).toContain("Jane Doe");
  });

  it("parseTextWithAi sends the scrubbed text, never the raw one", async () => {
    const sent: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
      sent.push(String(init?.body ?? ""));
      return new Response(JSON.stringify({}), { status: 500 });
    }) as typeof fetch;
    try {
      const parsed = await parseTextWithAi(TEXT);
      expect(sent.join("")).not.toContain("123-45-6789");
      expect(sent.join("")).not.toContain("123456789012");
      expect(parsed.rawText).not.toContain("123-45-6789");
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("an explicit prepareText still wins (the setup wizard keeps its own pass)", async () => {
    const file = new File([TEXT], "resume.txt", { type: "text/plain" });
    const parsed = await parseResume(file, { prepareText: (t) => t.toUpperCase() });
    expect(parsed.rawText).toContain("JANE DOE");
  });
});
