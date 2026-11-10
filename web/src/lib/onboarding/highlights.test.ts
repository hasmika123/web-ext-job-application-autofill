import { describe, expect, it } from "vitest";
import { hasNumber, highlightFor, needsNumberTip, ruleOf } from "./highlights";

describe("hasNumber", () => {
  it.each([
    ["currency", "Saved the team $40k a year"],
    ["currency with m", "Closed a €1.2M deal"],
    ["currency in pounds", "Managed a £250,000 budget"],
    ["percent", "Lifted activation 18%"],
    ["percent with a space", "Grew signups by 40 %"],
    ["multiplier", "Made the build 3x faster"],
    ["thousands", "Served 12,000 requests a minute"],
    ["unit: users", "Onboarded 800 users"],
    ["unit: k", "Reached 40k"],
    ["unit: sessions", "Ran 30 sessions"],
    ["unit: years", "Six years in, 6 years of design"],
    ["unit: teams", "Supported 4 teams"],
    ["plus", "50+ clients across the region"],
    ["a number beside a date", "Shipped 3 tickets in Mar 2021"],
  ])("%s counts: %s", (_name, text) => {
    expect(hasNumber(text)).toBe(true);
  });

  it("a bare year does not", () => {
    expect(hasNumber("Founded in 2019")).toBe(false);
    expect(hasNumber("Graduated 2017")).toBe(false);
  });

  it("a date range does not", () => {
    expect(hasNumber("Jun 2018 - Feb 2021")).toBe(false);
    expect(hasNumber("2013 - 2017")).toBe(false);
    expect(hasNumber("2013–2017")).toBe(false);
    expect(hasNumber("Mar 2021 to Present")).toBe(false);
    expect(hasNumber("September 2019 - 2021")).toBe(false);
  });

  it("a word that merely contains a unit letter does not", () => {
    expect(hasNumber("Worked on the redesign")).toBe(false);
    expect(hasNumber("Mentored the team")).toBe(false);
    expect(hasNumber("Version two of the app")).toBe(false);
    expect(hasNumber("Used k8s and h264")).toBe(false);
  });
});

describe("ruleOf", () => {
  it("outcome words are a whole-word contains match, anywhere in the bullet", () => {
    for (const w of ["increased", "reduced", "cut", "grew", "improved", "saved", "boosted", "doubled", "tripled", "halved", "accelerated", "decreased", "raised", "lowered", "drove", "generated", "won", "achieved", "exceeded", "lifted", "sped up"]) {
      expect(ruleOf(`The team ${w} the thing`), w).toBe("outcome");
    }
    expect(ruleOf("Cut checkout drop-off with a simpler form")).toBe("outcome");
    expect(ruleOf("A cute little prototype")).toBeNull(); // "cut" inside "cute" is not "cut"
    expect(ruleOf("Discussed the reduction plan")).toBeNull();
  });

  it("lead words only count at the START of the bullet; \"led\" mid-sentence is not lead", () => {
    for (const w of ["led", "lead", "managed", "mentored", "coached", "coordinated", "directed", "owned", "oversaw", "ran", "headed", "founded", "co-founded", "organized", "organised", "supervised", "trained", "chaired", "captained"]) {
      expect(ruleOf(`${w[0].toUpperCase()}${w.slice(1)} the weekly review`), w).toBe("lead");
    }
    expect(ruleOf("• Led the weekly review")).toBe("lead"); // a bullet glyph is not text
    expect(ruleOf("The weekly review was led by me")).toBeNull();
    expect(ruleOf("I led the weekly review")).toBeNull();
    expect(ruleOf("Leadership of the weekly review")).toBeNull();
    expect(ruleOf("Misled by the brief")).toBeNull();
  });

  it("built words only count at the start", () => {
    for (const w of ["built", "shipped", "launched", "designed", "created", "developed", "implemented", "automated", "delivered", "engineered", "released", "published", "deployed", "wrote", "prototyped", "migrated"]) {
      expect(ruleOf(`${w[0].toUpperCase()}${w.slice(1)} the new flow`), w).toBe("built");
    }
    expect(ruleOf("Responsible for what we built")).toBeNull();
  });

  it("each bullet's highest rule wins: number > outcome > lead > built", () => {
    expect(ruleOf("Led a team that cut costs 12%")).toBe("number");
    expect(ruleOf("Led a team that cut costs")).toBe("outcome");
    expect(ruleOf("Led a team of designers")).toBe("lead");
    expect(ruleOf("Built a design system")).toBe("built");
    expect(ruleOf("Worked with design and research")).toBeNull();
  });
});

