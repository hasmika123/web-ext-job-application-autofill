// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

import { tenantThemeVars } from "@kiwiply/ui";
import TenantThemeProvider from "@/components/ent/TenantThemeProvider";
import { MOCK_TENANTS } from "../../../../scripts/mock-tenants.mjs";
import BrandedLogin, { chipLabels, safeNext } from "./BrandedLogin";
import TenantLogo from "./TenantLogo";

type MockTenant = { displayName: string; branding: Record<string, string | string[] | null | undefined>; login: { microsoft?: boolean } };
const acme = MOCK_TENANTS["acme.localhost"] as unknown as MockTenant;
const beta = MOCK_TENANTS["beta.localhost"] as unknown as MockTenant;

/** The page as `login/page.tsx` renders it: the theme root around the login, every prop from the published branding. */
function Page({ t }: { t: MockTenant }) {
  const b = t.branding;
  return (
    <TenantThemeProvider primary={b.primary as string} secondary={b.secondary as string}>
      <BrandedLogin
        name={t.displayName}
        logoUrl={b.logoUrl as string | null}
        welcomeTitle={b.welcomeTitle as string | null}
        welcomeMessage={b.welcomeMessage as string | null}
        supportEmail={b.supportEmail as string | null}
        featureChips={b.featureChips as string[] | null}
        microsoft={t.login.microsoft === true}
      />
    </TenantThemeProvider>
  );
}

beforeEach(() => push.mockReset());
afterEach(cleanup);

