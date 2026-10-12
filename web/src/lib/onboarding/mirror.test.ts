import { beforeEach, describe, expect, it } from "vitest";
import { INITIAL_STATE, type SetupState } from "@/lib/profile-setup/state";
import { MIRROR_KEY, clearMirror, clearOnboardingMirror, readMirror, writeMirror } from "./mirror";

const state: SetupState = {
  ...INITIAL_STATE,
  step: "skills",
  parsed: { candidates: [], parsedIdentity: {}, skills: ["Go"], suggestions: [], source: "ai", removed: 0 },
  prefs: { desiredSalary: "100k", gender: "Woman" },
  updatedAt: "2026-10-12T10:00:00.000Z",
};

beforeEach(() => localStorage.clear());

describe("local mirror", () => {
  it("round-trips the state with its base and dirty flag, keyed to the login", () => {
    writeMirror(localStorage, { login: "jo", base: "2026-10-12T10:00:05.000Z", dirty: false, state });
    const m = readMirror(localStorage, "jo");
    expect(m).toMatchObject({ login: "jo", base: "2026-10-12T10:00:05.000Z", dirty: false });
    expect(m?.state.step).toBe("skills");
    expect(m?.state.parsed?.skills).toEqual(["Go"]);
  });

  it("never keeps the voluntary self-identification answers", () => {
    writeMirror(localStorage, { login: "jo", base: null, dirty: true, state });
    expect(localStorage.getItem(MIRROR_KEY)).not.toContain("Woman");
    expect(readMirror(localStorage, "jo")?.state.prefs).toEqual({ desiredSalary: "100k" });
  });

  it("is another login's: not handed over, and removed", () => {
    writeMirror(localStorage, { login: "jo", base: null, dirty: true, state });
    expect(readMirror(localStorage, "someone-else")).toBeNull();
    expect(localStorage.getItem(MIRROR_KEY)).toBeNull();
  });

  it("ignores junk, a wrong version and a state that is not one", () => {
    localStorage.setItem(MIRROR_KEY, "{nope");
    expect(readMirror(localStorage, "jo")).toBeNull();
    localStorage.setItem(MIRROR_KEY, JSON.stringify({ v: 1, login: "jo", state }));
    expect(readMirror(localStorage, "jo")).toBeNull();
    localStorage.setItem(MIRROR_KEY, JSON.stringify({ v: 2, login: "jo", state: { v: 2, step: "bogus" } }));
    expect(readMirror(localStorage, "jo")).toBeNull();
    expect(readMirror(undefined, "jo")).toBeNull();
  });

  it("clear removes it; sign-out clears it from the browser", () => {
    writeMirror(localStorage, { login: "jo", base: null, dirty: true, state });
    clearMirror(localStorage);
    expect(localStorage.getItem(MIRROR_KEY)).toBeNull();
    writeMirror(localStorage, { login: "jo", base: null, dirty: true, state });
    clearOnboardingMirror();
    expect(localStorage.getItem(MIRROR_KEY)).toBeNull();
  });

  it("survives storage that throws (private mode, quota)", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => writeMirror(broken, { login: "jo", base: null, dirty: true, state })).not.toThrow();
    expect(readMirror(broken, "jo")).toBeNull();
    expect(() => clearMirror(broken)).not.toThrow();
  });
});
