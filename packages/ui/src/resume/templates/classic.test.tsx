import { describe, expect, it } from "vitest";
import { ATS_STRICT } from "../capabilities";
import { describeTemplate, renderTemplate } from "./__test__/suite";

describeTemplate({ id: "classic", capabilities: ATS_STRICT, category: "ats", ats: true });

describe("classic specifics", () => {
  it("name is rendered once, in h1.rz-name (CSS uppercases it, the DOM keeps the case)", () => {
    const out = renderTemplate("classic", "sample");
    expect(out.match(/<h1 class="rz-name">/g)).toHaveLength(1);
    expect(out).toContain('<h1 class="rz-name">Jordan Avery</h1>');
  });

  it("the contact line uses the middle dot and the head is inline", () => {
    const out = renderTemplate("classic", "sample");
    expect(out).toContain('<span class="rz-sep"> · </span>');
    expect(out).not.toContain("rz-item-head-2");
  });

  it("starts in Source Serif 4 at normal spacing", () => {
    const out = renderTemplate("classic", "sample");
    expect(out).toContain('--rz-font-body:"Source Serif 4"');
    expect(out).toContain("--rz-size:11pt");
  });
});
