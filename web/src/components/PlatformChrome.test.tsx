// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ surface: null as string | null, throws: false }));
vi.mock("next/headers", () => ({
  headers: async () => {
    if (state.throws) throw new Error("outside a request");
    return { get: (n: string) => (n === "x-kiwiply-surface" ? state.surface : null) };
  },
}));

import PlatformChrome from "./PlatformChrome";

const render = async () => renderToStaticMarkup(await PlatformChrome({ children: <div data-testid="consent">banner</div> }));
beforeEach(() => {
  state.surface = null;
  state.throws = false;
});

describe("PlatformChrome (X2.6): Kiwiply's chrome never mounts on a tenant page", () => {
  it("the platform surface renders the chrome", async () => {
    state.surface = "platform";
    expect(await render()).toContain("banner");
  });
  it("an unstamped request (static generation, a script) is the platform", async () => {
    expect(await render()).toContain("banner");
    state.throws = true;
    expect(await render()).toContain("banner");
  });
  it("the tenant surface renders nothing at all", async () => {
    state.surface = "tenant";
    expect(await render()).toBe("");
  });
  it("any other value is not the tenant surface", async () => {
    state.surface = "tenant ";
    expect(await render()).toContain("banner");
  });
});
