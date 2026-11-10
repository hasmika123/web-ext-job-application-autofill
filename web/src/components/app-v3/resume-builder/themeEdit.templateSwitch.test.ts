import { describe, expect, it } from "vitest";
import { ATS_STRICT, DESIGN_FREE, listTemplates } from "@kiwiply/ui";
import type { ResumeDocument, TemplateMeta } from "@kiwiply/ui";
import capsDoc from "../../../../../packages/ui/src/resume/__fixtures__/caps-doc.json";
import { defaultedKeys, previewSwitch, themeChangeNote } from "./themeEdit";

describe("template switch preview (R3.4): the card's \"Hides\" line and the toast are one computation", () => {
  const doc = capsDoc as unknown as ResumeDocument;
  const meta = (defaults?: TemplateMeta["defaults"]): TemplateMeta => ({ ...listTemplates()[0], defaults });

  it("lists the theme keys the switch defaults: only the ones that change and only the untouched ones", () => {
    const to = meta({ accent: "#7c3aed", fontPair: "source-serif", spacing: "normal" });
    expect(defaultedKeys({ accent: "#2563eb", fontPair: "inter", spacing: "normal", _touched: ["accent"] }, to)).toEqual(["fontPair"]);
    expect(defaultedKeys(null, meta())).toEqual([]);
  });

  it("words the note for one, two and three keys", () => {
    expect(themeChangeNote([], "Classic")).toBeNull();
    expect(themeChangeNote(["fontPair"], "Classic")).toBe("Font is now Classic's default - change it in Customize Template.");
    expect(themeChangeNote(["accent", "fontPair"], "Classic")).toBe("Accent colour and font are now Classic's default - change them in Customize Template.");
    expect(themeChangeNote(["accent", "fontPair", "spacing"], "Classic")).toContain("Accent colour, font and spacing are now");
  });

  it("hidden content is judged on the theme the switch lands on, and the toast sentence is built from that same list", () => {
    const preview = previewSwitch(doc, { accent: "#16a34a" }, meta({ fontPair: "source-serif" }), ATS_STRICT);
    expect(preview.theme).toMatchObject({ accent: "#16a34a", fontPair: "source-serif" });
    expect(preview.defaulted).toEqual(["fontPair"]);
    expect(preview.hidden.length).toBeGreaterThan(0);
    expect(preview.notice).toBe(`Hidden in this ATS template: ${preview.hidden.map((h) => h.label).join(", ")}.`);
    expect(previewSwitch(doc, null, meta(), DESIGN_FREE).notice).toBeNull(); // nothing hidden: no sentence
  });
});
