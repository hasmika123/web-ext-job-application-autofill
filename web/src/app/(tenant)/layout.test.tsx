// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ value: { kind: "UNKNOWN" } as unknown }));
vi.mock("@/lib/tenant", () => ({ getTenant: async () => state.value }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import TenantTreeLayout, { generateMetadata } from "./%5Ft/layout";
import TenantNotFound from "./not-found";

beforeEach(() => {
  state.value = { kind: "UNKNOWN" };
});

describe("(tenant)/_t layout: three branches", () => {
  it("TENANT renders the children and puts the display name in the title", async () => {
    state.value = { kind: "TENANT", tenant: { kind: "TENANT", displayName: "Acme Staffing" } };
    const html = renderToStaticMarkup(await TenantTreeLayout({ children: <p>inside</p> }));
    expect(html).toContain("inside");
    const meta = await generateMetadata();
    expect(meta.title).toEqual({ absolute: "Acme Staffing" });
  });

  it("UNKNOWN answers notFound() and a bare title", async () => {
    await expect(TenantTreeLayout({ children: <p>inside</p> })).rejects.toThrow("NEXT_NOT_FOUND");
    expect((await generateMetadata()).title).toEqual({ absolute: "Workspace not available" });
  });

  it("PLATFORM asking for the tenant tree is notFound() too", async () => {
    state.value = { kind: "PLATFORM" };
    await expect(TenantTreeLayout({ children: null })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("tenant-unavailable page", () => {
  it("says the workspace isn't available and links nowhere", () => {
    const html = renderToStaticMarkup(<TenantNotFound />);
    expect(html).toContain("This workspace isn&#x27;t available");
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("href=");
  });
});
