import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import EmptyState from "./EmptyState";
import ErrorState from "./ErrorState";
import MascotPose, { DEFAULT_MASCOT_BASE, MASCOT_HEIGHT, MASCOT_POSES, MascotProvider, POSE_KEYS, celebrate, poseSize, poseUrl } from "./MascotPose";
import type { EnterprisePose, MascotSize } from "./MascotPose";

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "matchMedia");
});

const BEE_DIR = resolve(__dirname, "../../../../web/public/ent/bee");
const MANIFEST: { name: string; file: string; w: number; h: number }[] = JSON.parse(readFileSync(resolve(BEE_DIR, "manifest.json"), "utf8"));
const SIZES: MascotSize[] = ["sm", "md", "lg"];

function reduceMotion(on: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (q: string) => ({ matches: on && q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }),
  });
}

describe("the pose map", () => {
  it("covers the eight poses doc 11 section 6 names, plus the extras", () => {
    for (const k of ["welcome", "greet", "empty", "encourage", "celebrate", "warn", "error", "peek"]) expect(POSE_KEYS).toContain(k);
    for (const k of ["thinking", "secure", "success", "sad", "goodbye"]) expect(POSE_KEYS).toContain(k);
  });

  it.each(POSE_KEYS)("%s resolves to a file listed in manifest.json that exists, with its true native size", (pose) => {
    const def = MASCOT_POSES[pose];
    const entry = MANIFEST.find((m) => m.file === def.file);
    expect(entry, `${def.file} is not in web/public/ent/bee/manifest.json`).toBeDefined();
    expect(existsSync(resolve(BEE_DIR, def.file))).toBe(true);
    expect({ w: def.w, h: def.h }).toEqual({ w: entry!.w, h: entry!.h });
    expect(def.motion).toMatch(/^ob-m-[a-z]+$/);
  });

  it("never points at the regular Kiwiply mascot art", () => {
    for (const k of POSE_KEYS) {
      expect(MASCOT_POSES[k].file).not.toMatch(/^mascot-|\/mascot-|^app\//);
    }
    expect(DEFAULT_MASCOT_BASE).toBe("/ent/bee");
  });
});

describe("MascotPose", () => {
  const cases = POSE_KEYS.flatMap((pose) => SIZES.map((size) => [pose, size] as [EnterprisePose, MascotSize]));

  it.each(cases)("%s at %s renders the mapped file at the requested height with the aspect preserved", (pose, size) => {
    const { container } = render(<MascotPose pose={pose} size={size} />);
    const img = container.querySelector("img")!;
    const def = MASCOT_POSES[pose];
    expect(img.getAttribute("src")).toBe(`/ent/bee/${def.file}`);
    expect(Number(img.getAttribute("height"))).toBe(MASCOT_HEIGHT[size]);
    expect(Number(img.getAttribute("width"))).toBe(Math.round((def.w / def.h) * MASCOT_HEIGHT[size]));
    expect(poseSize(pose, size)).toEqual({ width: Number(img.getAttribute("width")), height: Number(img.getAttribute("height")) });
    expect(img.style.aspectRatio.replace(/\s/g, "")).toBe(`${def.w}/${def.h}`);
  });

  it("is decorative and lazy, except the login's welcome", () => {
    const { container } = render(
      <>
        <MascotPose pose="welcome" />
        <MascotPose pose="empty" />
      </>,
    );
    const [a, b] = [...container.querySelectorAll("img")];
    for (const img of [a, b]) {
      expect(img.getAttribute("alt")).toBe("");
      expect(img.getAttribute("aria-hidden")).toBe("true");
    }
    expect(a.getAttribute("loading")).toBe("eager");
    expect(b.getAttribute("loading")).toBe("lazy");
  });

  it("sizes are 48 / 80 / 120 tall, and the phone caps lg at md", () => {
    expect(MASCOT_HEIGHT).toEqual({ sm: 48, md: 80, lg: 120 });
    const { container } = render(<MascotPose pose="empty" size="lg" />);
    expect(container.querySelector("img")!.className).toContain("max-sm:h-20");
  });

  it("carries the mapped motion class, and none under prefers-reduced-motion", () => {
    reduceMotion(false);
    const a = render(<MascotPose pose="celebrate" />);
    expect(a.container.querySelector("img")!.className).toContain(MASCOT_POSES.celebrate.motion);
    a.unmount();
    reduceMotion(true);
    const b = render(<MascotPose pose="celebrate" />);
    expect(b.container.querySelector("img")!.className).not.toContain("ob-m-");
  });

  it("the host decides where the files live: provider or prop, trailing slash tolerated", () => {
    expect(poseUrl("empty", "https://cdn.test/bee/")).toBe(`https://cdn.test/bee/${MASCOT_POSES.empty.file}`);
    const { container } = render(
      <MascotProvider base="/elsewhere">
        <MascotPose pose="empty" />
        <MascotPose pose="empty" base="/override" />
      </MascotProvider>,
    );
    const [a, b] = [...container.querySelectorAll("img")];
    expect(a.getAttribute("src")).toBe(`/elsewhere/${MASCOT_POSES.empty.file}`);
    expect(b.getAttribute("src")).toBe(`/override/${MASCOT_POSES.empty.file}`);
  });
});

describe("EmptyState and ErrorState use the pose", () => {
  it('EmptyState mascotPose="empty" renders the mapped art above the title', () => {
    const { container } = render(<EmptyState mascotPose="empty" title="No consultants yet" />);
    const img = container.querySelector("img[data-mascot-pose='empty']")!;
    expect(img.getAttribute("src")).toBe(`/ent/bee/${MASCOT_POSES.empty.file}`);
    expect(img.compareDocumentPosition(container.querySelector("h3")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelector("svg")).toBeNull();
  });

  it("the doodle path still works for `mascot`, and the inline variant ignores both", () => {
    const a = render(<EmptyState mascot title="Nothing" />);
    expect(a.container.querySelector("svg")).not.toBeNull();
    expect(a.container.querySelector("img")).toBeNull();
    a.unmount();
    const b = render(<EmptyState variant="inline" mascotPose="empty" title="Nothing" />);
    expect(b.container.querySelector("img")).toBeNull();
  });

  it("ErrorState mascotPose swaps the alert glyph for the bee on the page variant only", () => {
    const a = render(<ErrorState what="the list" mascotPose="error" />);
    expect(a.container.querySelector("img[data-mascot-pose='error']")).not.toBeNull();
    expect(a.container.querySelector("svg")).toBeNull();
    a.unmount();
    const b = render(<ErrorState what="the list" mascotPose="error" variant="inline" />);
    expect(b.container.querySelector("img")).toBeNull();
    expect(b.container.querySelector("svg")).not.toBeNull();
  });

  it("replacing a file name in the map changes every usage (a one-line change)", () => {
    const original = MASCOT_POSES.empty.file;
    try {
      MASCOT_POSES.empty.file = "surprised.png";
      const { container } = render(
        <>
          <MascotPose pose="empty" />
          <EmptyState mascotPose="empty" title="x" />
        </>,
      );
      expect([...container.querySelectorAll("img")].map((i) => i.getAttribute("src"))).toEqual(["/ent/bee/surprised.png", "/ent/bee/surprised.png"]);
    } finally {
      MASCOT_POSES.empty.file = original;
    }
  });
});

describe("celebrate(eventId)", () => {
  it("is true once per event and false after, however often it is asked", () => {
    window.sessionStorage.clear();
    expect(celebrate("placement-1")).toBe(true);
    expect(celebrate("placement-1")).toBe(false);
    expect(celebrate("placement-2")).toBe(true);
  });
});
