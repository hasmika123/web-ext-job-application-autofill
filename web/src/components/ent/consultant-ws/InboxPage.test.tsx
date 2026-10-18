// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/w/consultant/inbox" }));

import { ToastProvider } from "@kiwiply/ui";
import InboxPage from "./InboxPage";

let current: Record<string, unknown>;
let calls: { method: string; url: string; body: unknown }[];
let connectStatus = 200;
let connectBody: unknown = null;

const inbox = (o: Record<string, unknown> = {}) => ({
  entitled: true,
  available: true,
  connected: false,
  address: null,
  status: null,
  connectedAt: null,
  lastCheckedAt: null,
  lastError: null,
  stoppedNote: null,
  messages: 0,
  notifyEmail: true,
  sandbox: false,
  sandboxAddress: null,
  ...o,
});
const page = (i: Record<string, unknown> = {}, o: Record<string, unknown> = {}) => ({ inbox: inbox(i), suggestions: [], updates: [], ...o });

beforeEach(() => {
  calls = [];
  current = page();
  connectStatus = 200;
  connectBody = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? "GET";
      calls.push({ method, url, body: init.body ? JSON.parse(String(init.body)) : undefined });
      const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
      if (method === "POST" && url.endsWith("/inbox")) return json(connectBody ?? inbox({ connected: true, address: "anika@gmail.com", status: "CONNECTED" }), connectStatus);
      if (method !== "GET") return json({ ok: true, applicationId: 9 });
      return json(current);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const flush = () => act(async () => void (await new Promise((res) => setTimeout(res, 20))));
const mount = async () => {
  render(
    <ToastProvider>
      <InboxPage orgId={2} />
    </ToastProvider>,
  );
  await flush();
};

describe("ConsultantInboxPage", () => {
  it("only links to pages that exist on a tenant host (its own /privacy, no /profile, /settings or Kiwiply site)", async () => {
    await mount();
    const hrefs = [...document.querySelectorAll("a")].map((a) => a.getAttribute("href") ?? "");
    expect(hrefs).toContain("/w/consultant/profile");
    // the organization's OWN privacy page on its host (docs/enterprise-v2/62), never the Kiwiply site
    expect(hrefs).toContain("/privacy");
    expect(hrefs.some((h) => /kiwiply\.com/i.test(h))).toBe(false);
    for (const dead of ["/profile", "/settings", "/pricing"]) expect(hrefs).not.toContain(dead);
  });

  it("says plainly that the organization never sees the mailbox", async () => {
    await mount();
    const privacy = document.querySelector("[data-inbox-privacy]")!;
    expect(privacy.textContent).toContain("Only you see your mail");
    expect(privacy.textContent).toContain("never see the password, the address, a subject, a sender or a word of a message");
  });

  it("walks through the guided steps and checks the pair against Gmail through the tenant route", async () => {
    await mount();
    expect(document.querySelector("[data-consultant-inbox]")!.getAttribute("data-status")).toBe("ready");
    for (const t of ["Use a Gmail just for job hunting", "Turn on 2-Step Verification", "Create an app password"]) expect(screen.getByText(t)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Gmail address"), { target: { value: "anika@gmail.com" } });
    fireEvent.change(screen.getByLabelText("App password"), { target: { value: "abcd efgh ijkl mnop" } });
    fireEvent.click(screen.getByRole("button", { name: "Check and connect" }));
    await flush();
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.url).toBe("/api/orgs/2/me-workspace/inbox");
    expect(post.body).toEqual({ address: "anika@gmail.com", appPassword: "abcd efgh ijkl mnop" });
    expect(calls.filter((c) => c.method === "GET").length).toBeGreaterThanOrEqual(2); // reloaded after connecting
  });

  it("shows Gmail's calm refusal in its own words and never echoes the code", async () => {
    await mount();
    connectStatus = 422;
    connectBody = { code: "BAD_CREDENTIALS", error: "Gmail did not accept that address and app password. Check the address, or create a new app password and paste that." };
    fireEvent.change(screen.getByLabelText("Gmail address"), { target: { value: "anika@gmail.com" } });
    fireEvent.change(screen.getByLabelText("App password"), { target: { value: "zzzzzzzzzzzzzzzz" } });
    fireEvent.click(screen.getByRole("button", { name: "Check and connect" }));
    await flush();
    expect(screen.getByRole("alert").textContent).toContain("Gmail did not accept that address and app password");
    expect(document.body.textContent).not.toContain("zzzzzzzzzzzzzzzz");
  });

  it("tells a consultant whose license lacks it, instead of offering a form", async () => {
    current = page({ entitled: false });
    await mount();
    expect(document.querySelector("[data-inbox-locked]")!.textContent).toContain("isn't part of your license");
    expect(screen.queryByLabelText("App password")).toBeNull();
    expect(document.querySelector("[data-consultant-inbox]")!.getAttribute("data-entitled")).toBe("false");
  });

  it("a connection that lost its grant is shown as stopped, with the reason, and can still be disconnected", async () => {
    current = page({ entitled: false, connected: true, address: "anika@gmail.com", status: "NO_ENTITLEMENT", stoppedNote: "Your organization no longer includes inbox tracking." });
    await mount();
    expect(document.querySelector("[data-inbox-stopped]")!.textContent).toContain("Your organization no longer includes inbox tracking.");
    expect(screen.getByText("Stopped")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Disconnect this inbox" })).toBeTruthy();
    expect(document.querySelector("[data-suggestions]")).toBeNull();
  });

  it("shows what the mail found and moved; accepting uses the tenant route", async () => {
    current = page(
      { connected: true, address: "anika@gmail.com", status: "CONNECTED", messages: 6 },
      {
        suggestions: [{ id: 5, company: "Harbor Cloud", role: "Site Reliability Engineer", category: "INTERVIEW", stage: "INTERVIEW", subject: "Interview invitation", fromName: "Harbor Cloud Recruiting", fromAddress: "r@harbor.example", sentAt: "2026-10-13T10:00:00Z" }],
        updates: [{ applicationId: 9, company: "Orbit Freight", role: "Platform Engineer", stage: "INTERVIEW", stageLabel: "Interview", reading: "Interview invite", at: "2026-10-13T10:00:00Z", source: "INBOX" }],
      },
    );
    await mount();
    expect(document.querySelector("[data-update='9'] [data-from-inbox]")!.textContent).toBe("from your inbox");
    expect(document.querySelector("[data-update='9']")!.getAttribute("data-stage")).toBe("INTERVIEW");
    fireEvent.click(screen.getByRole("button", { name: "Add to my board as Interview" }));
    await flush();
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.url).toBe("/api/orgs/2/me-workspace/inbox/suggestions/5/accept");
  });

  const upd = (o: Record<string, unknown> = {}) => ({ applicationId: 9, company: "Orbit Freight", role: "Platform Engineer", stage: "INTERVIEW", stageLabel: "Interview", reading: "Interview invite", at: "2026-10-13T10:00:00Z", source: "INBOX", interview: null, undo: null, ...o });
  const connected = { connected: true, address: "anika@gmail.com", status: "CONNECTED", messages: 6 };
  const iv = (o: Record<string, unknown> = {}) => ({ id: 3, startsAt: "2026-10-27T21:00:00Z", tz: "America/Los_Angeles", kind: "PHONE", link: null, location: null, cancelled: false, ...o });

  it("shows the interview the mail announced in its own time zone, with an https Join link", async () => {
    current = page(connected, { updates: [upd({ interview: iv({ link: "https://meet.example.com/orbit" }) })] });
    await mount();
    const line = document.querySelector("[data-update='9'] [data-update-interview]")!;
    expect(line.textContent).toContain("Interview Tue Oct 27, 2:00 PM PDT · Phone");
    const join = line.querySelector("a")!;
    expect(join.textContent).toBe("Join");
    expect(join.getAttribute("href")).toBe("https://meet.example.com/orbit");
    expect(join.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("never turns a non-https or Kiwiply address into a link", async () => {
    current = page(connected, {
      updates: [upd({ interview: iv({ link: "http://meet.example.com/x" }) }), upd({ applicationId: 10, company: "B", interview: iv({ link: "https://kiwiply.com/x" }) }), upd({ applicationId: 11, company: "C", interview: iv({ link: "javascript:alert(1)" }) })],
    });
    await mount();
    expect(document.querySelectorAll("[data-update-interview] a")).toHaveLength(0);
  });

  it("marks a cancelled interview and offers no Join link for it", async () => {
    current = page(connected, { updates: [upd({ interview: iv({ cancelled: true, link: "https://meet.example.com/orbit" }) })] });
    await mount();
    const line = document.querySelector("[data-update-interview]")!;
    expect(line.textContent).toContain("Cancelled");
    expect(line.querySelector("a")).toBeNull();
    expect(line.querySelector(".line-through")).toBeTruthy();
  });

  it("shows no interview line when the mail announced none", async () => {
    current = page(connected, { updates: [upd()] });
    await mount();
    expect(document.querySelector("[data-update-interview]")).toBeNull();
    expect(document.querySelector("[data-update-undo]")).toBeNull();
  });

  it("offers Undo for a change the inbox made, asks first, then calls the consultant undo route and reloads", async () => {
    current = page(connected, { updates: [upd({ undo: { eventId: "55", undoable: true } })] });
    await mount();
    const box = document.querySelector("[data-update='9'] [data-update-undo]")!;
    fireEvent.click(box.querySelector("[data-action='undo']")!);
    expect(box.textContent).toContain("Put it back the way it was?");
    const before = calls.filter((c) => c.method === "GET").length;
    fireEvent.click(box.querySelector("[data-action='undo-confirm']")!);
    await flush();
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.url).toBe("/api/orgs/2/me-workspace/applications/9/inbox-undo/55");
    expect(calls.filter((c) => c.method === "GET").length).toBeGreaterThan(before);
  });

  it("offers no Undo once the change is past the undo window", async () => {
    current = page(connected, { updates: [upd({ undo: { eventId: "55", undoable: false } })] });
    await mount();
    expect(document.querySelector("[data-update-undo]")).toBeNull();
  });

  it("says 'Too late to undo' when the server answers 409 UNDO_EXPIRED", async () => {
    current = page(connected, { updates: [upd({ undo: { eventId: "55", undoable: true } })] });
    await mount();
    const base = global.fetch as unknown as (u: string, i?: RequestInit) => Promise<Response>;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => (url.includes("/inbox-undo/") ? new Response(JSON.stringify({ code: "UNDO_EXPIRED", error: "x" }), { status: 409, headers: { "content-type": "application/json" } }) : base(url, init))));
    const box = document.querySelector("[data-update-undo]")!;
    fireEvent.click(box.querySelector("[data-action='undo']")!);
    fireEvent.click(box.querySelector("[data-action='undo-confirm']")!);
    await flush();
    expect(box.textContent).toContain("Too late to undo");
  });

  it("on the demo stack it names the sample address to use", async () => {
    current = page({ sandbox: true, sandboxAddress: "kiwiply.demo.anika@gmail.com" });
    await mount();
    expect(document.querySelector("[data-inbox-sandbox]")!.textContent).toContain("kiwiply.demo.anika@gmail.com");
  });

  it("a page that cannot load says so and changes nothing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    await mount();
    expect(document.querySelector("[data-consultant-inbox]")!.getAttribute("data-status")).toBe("failed");
  });

  it("is the generic denied state for anyone who is not a consultant", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    await mount();
    expect(screen.getByText("This page isn't part of your role")).toBeTruthy();
  });
});
