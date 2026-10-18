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

type MockTenant = { displayName: string; branding: Record<string, string | string[] | null | undefined>; login: { microsoft?: boolean; google?: boolean } };
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
        google={t.login.google === true}
      />
    </TenantThemeProvider>
  );
}

beforeEach(() => push.mockReset());
afterEach(cleanup);

describe("BrandedLogin: everything comes from the host's published branding", () => {
  it("acme: its logo in the slot beside Sign In, the default heading, Microsoft only, its CSS variables", () => {
    const { container } = render(<Page t={acme} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Welcome Back");
    expect(screen.getByText("Sign in to access your workspace, tasks, and updates.")).toBeTruthy();
    const slot = container.querySelector("[data-logo-slot]");
    expect(slot?.getAttribute("data-logo-slot")).toBe("logo");
    expect(slot?.querySelector('[data-tenant-logo="image"] img')?.getAttribute("src")).toContain("/tenant-assets/logo");
    expect(container.querySelectorAll("[data-tenant-logo]").length).toBe(1); // the logo appears nowhere else on the page
    expect(screen.getByText("Contact IT Support").getAttribute("href")).toBe("mailto:it@acme.com");
    expect(screen.getByText("Continue with Microsoft")).toBeTruthy();
    expect(screen.queryByText("Continue with Google")).toBeNull();
    expect(screen.getByText("Secure access protected by industry standards.")).toBeTruthy();
    expect(container.querySelector("style")?.textContent).toContain("--brand-600:#0f5fc4");
    expect(container.querySelector("style")?.textContent).toContain("--brand-2-600:#0b7a8a");
  });

  it("S9 (O4): the sign-in says the account belongs to the organization and is separate from a personal Kiwiply account", () => {
    render(<Page t={acme} />);
    expect(screen.getByText(`Sign in to your ${acme.displayName} account.`)).toBeTruthy();
    const note = document.querySelector("[data-account-note]")!.textContent!;
    expect(note).toContain(`Your ${acme.displayName} account belongs to ${acme.displayName}`);
    expect(note).toContain("separate from any personal Kiwiply account");
  });

  it("beta: a wordmark in the slot, its own heading and subtitle, Google only, plain-text help line", () => {
    const { container } = render(<Page t={beta} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Hello, Beta Talent");
    expect(screen.getByText("Find your next role with us.")).toBeTruthy();
    expect(container.querySelector('[data-logo-slot="logo"] [data-tenant-logo="wordmark"]')?.textContent).toBe("Beta Talent");
    expect(container.querySelector("img[src*='tenant-assets']")).toBeNull();
    expect(screen.getByText("Continue with Google")).toBeTruthy();
    expect(screen.queryByText("Continue with Microsoft")).toBeNull();
    expect(screen.getByText("Contact IT Support").tagName).toBe("SPAN");
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

  it("a published welcome title / message is used verbatim; both default to the board's text", () => {
    render(<BrandedLogin name="Gamma" welcomeTitle="Hello Gamma people" welcomeMessage="Your portal." />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Hello Gamma people");
    expect(screen.getByText("Your portal.")).toBeTruthy();
    cleanup();
    render(<BrandedLogin name="Gamma" />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Welcome Back");
  });

  it("Google / Microsoft buttons exist only when the org's options enable them; no OR divider when neither", () => {
    const { container } = render(<BrandedLogin name="Gamma" />);
    expect(container.querySelector("[data-sso]")).toBeNull();
    expect(screen.queryByRole("separator")).toBeNull();
    cleanup();
    render(<BrandedLogin name="Gamma" google microsoft />);
    expect(screen.getByText("Continue with Google").getAttribute("href")).toBe("/sso/google");
    expect(screen.getByText("Continue with Microsoft").getAttribute("href")).toBe("/sso/microsoft");
    expect(screen.getByRole("separator")).toBeTruthy();
  });

  it("logo slot: the dashed placeholder shows ONLY in the branding preview with no logo; the public login shows the wordmark", () => {
    const pub = render(<BrandedLogin name="Gamma" />);
    expect(pub.container.querySelector('[data-logo-slot="placeholder"]')).toBeNull();
    expect(pub.container.querySelector('[data-tenant-logo="wordmark"]')?.textContent).toBe("Gamma");
    cleanup();
    const prev = render(<BrandedLogin name="Gamma" preview />);
    expect(prev.container.querySelector('[data-logo-slot="placeholder"]')).toBeTruthy();
    expect(prev.container.querySelector("[data-tenant-logo]")).toBeNull();
    cleanup();
    const withLogo = render(<BrandedLogin name="Gamma" preview logoUrl="/tenant-assets/logo?v=1" />);
    expect(withLogo.container.querySelector('[data-logo-slot="logo"] img')).toBeTruthy();
  });

  it("the page itself holds no hex colour: it paints with the theme variables only", () => {
    const { container } = render(<Page t={acme} />);
    const html = (container.querySelector("main")?.outerHTML ?? "").replace(/<svg[\s\S]*?<\/svg>/g, ""); // brand glyphs (Google, Microsoft) keep their official colours
    expect(html.replace(/<picture[\s\S]*?<\/picture>/g, "")).not.toMatch(/#[0-9a-fA-F]{6}/);
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
    fireEvent.change(screen.getByLabelText("User Name"), { target: { value: "x@acme.com" } });
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
    await waitFor(() => expect(screen.getByLabelText("User Name")).toBeTruthy());
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
