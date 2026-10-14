// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import TenantThemeProvider from "./TenantThemeProvider";

const render = (primary?: string | null, secondary?: string | null) =>
  renderToStaticMarkup(
    <TenantThemeProvider primary={primary} secondary={secondary}>
      <p>page</p>
    </TenantThemeProvider>,
  );

describe("TenantThemeProvider (X2.12)", () => {
  it("tenant A and tenant B render different variable sets", () => {
    const a = render("#0f5fc4", "#0b7a8a");
    const b = render("#b4531a", "#2f6f4e");
    expect(a).toContain("--brand-600:#0f5fc4");
    expect(a).toContain("--brand-2-600:#0b7a8a");
    expect(b).toContain("--brand-600:#b4531a");
    expect(b).toContain("--brand-2-600:#2f6f4e");
    expect(a).not.toContain("#b4531a");
    expect(b).not.toContain("#0f5fc4");
  });

  it("carries the .theme-tenant root, the full scales, the dark set, and the page", () => {
    const html = render("#1d4ed8", "#15803d");
    expect(html).toContain('class="theme-tenant"');
    expect(html).toContain("data-tenant-root");
    for (const v of ["--brand-50:", "--brand-900:", "--brand-2-50:", "--on-brand:", "--brand-solid-hover:", "--brand-ring:", "--brand-text:"]) expect(html).toContain(v);
    expect(html).toContain("[data-tenant-root].dark{");
    expect(html).toContain("<p>page</p>");
  });

  it("a tenant with no colours (or an invalid one) gets the board's blue and teal, and no injected declaration", () => {
    const none = render(null, undefined);
    expect(none).toContain("--brand-600:#0f5fc4");
    expect(none).toContain("--brand-2-600:#0b7a8a");
    const evil = render("red;}body{display:none", "url(javascript:alert(1))");
    expect(evil).toContain("--brand-600:#0f5fc4");
    expect(evil).not.toContain("display:none");
    expect(evil).not.toContain("javascript");
  });
});

describe("the regular Kiwiply pages are not affected", () => {
  it("the tenant tokens are only declared under .theme-tenant (no :root, no global token touched)", () => {
    const css = readFileSync(new URL("../../../../packages/ui/styles/theme-tenant.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const selectors = [...css.matchAll(/([^{}]+)\{/g)].map((m) => m[1].trim());
    expect(selectors.length).toBeGreaterThan(0);
    for (const s of selectors) expect(s.startsWith(".theme-tenant") || s.startsWith("@media"), s).toBe(true); // a media wrapper only scopes the .theme-tenant rules inside it
    expect(css).not.toMatch(/:root|@theme|^\s*html|^\s*body/m);
  });
});
