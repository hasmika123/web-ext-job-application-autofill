import { describe, expect, it } from "vitest";
import { actorLine, actorText, actorWithTag, isViewer, relationTag, rowActorLine, safeLabel, updatedLine, type ChangeActor } from "./actors";

const ME = { id: 7, login: "anika" };
const person = (over: Partial<ChangeActor> = {}): ChangeActor => ({ userId: 7, label: "Anika Shah", kind: "PERSON", ...over });
const sarah = person({ userId: 99, label: "Sarah Chen", relation: "marketer" });
const nonPerson = (kind: string): ChangeActor => ({ userId: null, label: "Kiwiply", kind });

describe("actorText", () => {
  it("is 'you' for the viewer, the label for anyone else, and 'you' for a record with no recorded writer", () => {
    expect(actorText(person(), ME)).toBe("you");
    expect(actorText(sarah, ME)).toBe("Sarah Chen");
    expect(actorText(null, ME)).toBe("you");
    expect(actorText(undefined, null)).toBe("you");
  });

  it("with no viewer known, nobody is 'you' (the label is shown as it is)", () => {
    expect(actorText(person(), null)).toBe("Anika Shah");
  });

  it("also renders the resume's {login,label} actor, by login (so the resume header can adopt it)", () => {
    expect(actorText({ login: "anika", label: "Anika Shah" }, ME)).toBe("you");
    expect(actorText({ login: "rahul", label: "Rahul" }, ME)).toBe("Rahul");
    expect(actorText({ login: "rahul", label: "Rahul" }, { login: null })).toBe("Rahul");
  });

  it("never prints an enterprise login", () => {
    expect(actorText(person({ userId: 99, label: "ent#9#sarah@x.com" }), ME)).toBe("a member");
    expect(safeLabel("  ENT#9#x ")).toBe("a member");
    expect(safeLabel("")).toBe("a member");
  });

  it("a non-person is never the viewer", () => {
    expect(isViewer({ userId: 7, label: "x", kind: "EXTENSION" }, ME)).toBe(false);
  });
});

describe("actorLine: every row of README section 2.3, as the owner reads it", () => {
  it("owner edits in the web app: 'by you'", () => {
    expect(actorLine(person(), "PERSON", "WEB", ME)).toBe("by you");
  });
  it("owner clicks in the extension drawer: 'by you via the extension'", () => {
    expect(actorLine(person(), "PERSON", "EXTENSION", ME)).toBe("by you via the extension");
  });
  it("extension submit-detect: 'by the extension'", () => {
    expect(actorLine(nonPerson("EXTENSION"), "EXTENSION", "EXTENSION", ME)).toBe("by the extension");
  });
  it("inbox parser: 'by Kiwiply from your email'", () => {
    expect(actorLine(nonPerson("MAIL"), "MAIL", "INBOX", ME)).toBe("by Kiwiply from your email");
  });
  it("assistant: 'by Kiwiply AI'", () => {
    expect(actorLine(nonPerson("ASSISTANT"), "ASSISTANT", "ASSISTANT", ME)).toBe("by Kiwiply AI");
  });
  it("migration, seed, projections: 'by Kiwiply'", () => {
    expect(actorLine(nonPerson("SYSTEM"), "SYSTEM", "SYSTEM", ME)).toBe("by Kiwiply");
  });
  it("a marketer acting for the consultant: 'by Sarah Chen' (the tag is a chip, not part of the words)", () => {
    expect(actorLine(sarah, "PERSON", "WEB", ME)).toBe("by Sarah Chen");
    expect(relationTag(sarah, ME)).toBe("MARKETER");
    expect(actorWithTag(sarah, ME)).toBe("Sarah Chen MARKETER");
  });
  it("an old payload with only a channel reads from the channel", () => {
    expect(actorLine(null, null, "WEB", ME)).toBe("by you");
    expect(actorLine(null, undefined, "EXTENSION", ME)).toBe("by you via the extension");
    expect(actorLine(null, null, "INBOX", ME)).toBe("by Kiwiply from your email");
    expect(actorLine(null, null, "ASSISTANT", ME)).toBe("by Kiwiply AI");
    expect(actorLine(null, null, "SYSTEM", ME)).toBe("by Kiwiply");
  });
  it("the kind wins over the channel", () => {
    expect(actorLine(nonPerson("EXTENSION"), "EXTENSION", "WEB", ME)).toBe("by the extension");
  });
});

describe("relationTag", () => {
  it("none for the viewer, a non-person, or a missing relation", () => {
    expect(relationTag(person({ relation: "consultant" }), ME)).toBeNull();
    expect(relationTag({ ...nonPerson("SYSTEM"), relation: "system" }, ME)).toBeNull();
    expect(relationTag(person({ userId: 99 }), ME)).toBeNull();
    expect(relationTag(null, ME)).toBeNull();
    expect(relationTag({ login: "x", label: "X" }, ME)).toBeNull();
  });
  it("is the relation, upper-cased", () => {
    expect(relationTag(person({ userId: 5, relation: "admin" }), ME)).toBe("ADMIN");
  });
});

describe("rowActorLine (D2)", () => {
  it("hides 'by you' on a list row, shows another person and always a non-person", () => {
    expect(rowActorLine(person(), ME)).toBeNull();
    expect(rowActorLine(sarah, ME)).toBe("by Sarah Chen");
    expect(rowActorLine(nonPerson("EXTENSION"), ME)).toBe("by the extension");
    expect(rowActorLine(nonPerson("MAIL"), ME)).toBe("by Kiwiply from your email");
    expect(rowActorLine(null, ME)).toBeNull();
  });
});

describe("updatedLine", () => {
  it("joins the relative time and the words", () => {
    expect(updatedLine("2 hours ago", person(), ME)).toBe("Updated 2 hours ago by you");
    expect(updatedLine("3 days ago", nonPerson("EXTENSION"), ME)).toBe("Updated 3 days ago by the extension");
    expect(updatedLine("", sarah, ME)).toBe("Updated by Sarah Chen");
  });
});