describe("highlightFor", () => {
  it("no bullets gives nothing", () => {
    expect(highlightFor([])).toBeNull();
  });

  it("nothing matching gives nothing", () => {
    expect(highlightFor(["Worked with design and research", "Attended standups"])).toBeNull();
  });

  it("returns the chip's copy key so the admin's override applies", () => {
    expect(highlightFor(["Lifted activation 18%"])).toEqual({ index: 0, rule: "number", label: "highlight.number" });
    expect(highlightFor(["Cut drop-off"])).toEqual({ index: 0, rule: "outcome", label: "highlight.outcome" });
    expect(highlightFor(["Led the review"])).toEqual({ index: 0, rule: "lead", label: "highlight.lead" });
    expect(highlightFor(["Built the system"])).toEqual({ index: 0, rule: "built", label: "highlight.built" });
  });

  it("priority is number > outcome > lead > built, over the whole card, whatever the order of the bullets", () => {
    const lead = "Led the guild";
    const built = "Built the library";
    const outcome = "Cut review time";
    const number = "Reached 40k users";
    expect(highlightFor([built, lead, outcome, number])?.rule).toBe("number");
    expect(highlightFor([built, lead, outcome])?.rule).toBe("outcome");
    expect(highlightFor([built, lead])?.rule).toBe("lead");
    expect(highlightFor([built])?.rule).toBe("built");
  });

  it("the chip goes on the FIRST bullet matching the winning rule", () => {
    expect(highlightFor(["Worked on things", "Reached 40k users", "Grew signups 20%"])).toMatchObject({ index: 1, rule: "number" });
    expect(highlightFor(["Built a thing", "Led the guild", "Mentored two peers"])).toMatchObject({ index: 1, rule: "lead" });
    expect(highlightFor(["Worked on things", "Saved the launch", "Improved the docs"])).toMatchObject({ index: 1, rule: "outcome" });
  });

  it("at most one chip per card, even when every bullet qualifies", () => {
    expect(highlightFor(["Led it 10%", "Built it 20%", "Cut it 30%"])).toMatchObject({ index: 0, rule: "number" });
  });

  it("is deterministic and pure (the same bullets, the same answer)", () => {
    const bullets = ["Ran 30 usability sessions", "Cut checkout drop-off"];
    expect(highlightFor(bullets)).toEqual(highlightFor([...bullets]));
  });

  it("the sample resume's cards behave: a date does not make a number", () => {
    expect(highlightFor(["Prototyped three landing pages in Figma."])).toMatchObject({ rule: "built", index: 0 });
    // "30 usability sessions" has a word between the figure and its unit, so it is not a number by the design's rule; the result verb is
    expect(highlightFor(["Ran 30 usability sessions and shipped the findings.", "Cut checkout drop-off by a fifth with a simpler form."])).toMatchObject({ rule: "outcome", index: 1 });
    expect(highlightFor(["Led the redesign of onboarding, lifting activation 18%.", "Built the design system used by 40 engineers."])).toMatchObject({ rule: "number", index: 0 });
    expect(highlightFor(["Worked in 2019 - 2021 on checkout"])).toBeNull();
  });
});

describe("needsNumberTip", () => {
  it("experience and project cards with bullets and no number get the tip", () => {
    expect(needsNumberTip("EXPERIENCE", ["Led the guild", "Built the library"])).toBe(true);
    expect(needsNumberTip("PROJECT", ["Prototyped three landing pages"])).toBe(true);
  });

  it("never on education", () => {
    expect(needsNumberTip("EDUCATION", ["Dean's list"])).toBe(false);
  });

  it("not when any bullet has a number, and not on an empty card", () => {
    expect(needsNumberTip("EXPERIENCE", ["Led the guild", "Reached 40k users"])).toBe(false);
    expect(needsNumberTip("EXPERIENCE", [])).toBe(false);
    expect(needsNumberTip("PROJECT", [])).toBe(false);
  });

  it("a date alone does not silence the tip", () => {
    expect(needsNumberTip("EXPERIENCE", ["Worked there Jun 2018 - Feb 2021"])).toBe(true);
  });
});
