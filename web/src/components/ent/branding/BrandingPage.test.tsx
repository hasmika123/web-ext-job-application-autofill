// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { ToastProvider } from "@kiwiply/ui";
import type { BrandingView } from "@/lib/ent/branding";
import BrandingPage from "./BrandingPage";
import { LoginPreviewFrame, PREVIEW_MESSAGE, PREVIEW_READY, parsePreviewMessage, type PreviewPayload } from "./LoginPreview";

const PUBLISHED = { primary: "#0f5fc4", secondary: "#0b7a8a", theme: "LIGHT" as const, welcomeMessage: "Secure access.", supportEmail: "it@acme.com", logoHash: "aaa" };

const baseView = (over: Partial<BrandingView> = {}): BrandingView => ({
  published: { ...PUBLISHED },
  draft: { ...PUBLISHED },
  hasDraft: false,
  draftVersion: 1,
  publishedAt: "2026-10-01T09:00:00Z",
  versions: [
    { versionNo: 1, publishedAt: "2026-09-20T09:00:00Z" },
    { versionNo: 2, publishedAt: "2026-09-27T09:00:00Z" },
    { versionNo: 3, publishedAt: "2026-10-01T09:00:00Z" },
  ],
  ...over,
});

type Call = { method: string; url: string; body: unknown; ifMatch: string | null };
let calls: Call[];
let handler: (c: Call) => { status: number; body: unknown };

/** A stand-in for the BFF: records every call and answers with `handler`. */
function stubFetch() {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const headers = (init.headers ?? {}) as Record<string, string>;
      const raw = init.body;
      const call: Call = { method: init.method ?? "GET", url, body: typeof raw === "string" ? JSON.parse(raw) : raw, ifMatch: headers["if-match"] ?? null };
      calls.push(call);
      const r = handler(call);
      return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body } as Response;
    }),
  );
}

/** Applies a PATCH like the API does: merges into the draft, bumps the version. */
function liveApi(initial: BrandingView = baseView()) {
  let view = structuredClone(initial);
  handler = (c) => {
    if (c.method === "GET") return { status: 200, body: view };
    if (c.method === "PATCH") {
      if (c.ifMatch !== String(view.draftVersion)) return { status: 409, body: { error: "stale", code: "BRANDING_DRAFT_CONFLICT" } };
      const draft = { ...view.draft } as Record<string, unknown>;
      for (const [k, v] of Object.entries(c.body as Record<string, unknown>)) {
        if (v === null) delete draft[k];
        else draft[k] = v;
      }
      view = { ...view, draft, draftVersion: view.draftVersion + 1, hasDraft: true };
      return { status: 200, body: view };
    }
    if (c.url.endsWith("/publish")) {
      view = { ...view, published: structuredClone(view.draft), hasDraft: false, draftVersion: view.draftVersion + 1, versions: [...view.versions, { versionNo: 4, publishedAt: "2026-10-13T09:00:00Z" }] };
      return { status: 200, body: { versionNo: 4, changed: [], branding: view } };
    }
    if (c.url.endsWith("/restore")) {
      view = { ...view, draft: { ...view.draft, primary: "#b4531a" }, draftVersion: view.draftVersion + 1, hasDraft: true };
      return { status: 200, body: view };
    }
    if (c.url.endsWith("/discard")) {
      view = { ...view, draft: structuredClone(view.published), hasDraft: false, draftVersion: view.draftVersion + 1 };
      return { status: 200, body: view };
    }
    return { status: 404, body: { error: "no" } };
  };
  return () => view;
}

async function mount(orgName = "Acme") {
  const out = render(
    <ToastProvider>
      <BrandingPage orgId={2} orgName={orgName} />
    </ToastProvider>,
  );
  await act(async () => {});
  return out;
}

const type = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const settle = async (ms = 900) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
const patches = () => calls.filter((c) => c.method === "PATCH");

