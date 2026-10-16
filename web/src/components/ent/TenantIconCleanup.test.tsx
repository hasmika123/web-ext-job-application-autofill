// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import TenantIconCleanup, { isPlatformIconHref } from "./TenantIconCleanup";

afterEach(() => {
  cleanup();
  document.head.innerHTML = "";
});

const link = (rel: string, href: string) => {
  const l = document.createElement("link");
  l.rel = rel;
  l.href = href;
  document.head.appendChild(l);
};

describe("TenantIconCleanup (D15: no platform icon on a tenant host)", () => {
  it("recognises the platform's convention icons and not the organization's", () => {
    expect(isPlatformIconHref("/favicon.ico?favicon.1q2j40zxdajbx.ico")).toBe(true);
    expect(isPlatformIconHref("/icon.png")).toBe(true);
    expect(isPlatformIconHref("/apple-icon.png?x=1")).toBe(true);
    expect(isPlatformIconHref("/tenant-assets/logo?v=1")).toBe(false);
    expect(isPlatformIconHref("data:image/svg+xml,%3Csvg%3E")).toBe(false);
  });

  it("removes the platform link and keeps the organization's", () => {
    link("icon", "/favicon.ico?favicon.abc.ico");
    link("icon", "/tenant-assets/logo?v=1");
    render(<TenantIconCleanup />);
    const left = Array.from(document.head.querySelectorAll('link[rel~="icon"]')).map((l) => l.getAttribute("href"));
    expect(left).toEqual(["/tenant-assets/logo?v=1"]);
  });

  it("never leaves the page with no icon at all", () => {
    link("icon", "/favicon.ico?favicon.abc.ico");
    render(<TenantIconCleanup />);
    expect(document.head.querySelectorAll('link[rel~="icon"]')).toHaveLength(1);
  });
});
