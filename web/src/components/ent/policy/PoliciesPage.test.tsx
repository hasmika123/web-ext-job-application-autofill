// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import PoliciesPage from "./PoliciesPage";
import PolicyLinks from "./PolicyLinks";

type Detail = Record<string, unknown>;
let calls: { method: string; url: string; body: unknown; ifMatch?: string }[];
let detail: Detail;
let refuse: { status: number; body: unknown } | null;

const row = (kind: string, title: string, path: string, state = "DRAFT") => ({ kind, title, path, state, liveVersion: null, liveSince: null, reviewComment: null, updatedAt: null });
const list = () => ({
  requireReview: true,
  maxChars: 1000,
  policies: [row("PRIVACY", "Privacy Policy", "/privacy", String(detail.state)), row("TERMS", "Terms of Use", "/terms"), row("SUPPORT_CONTACT", "Support and contact", "/support")],
});

beforeEach(() => {
  calls = [];
  refuse = null;
  detail = { kind: "PRIVACY", title: "Privacy Policy", path: "/privacy", state: "DRAFT", draftVersion: 1, draftBody: "# Acme privacy\n\nText.", liveBody: null, liveVersion: null, reviewComment: null, requireReview: true, maxChars: 1000, versions: [] };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? "GET";
      const headers = (init.headers ?? {}) as Record<string, string>;
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, url, body, ifMatch: headers["if-match"] });
      const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
      if (method !== "GET" && refuse) return json(refuse.body, refuse.status);
      if (url === "/api/orgs/7/policies") return json(list());
      if (url.endsWith("/draft")) detail = { ...detail, draftBody: body.body, draftVersion: Number(detail.draftVersion) + 1 };
      if (url.endsWith("/template")) detail = { ...detail, draftBody: "# Privacy Policy\n\nTemplate for Acme Staffing.", draftVersion: Number(detail.draftVersion) + 1 };
      if (url.endsWith("/submit")) detail = { ...detail, state: "IN_REVIEW" };
      if (url.endsWith("/withdraw")) detail = { ...detail, state: "DRAFT" };
      return json(detail);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const flush = () => act(async () => void (await new Promise((res) => setTimeout(res, 30))));
async function mount() {
  render(
    <ToastProvider>
      <PoliciesPage orgId={7} />
    </ToastProvider>,
  );
  await flush();
}
const click = async (name: RegExp) => {
  fireEvent.click(screen.getByRole("button", { name }));
  await flush();
};

describe("the Org Admin's Policies page", () => {
  it("lists the configured kinds and opens the first one with its draft and a live preview", async () => {
    await mount();
    expect(calls.map((c) => c.url)).toEqual(["/api/orgs/7/policies", "/api/orgs/7/policies/PRIVACY"]);
    expect(screen.getByText("Terms of Use")).toBeTruthy();
    expect((screen.getByLabelText(/^Text/) as HTMLTextAreaElement).value).toContain("# Acme privacy");
    expect(document.querySelector("[data-policy-preview] h1")?.textContent).toBe("Acme privacy");
  });

  it("saves an edited draft with the version it last saw, and only then offers to submit", async () => {
    await mount();
    expect((screen.getByRole("button", { name: "Submit for review" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.change(screen.getByLabelText(/^Text/), { target: { value: "# Acme privacy\n\nNew text." } });
    expect((screen.getByRole("button", { name: "Submit for review" }) as HTMLButtonElement).disabled).toBe(true);
    await click(/Save draft/);
    const put = calls.find((c) => c.method === "PUT")!;
    expect(put.url).toBe("/api/orgs/7/policies/PRIVACY/draft");
    expect(put.ifMatch).toBe("1");
    expect(put.body).toEqual({ body: "# Acme privacy\n\nNew text." });
    expect((screen.getByRole("button", { name: "Submit for review" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("starts from the template, submits for review, locks the editor and can withdraw", async () => {
    await mount();
    await click(/Start from template/);
    expect((screen.getByLabelText(/^Text/) as HTMLTextAreaElement).value).toContain("Template for Acme Staffing");
    await click(/Submit for review/);
    expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/submit"))).toBe(true);
    expect(document.querySelector("[data-policy-state]")?.getAttribute("data-policy-state")).toBe("IN_REVIEW");
    expect((screen.getByLabelText(/^Text/) as HTMLTextAreaElement).disabled).toBe(true);
    expect(screen.getByText(/Waiting for review/)).toBeTruthy();
    await click(/Withdraw from review/);
    expect(calls.some((c) => c.url.endsWith("/withdraw"))).toBe(true);
    expect((screen.getByLabelText(/^Text/) as HTMLTextAreaElement).disabled).toBe(false);
  });

  it("shows the reviewer's comment when changes were requested", async () => {
    detail = { ...detail, state: "CHANGES_REQUESTED", reviewComment: "Please name your data protection contact." };
    await mount();
    expect(document.querySelector("[data-policy-comment]")?.textContent).toContain("Please name your data protection contact.");
  });

  it("says why when the API refuses a body", async () => {
    await mount();
    refuse = { status: 422, body: { error: "HTML is not allowed.", code: "POLICY_BODY_INVALID" } };
    fireEvent.change(screen.getByLabelText(/^Text/), { target: { value: "<b>x</b>" } });
    await click(/Save draft/);
    expect(screen.getByRole("alert").textContent).toContain("HTML is not allowed.");
  });

  it("switching review off turns Submit into Publish", async () => {
    detail = { ...detail, requireReview: false };
    await mount();
    expect(screen.getByRole("button", { name: "Publish" })).toBeTruthy();
  });
});

describe("PolicyLinks", () => {
  it("renders only same-host paths", () => {
    render(
      <PolicyLinks
        links={[
          { kind: "PRIVACY", title: "Privacy Policy", path: "/privacy" },
          { kind: "EVIL", title: "Evil", path: "//evil.example/x" },
          { kind: "EVIL2", title: "Evil2", path: "https://evil.example" },
        ]}
      />,
    );
    const hrefs = [...document.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/privacy"]);
  });

  it("defaults to the four standard pages", () => {
    render(<PolicyLinks />);
    expect([...document.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(["/privacy", "/terms", "/acceptable-use", "/support"]);
  });
});