beforeEach(() => {
  vi.useFakeTimers();
  stubFetch();
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:preview", revokeObjectURL: () => {} }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Branding page: load states", () => {
  it("shows a skeleton, then every section and the live preview frame", async () => {
    liveApi();
    render(
      <ToastProvider>
        <BrandingPage orgId={2} orgName="Acme" />
      </ToastProvider>,
    );
    expect(document.querySelector("[data-branding-loading]")).not.toBeNull();
    await act(async () => {});
    for (const s of ["identity", "images", "colours", "welcome", "theme"]) expect(document.querySelector(`[data-branding-section="${s}"]`)).not.toBeNull();
    expect(screen.getByTitle("Sign-in page preview")).toBeTruthy();
    expect(document.querySelector("[data-draft-badge]")?.getAttribute("data-draft-badge")).toBe("live");
    expect((screen.getByRole("button", { name: "Publish" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("a member without branding rights gets the not-part-of-your-role state, not the editor", async () => {
    handler = () => ({ status: 403, body: { error: "forbidden" } });
    await mount();
    expect(screen.getByText("Branding isn't part of your role")).toBeTruthy();
    expect(document.querySelector("[data-branding-page]")).toBeNull();
  });

  it("a server error offers Retry, and Retry loads the editor", async () => {
    handler = () => ({ status: 500, body: { error: "boom" } });
    await mount();
    expect(screen.getByRole("alert").textContent).toContain("Couldn't load");
    liveApi();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await act(async () => {});
    expect(document.querySelector("[data-branding-page]")).not.toBeNull();
  });
});

describe("Branding page: autosave of the draft (no Save button)", () => {
  it("dirty -> saving -> saved: one PATCH after 800 ms with If-Match, and the inline check", async () => {
    liveApi();
    await mount();
    expect(screen.queryByRole("button", { name: /^save/i })).toBeNull();
    type(/Welcome title/, "Hello Acme");
    await settle(500);
    expect(patches()).toHaveLength(0); // still inside the debounce
    await settle(400);
    expect(patches()).toHaveLength(1);
    expect(patches()[0]).toMatchObject({ url: "/api/orgs/2/branding/draft", ifMatch: "1", body: { welcomeTitle: "Hello Acme" } });
    expect(document.querySelector('[data-save-status="saved"]')).not.toBeNull();
    expect(document.querySelector('[data-saved-tick="welcomeTitle"]')).not.toBeNull();
    // the next save is sent against the version the server returned
    type(/Welcome title/, "Hello Acme!");
    await settle();
    expect(patches()[1].ifMatch).toBe("2");
  });

  it("rapid typing is one save with the last value", async () => {
    liveApi();
    await mount();
    for (const v of ["H", "He", "Hel", "Hello"]) {
      type(/Welcome title/, v);
      await settle(200);
    }
    await settle();
    expect(patches()).toHaveLength(1);
    expect(patches()[0].body).toEqual({ welcomeTitle: "Hello" });
  });

  it("while a save is in flight the chip says Saving, then Saved", async () => {
    liveApi();
    await mount();
    let release: (r: Response) => void = () => {};
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => new Promise<Response>((r) => (release = r)));
    type(/Welcome title/, "x");
    await settle();
    expect(document.querySelector('[data-save-status="saving"]')).not.toBeNull();
    await act(async () => release({ ok: true, status: 200, json: async () => baseView({ draftVersion: 2 }) } as Response));
    expect(document.querySelector('[data-save-status="saved"]')).not.toBeNull();
  });

  it("a 409 pauses autosave and shows the friendly reload prompt; Reload refetches and clears it", async () => {
    const view = liveApi();
    await mount();
    handler = (c) => (c.method === "PATCH" ? { status: 409, body: { error: "changed", code: "BRANDING_DRAFT_CONFLICT" } } : c.method === "GET" ? { status: 200, body: { ...view(), draftVersion: 5 } } : { status: 404, body: {} });
    type(/Welcome title/, "Mine");
    await settle();
    const banner = document.querySelector("[data-branding-conflict]") as HTMLElement;
    expect(banner.textContent).toContain("changed somewhere else");
    expect(document.querySelector('[data-save-status="conflict"]')).not.toBeNull();
    expect((screen.getByRole("button", { name: "Publish" }) as HTMLButtonElement).disabled).toBe(true);
    const before = calls.length;
    type(/Welcome title/, "Mine again");
    await settle();
    expect(calls.length).toBe(before); // paused: nothing more is sent
    fireEvent.click(within(banner).getByRole("button", { name: "Reload draft" }));
    await settle(10);
    expect(document.querySelector("[data-branding-conflict]")).toBeNull();
    expect(calls.at(-1)?.method).toBe("GET");
    expect((screen.getByLabelText(/Welcome title/) as HTMLInputElement).value).toBe(""); // the server's copy replaced mine
  });

  it("a network or 5xx failure retries and says so; a refusal says why", async () => {
    liveApi();
    await mount();
    handler = (c) => (c.method === "PATCH" ? { status: 503, body: { error: "down" } } : { status: 200, body: baseView() });
    type(/Welcome title/, "x");
    await settle();
    expect(document.querySelector('[data-save-status="retrying"]')).not.toBeNull();
    handler = (c) => (c.method === "PATCH" ? { status: 422, body: { error: "supportEmail: enter a valid email address.", code: "BRANDING_INVALID", field: "supportEmail" } } : { status: 200, body: baseView() });
    await settle(1200); // the retry lands on the refusal
    expect(document.querySelector('[data-save-status="error"]')?.textContent).toContain("Not saved");
  });
});

describe("Branding page: the colour readability gate", () => {
  it("a saved colour on the edge raises no warning until that field is changed", async () => {
    const view = baseView();
    liveApi({ ...view, draft: { ...view.draft, secondary: "#f59e0b" }, published: { ...view.published, secondary: "#f59e0b" } });
    await mount();
    expect(document.querySelector("[data-colour-problem]")).toBeNull();
    expect((screen.getByLabelText("Secondary color") as HTMLInputElement).value).toBe("#f59e0b");
    fireEvent.change(screen.getByLabelText("Secondary color"), { target: { value: "#fbbf24" } });
    await settle();
    expect(document.querySelector("[data-colour-problem]")?.textContent).toContain("too light for white text");
  });

  it("a too-light colour shows the problem and a suggestion, is NOT sent, and the preview keeps the last good colour", async () => {
    liveApi();
    await mount();
    const posted: PreviewPayload[] = [];
    const frame = screen.getByTitle("Sign-in page preview") as HTMLIFrameElement;
    vi.spyOn(frame.contentWindow!, "postMessage").mockImplementation((m: unknown) => void posted.push(m as PreviewPayload));
    fireEvent.change(screen.getByLabelText("Primary color"), { target: { value: "#ffff00" } });
    await settle();
    expect(document.querySelector("[data-colour-problem]")?.textContent).toContain("too light for white text");
    expect(patches()).toHaveLength(0);
    expect(posted.at(-1)?.primary).toBe("#0f5fc4"); // unchanged
    // one click takes the suggestion, which is saved
    fireEvent.click(screen.getByRole("button", { name: /^Use #/ }));
    await settle();
    expect(patches()).toHaveLength(1);
    const sent = (patches()[0].body as { primary: string }).primary;
    expect(sent).toMatch(/^#[0-9a-f]{6}$/);
    expect(sent).not.toBe("#ffff00");
    expect(document.querySelector("[data-colour-problem]")).toBeNull();
  });

  it("a passing colour saves, shows the shade scale, and the preview repaints with it", async () => {
    liveApi();
    await mount();
    const frame = screen.getByTitle("Sign-in page preview") as HTMLIFrameElement;
    const spy = vi.spyOn(frame.contentWindow!, "postMessage").mockImplementation(() => {});
    fireEvent.change(screen.getByLabelText("Primary color"), { target: { value: "#7c3aed" } });
    await settle();
    expect(patches()[0].body).toEqual({ primary: "#7c3aed" });
    expect(document.querySelectorAll('[data-shade-scale="primary"] li')).toHaveLength(10);
    expect((spy.mock.calls.at(-1)?.[0] as PreviewPayload).primary).toBe("#7c3aed");
    expect(document.querySelector('[data-saved-tick="primary"]')).not.toBeNull();
  });
});

describe("Branding page: images", () => {
  const pick = (kind: string, file: File) => fireEvent.change(document.querySelector(`[data-asset-input="${kind}"]`) as HTMLInputElement, { target: { files: [file] } });

  it("an SVG is refused inline with the reason and nothing is uploaded", async () => {
    liveApi();
    await mount();
    pick("logo", new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" }));
    await settle(10);
    expect(document.querySelector('[data-asset-error="logo"]')?.textContent).toContain("SVG");
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("a PNG uploads, previews at once, and the draft now differs", async () => {
    const view = liveApi();
    await mount();
    handler = (c) => {
      if (c.method === "POST" && c.url.endsWith("/assets/favicon")) return { status: 200, body: { ...view(), draft: { ...view().draft, faviconHash: "fff" }, draftVersion: 2, hasDraft: true } };
      return { status: 200, body: view() };
    };
    pick("favicon", new File(["png"], "fav.png", { type: "image/png" }));
    await settle(10);
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.url).toBe("/api/orgs/2/branding/assets/favicon");
    expect(post.body).toBeInstanceOf(FormData);
    expect(document.querySelector('[data-asset-drop="favicon"] img')?.getAttribute("src")).toContain("blob:preview");
    expect(document.querySelector("[data-draft-badge]")?.getAttribute("data-draft-badge")).toBe("differs");
  });

  it("a typed API refusal is shown under the drop zone", async () => {
    liveApi();
    await mount();
    handler = () => ({ status: 413, body: { error: "A logo can be at most 512 KB.", code: "BRANDING_ASSET_TOO_LARGE" } });
    pick("logo", new File(["x"], "big.png", { type: "image/png" }));
    await settle(10);
    expect(document.querySelector('[data-asset-error="logo"]')?.textContent).toContain("512 KB");
  });
});

describe("Branding page: publish, discard, history", () => {
  it("Publish is enabled only when the draft differs; the confirm sheet lists the changed keys; publishing writes the next version", async () => {
    liveApi();
    await mount();
    type(/Welcome title/, "Hello");
    fireEvent.change(screen.getByLabelText("Primary color"), { target: { value: "#7c3aed" } });
    await settle();
    const publish = screen.getByRole("button", { name: "Publish" }) as HTMLButtonElement;
    expect(publish.disabled).toBe(false);
    expect(document.querySelector("[data-draft-badge]")?.getAttribute("data-draft-badge")).toBe("differs");
    fireEvent.click(publish);
    await settle(10);
    const diff = document.querySelector("[data-publish-diff]") as HTMLElement;
    expect([...diff.querySelectorAll("[data-diff-row]")].map((r) => r.getAttribute("data-diff-row"))).toEqual(["primary", "welcomeTitle"]);
    expect(diff.textContent).toContain("#0f5fc4");
    expect(diff.textContent).toContain("#7c3aed");
    fireEvent.click(document.querySelector("[data-publish-confirm]") as HTMLElement);
    await settle(10);
    expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/publish"))).toBe(true);
    expect(document.querySelector("[data-publish-diff]")).toBeNull();
    expect(screen.getByText("Published as version 4")).toBeTruthy();
    expect(document.querySelector("[data-draft-badge]")?.getAttribute("data-draft-badge")).toBe("live");
    expect((screen.getByRole("button", { name: "Publish" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("a refused publish keeps the sheet open and says why", async () => {
    liveApi();
    await mount();
    type(/Welcome title/, "Hello");
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await settle(10);
    handler = () => ({ status: 422, body: { error: "primary: #fefefe is too light for white text. Try #7a7a7a.", code: "BRANDING_COLOR_LOW_CONTRAST" } });
    fireEvent.click(document.querySelector("[data-publish-confirm]") as HTMLElement);
    await settle(10);
    expect(document.querySelector("[data-publish-error]")?.textContent).toContain("too light");
    expect(document.querySelector("[data-publish-diff]")).not.toBeNull();
  });

  it("Discard draft asks first, resets to what is live, and offers Undo for text and colours", async () => {
    liveApi();
    await mount();
    type(/Welcome title/, "Hello");
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Discard draft" }));
    await settle(10);
    fireEvent.click(document.querySelector("[data-discard-confirm]") as HTMLElement);
    await settle(10);
    expect(calls.some((c) => c.url.endsWith("/discard"))).toBe(true);
    expect((screen.getByLabelText(/Welcome title/) as HTMLInputElement).value).toBe("");
    expect(screen.getByText("Draft discarded")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await settle();
    expect((screen.getByLabelText(/Welcome title/) as HTMLInputElement).value).toBe("Hello");
    expect(patches().at(-1)?.body).toEqual({ welcomeTitle: "Hello" });
  });

  it("History lists versions newest first; Restore fills the draft (badge: draft differs) and offers Undo", async () => {
    liveApi();
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "Version history" }));
    await settle(10);
    const items = screen.getAllByRole("menuitem").map((i) => i.textContent ?? "");
    expect(items[0]).toContain("Version 3");
    expect(items[2]).toContain("Version 1");
    fireEvent.click(screen.getAllByRole("menuitem")[1]);
    await settle(10);
    expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/versions/2/restore"))).toBe(true);
    expect(screen.getByText("Version 2 restored into your draft")).toBeTruthy();
    expect(document.querySelector("[data-draft-badge]")?.getAttribute("data-draft-badge")).toBe("differs");
    expect((screen.getByLabelText("Primary color") as HTMLInputElement).value).toBe("#b4531a");
  });
});

describe("Live preview (logic, no browser)", () => {
  const payload = (over: Partial<PreviewPayload["props"]> = {}, primary = "#7c3aed"): PreviewPayload => ({
    type: PREVIEW_MESSAGE,
    primary,
    secondary: "#0b7a8a",
    props: { name: "Acme", logoUrl: null, welcomeTitle: null, welcomeMessage: null, supportEmail: null, featureChips: [], microsoft: false, ...over },
  });
  const send = (data: unknown, origin = window.location.origin) =>
    act(async () => {
      window.dispatchEvent(new MessageEvent("message", { data, origin }));
    });

  it("the frame draws the real BrandedLogin from the draft it is sent, and repaints on the next message", async () => {
    render(<LoginPreviewFrame initial={payload({}, "#0f5fc4")} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Welcome Back");
    expect(document.querySelector("style")?.textContent).toContain("--brand-600:#0f5fc4");
    await send(payload({ welcomeTitle: "Hello team" }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Hello team");
    expect(document.querySelector("style")?.textContent).toContain("--brand-600:#7c3aed");
  });

  it("a message from another origin, or one that is not ours, is ignored", async () => {
    render(<LoginPreviewFrame initial={payload({ welcomeTitle: "Mine" })} />);
    await send(payload({ welcomeTitle: "Evil" }), "https://evil.example");
    await send({ type: "other", props: {} });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Mine");
    expect(parsePreviewMessage({ origin: "https://x", data: payload() }, "https://y")).toBeNull();
  });

  it("the preview is inert: its sign-in form cannot be used", () => {
    render(<LoginPreviewFrame initial={payload()} />);
    expect(document.querySelector("[inert]")).not.toBeNull();
  });

  it("the frame announces itself to the editor when it mounts inside a parent", () => {
    const parent = { postMessage: vi.fn() };
    const spy = vi.spyOn(window, "parent", "get").mockReturnValue(parent as unknown as Window);
    render(<LoginPreviewFrame initial={payload()} />);
    expect(parent.postMessage).toHaveBeenCalledWith({ type: PREVIEW_READY }, window.location.origin);
    spy.mockRestore();
  });
});
