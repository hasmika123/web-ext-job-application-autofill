import { afterEach, describe, expect, it } from "vitest";
import { goToField } from "./goToField";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("goToField", () => {
  it("focuses the control that carries the data-field id", () => {
    document.body.innerHTML = `<div data-canvas><input data-field="basics.email"/><textarea data-field="b_one"></textarea></div>`;
    expect(goToField("b_one")).toBe(true);
    expect(document.activeElement?.getAttribute("data-field")).toBe("b_one");
  });

  it("a block (section / item row) focuses its first control", () => {
    document.body.innerHTML = `<section data-field="s_exp"><h2>Experience</h2><input data-field="i_1.title"/></section>`;
    expect(goToField("s_exp")).toBe(true);
    expect(document.activeElement?.getAttribute("data-field")).toBe("i_1.title");
  });

  it("an item id resolves to its first field when the row itself is not tagged", () => {
    document.body.innerHTML = `<input data-field="i_9.title"/><input data-field="i_9.org"/>`;
    expect(goToField("i_9")).toBe(true);
    expect(document.activeElement?.getAttribute("data-field")).toBe("i_9.title");
  });

  it("a non-focusable block with no controls still takes focus, and a missing ref returns false", () => {
    document.body.innerHTML = `<div data-field="s_x">nothing editable</div>`;
    expect(goToField("s_x")).toBe(true);
    expect(document.activeElement?.getAttribute("data-field")).toBe("s_x");
    expect(goToField("nope")).toBe(false);
  });
});
