import { describe, expect, it } from "vitest";
import {
  UI_STORAGE_KEY,
  computeLayout,
  initialUiState,
  loadPersistedUi,
  savePersistedUi,
  uiReducer,
  viewportFor,
} from "./ui";
import type { UiAction, UiState } from "./ui";

function run(state: UiState, ...actions: UiAction[]): UiState {
  return actions.reduce(uiReducer, state);
}
const at = (width: number, s: UiState = initialUiState()) => run(s, { type: "layout/set", width });

function memoryStorage(initial?: string) {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(UI_STORAGE_KEY, initial);
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe("ui state: left panel", () => {
  it("toggle opens, switches and closes (exactly one panel)", () => {
    let s = initialUiState();
    expect(s.leftPanel).toBeNull();
    s = run(s, { type: "panel/toggle", panel: "add" });
    expect(s.leftPanel).toBe("add");
    s = run(s, { type: "panel/toggle", panel: "swap" });
    expect(s.leftPanel).toBe("swap");
    s = run(s, { type: "panel/toggle", panel: "swap" });
    expect(s.leftPanel).toBeNull();
    s = run(s, { type: "panel/toggle", panel: "tailor" }, { type: "panel/close" });
    expect(s.leftPanel).toBeNull();
    expect(run(s, { type: "panel/close" })).toBe(s); // nothing to close: same object
  });
});

describe("ui state: right view and the small fields", () => {
  it("right view toggle opens, switches and closes", () => {
    let s = initialUiState();
    s = run(s, { type: "rightView/toggle", view: "print" });
    expect(s.rightView).toBe("print");
    s = run(s, { type: "rightView/toggle", view: "pdf" });
    expect(s.rightView).toBe("pdf");
    s = run(s, { type: "rightView/toggle", view: "pdf" });
    expect(s.rightView).toBeNull();
    s = run(s, { type: "rightView/toggle", view: "print" }, { type: "rightView/close" });
    expect(s.rightView).toBeNull();
  });

  it("rail tab, active section and phone tab are plain setters", () => {
    let s = initialUiState();
    expect(s.railTab).toBe("insights");
    expect(s.phoneTab).toBe("edit");
    s = run(
      s,
      { type: "rail/tab", tab: "match" },
      { type: "section/active", id: "s_exp" },
      { type: "phone/tab", tab: "preview" },
    );
    expect([s.railTab, s.activeSectionId, s.phoneTab]).toEqual(["match", "s_exp", "preview"]);
    expect(run(s, { type: "rail/tab", tab: "match" })).toBe(s);
  });
});

describe("ui state: layout per breakpoint (DESIGN 10.1)", () => {
  it("viewport names", () => {
    expect([500, 767, 768, 1023, 1024, 1279, 1280, 2000].map(viewportFor)).toEqual([
      "phone",
      "phone",
      "tablet",
      "tablet",
      "desktop",
      "desktop",
      "wide",
      "wide",
    ]);
  });

  it("phone is fullscreen, tablet overlays", () => {
    expect(computeLayout(390, true)).toMatchObject({ leftMode: "fullscreen", rightMode: "fullscreen", viewport: "phone" });
    expect(computeLayout(900, true)).toMatchObject({ leftMode: "overlay", rightMode: "overlay", viewport: "tablet" });
  });

  it("pushes only while the centre keeps 560 px (rail 360 + left 400 -> needs 1320)", () => {
    expect(computeLayout(1319, true).leftMode).toBe("overlay");
    expect(computeLayout(1320, true).leftMode).toBe("push");
    // desktop: the right sheet always overlays the rail
    expect(computeLayout(1100, false).rightMode).toBe("overlay");
  });

  it("wide: both push only when 360 + 400 + 520 + 560 fit (1840), else the right overlays", () => {
    expect(computeLayout(1840, true)).toMatchObject({ leftMode: "push", rightMode: "push" });
    expect(computeLayout(1839, true)).toMatchObject({ leftMode: "push", rightMode: "overlay" });
    // with the left closed the right needs only 360 + 520 + 560
    expect(computeLayout(1440, false).rightMode).toBe("push");
  });

  it("layout/set recomputes modes and ignores junk", () => {
    let s = at(1100);
    expect(s.layout).toMatchObject({ viewport: "desktop", leftMode: "overlay", width: 1100 });
    expect(run(s, { type: "layout/set", width: 1100 })).toBe(s);
    expect(run(s, { type: "layout/set", width: Number.NaN })).toBe(s);
    s = at(390, s);
    expect(s.layout.viewport).toBe("phone");
  });
});

describe("ui state: newest wins when space runs out", () => {
  it("at 1100 px both sheets would overlay, so opening the right view closes the left panel", () => {
    let s = at(1100);
    s = run(s, { type: "panel/toggle", panel: "add" });
    expect(s.leftPanel).toBe("add");
    s = run(s, { type: "rightView/toggle", view: "print" });
    expect(s.rightView).toBe("print");
    expect(s.leftPanel).toBeNull();
    // and the other way round
    s = run(s, { type: "panel/toggle", panel: "swap" });
    expect(s.leftPanel).toBe("swap");
    expect(s.rightView).toBeNull();
  });

  it("below 1024 opening either closes the other", () => {
    for (const w of [390, 900]) {
      let s = at(w);
      s = run(s, { type: "rightView/toggle", view: "pdf" }, { type: "panel/toggle", panel: "tailor" });
      expect([s.leftPanel, s.rightView]).toEqual(["tailor", null]);
      s = run(s, { type: "rightView/toggle", view: "pdf" });
      expect([s.leftPanel, s.rightView]).toEqual([null, "pdf"]);
    }
  });

  it("a pushed left panel and an overlay right view coexist at 1400 px", () => {
    let s = at(1400);
    s = run(s, { type: "panel/toggle", panel: "add" }, { type: "rightView/toggle", view: "print" });
    expect(s.leftPanel).toBe("add");
    expect(s.rightView).toBe("print");
    expect(s.layout).toMatchObject({ leftMode: "push", rightMode: "overlay" });
  });

  it("both push at 1900 px", () => {
    let s = at(1900);
    s = run(s, { type: "panel/toggle", panel: "add" }, { type: "rightView/toggle", view: "print" });
    expect(s.layout).toMatchObject({ leftMode: "push", rightMode: "push" });
    expect([s.leftPanel, s.rightView]).toEqual(["add", "print"]);
  });

  it("shrinking the window until both would be modal closes the older sheet", () => {
    let s = at(1400);
    s = run(s, { type: "panel/toggle", panel: "add" }, { type: "rightView/toggle", view: "print" });
    s = at(1000, s);
    expect([s.leftPanel, s.rightView]).toEqual([null, "print"]);
  });
});

describe("ui state: persistence", () => {
  it("round-trips leftPanel and railTab", () => {
    const storage = memoryStorage();
    savePersistedUi({ leftPanel: "swap", railTab: "ai" }, storage);
    expect(JSON.parse(storage.getItem(UI_STORAGE_KEY) as string)).toEqual({ leftPanel: "swap", railTab: "ai" });
    expect(loadPersistedUi(storage)).toEqual({ leftPanel: "swap", railTab: "ai" });

    savePersistedUi({ leftPanel: null, railTab: "match" }, storage);
    expect(loadPersistedUi(storage)).toEqual({ leftPanel: null, railTab: "match" });
  });

  it("hydrate applies the remembered values", () => {
    const s = run(initialUiState(), { type: "ui/hydrate", persisted: { leftPanel: "template", railTab: "ai" } });
    expect([s.leftPanel, s.railTab]).toEqual(["template", "ai"]);
    expect(s.newest).toBe("left");
  });

  it("corrupt localStorage is ignored", () => {
    expect(loadPersistedUi(memoryStorage("{not json"))).toEqual({});
    expect(loadPersistedUi(memoryStorage("[1,2]"))).toEqual({});
    expect(loadPersistedUi(memoryStorage('"x"'))).toEqual({});
    expect(loadPersistedUi(memoryStorage('{"leftPanel":"bogus","railTab":7}'))).toEqual({});
    expect(loadPersistedUi(memoryStorage('{"leftPanel":"add","railTab":"nope"}'))).toEqual({ leftPanel: "add" });
    expect(loadPersistedUi(null)).toEqual({});
  });

  it("a throwing store never breaks anything", () => {
    const boom = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(loadPersistedUi(boom)).toEqual({});
    expect(() => savePersistedUi({ leftPanel: "add", railTab: "ai" }, boom)).not.toThrow();
  });
});