describe("BrandedLogin: everything comes from the host's published branding", () => {
  it("acme: its logo, 'Welcome to Acme Portal', its support line, Microsoft sign-in and its CSS variables", () => {
    const { container } = render(<Page t={acme} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Welcome toAcme Portal");
    expect(container.querySelector('[data-tenant-logo="image"] img')?.getAttribute("src")).toContain("/tenant-assets/logo");
    expect(screen.getByText("it@acme.com").getAttribute("href")).toBe("mailto:it@acme.com");
    expect(screen.getByText("Sign in with Microsoft")).toBeTruthy();
    expect(screen.getByText("Secure access protected by Acme.")).toBeTruthy();
    expect(container.querySelector("style")?.textContent).toContain("--brand-600:#0f5fc4");
    expect(container.querySelector("style")?.textContent).toContain("--brand-2-600:#0b7a8a");
  });

  it("beta: a wordmark instead of a logo, its own headline, chips and colours, no Microsoft button, no support line", () => {
    const { container } = render(<Page t={beta} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Welcome toBeta Talent Portal");
    expect(container.querySelector('[data-tenant-logo="wordmark"]')?.textContent).toBe("Beta Talent");
    expect(container.querySelector("img[src*='tenant-assets']")).toBeNull();
    expect(screen.queryByText("Sign in with Microsoft")).toBeNull();
    expect(screen.queryByText(/Need help/)).toBeNull();
    for (const chip of ["People First", "Fast Hiring", "Open Roles"]) expect(screen.getByText(chip)).toBeTruthy();
    expect(container.querySelector("style")?.textContent).toContain("--brand-600:#b4531a");
    expect(container.querySelector("style")?.textContent).toContain("--brand-2-600:#2f6f4e");
  });

  it("two hosts render different headlines AND different variable sets", () => {
    const a = render(<Page t={acme} />);
    const aHeading = screen.getByRole("heading", { level: 1 }).textContent;
    const aCss = a.container.querySelector("style")?.textContent;
    cleanup();
    const b = render(<Page t={beta} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).not.toBe(aHeading);
    expect(b.container.querySelector("style")?.textContent).not.toBe(aCss);
    expect(tenantThemeVars("#0f5fc4", "#0b7a8a")["--brand-solid"]).not.toBe(tenantThemeVars("#b4531a", "#2f6f4e")["--brand-solid"]);
  });

  it("a published welcome title is used verbatim; the subtitle defaults sensibly", () => {
    render(<BrandedLogin name="Gamma" welcomeTitle="Hello Gamma people" />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Hello Gamma people");
    expect(screen.getByText("Secure access for employees, consultants, and teams.")).toBeTruthy();
  });

  it("the page itself holds no hex colour: it paints with the theme variables only", () => {
    const { container } = render(<Page t={acme} />);
    const html = (container.querySelector("main")?.outerHTML ?? "").replace(/<svg[\s\S]*?<\/svg>/g, ""); // brand glyphs (Microsoft) keep their official colours
    expect(html).not.toMatch(/#[0-9a-fA-F]{6}/);
    expect(html).toContain("var(--brand-");
  });
});

describe("chips and redirects", () => {
  it("defaults fill any missing chip label", () => {
    expect(chipLabels(null)).toEqual(["Secure Access", "Connect & Collaborate", "Tools for What's Next"]);
    expect(chipLabels(["One"])).toEqual(["One", "Connect & Collaborate", "Tools for What's Next"]);
  });
  it("only a same-host relative path is a valid ?next=", () => {
    expect(safeNext("/w/admin")).toBe("/w/admin");
    for (const bad of ["//evil.com", "https://evil.com", "/\\evil", "", null, undefined]) expect(safeNext(bad as string)).toBeNull();
  });
});

describe("TenantLogo: no tofu, ever", () => {
  it("shows only the logo while it loads, and falls back to a clean wordmark when the image fails", () => {
    const { container } = render(<TenantLogo name="Acme" logoUrl="/tenant-assets/logo?v=1" />);
    expect(container.querySelector('[data-tenant-logo="wordmark"]')).toBeNull();
    const img = container.querySelector("img") as HTMLImageElement;
    expect(img.getAttribute("alt")).toBe("Acme");
    fireEvent.error(img);
    expect(container.querySelector("img")).toBeNull();
    const word = container.querySelector('[data-tenant-logo="wordmark"]');
    expect(word?.textContent).toBe("Acme");
    expect(word?.className).toContain("font-body");
  });
  it("no logo means the wordmark straight away, in text (never an empty glyph)", () => {
    const { container } = render(<TenantLogo name="Beta Talent" logoUrl={null} />);
    expect(container.textContent).toBe("Beta Talent");
    expect(container.textContent).not.toMatch(/[�□]/);
  });
});

describe("the sign-in states", () => {
  const fill = async () => {
    fireEvent.change(screen.getByLabelText("Work Email"), { target: { value: "x@acme.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "pw" } });
    fireEvent.click(screen.getByRole("button", { name: /Sign In/ }));
  };
  const answer = (status: number, body: unknown) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
  afterEach(() => vi.unstubAllGlobals());

  it("401 is an inline error, 403 NOT_A_MEMBER is the calm panel with 'use a different account', 502 is try-again", async () => {
    answer(401, { error: "Incorrect username or password." });
    render(<BrandedLogin name="Acme" />);
    await fill();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Incorrect email or password."));
    cleanup();

    answer(403, { code: "NOT_A_MEMBER" });
    render(<BrandedLogin name="Acme" />);
    await fill();
    await waitFor(() => expect(screen.getByText("You're not a member of Acme")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Use a different account" }));
    await waitFor(() => expect(screen.getByLabelText("Work Email")).toBeTruthy());
    cleanup();

    answer(502, { error: "down" });
    render(<BrandedLogin name="Acme" />);
    await fill();
    await waitFor(() => expect(screen.getByText("We couldn't reach the server")).toBeTruthy());
  });

  it("success goes to the same-host next path, else the tenant home", async () => {
    answer(200, { ok: true });
    render(<BrandedLogin name="Acme" next="/w/admin" />);
    await fill();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/w/admin"));
  });

  it("the password can be shown and hidden", () => {
    render(<BrandedLogin name="Acme" />);
    const pw = screen.getByLabelText("Password") as HTMLInputElement;
    expect(pw.type).toBe("password");
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(pw.type).toBe("text");
  });
});
