// @vitest-environment jsdom
import { createRef } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import { DEFAULT_BUILDER_CONFIG, PERSONAL_CAPABILITIES } from "@/lib/resume-builder-config.shared";
import { testMeta } from "./test-meta";

vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/marketing/BrandLogo", () => ({ default: () => <span>Kiwiply logo</span> }));
vi.mock("@/lib/use-date-display", () => ({ useDateDisplay: () => ({ locale: "en-US", timeZone: "UTC" }) }));
vi.mock("@/lib/resume-meta", async (orig) => ({ ...(await orig<typeof import("@/lib/resume-meta")>()), getAccess: async () => ({ kind: "ok", value: { org: null, grants: [], links: [], viewers: 0 } }) }));

import EditorTopBar from "./EditorTopBar";
import ResumeSettingsSheet from "./ResumeSettingsSheet";
import { BuilderEnvProvider, PERSONAL_ENV, actForApplies, actForEditorEnv, consultantEnv } from "./builderEnv";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const barProps = () => ({
  status: "saved" as const,
  savedAt: 1,
  now: 1,
  error: null,
  leftPanel: null,
  onTogglePanel: vi.fn(),
  panelRefs: { add: createRef<HTMLButtonElement>(), template: createRef<HTMLButtonElement>(), swap: createRef<HTMLButtonElement>(), tailor: createRef<HTMLButtonElement>() },
  onDownloadPdf: vi.fn(),
  onDownloadText: vi.fn(),
  onClose: vi.fn(),
});

describe("the builder environment", () => {
  it("the default is exactly the personal app", () => {
    expect(PERSONAL_ENV.listHref).toBe("/resume-builder");
    expect(PERSONAL_ENV.editorHref(7)).toBe("/resume-builder/7");
    expect(PERSONAL_ENV.createBuiltUrl).toBe("/api/resumes/built");
    expect(PERSONAL_ENV.brandHref).toBe("/dashboard");
    expect(PERSONAL_ENV.upgradeHref).toBe("/pricing");
    expect(PERSONAL_ENV.actForRow).toBeNull();
    expect(PERSONAL_ENV.actForResumeId).toBeNull();
  });

  it("an organization workspace has its own URLs, its own create route, no Kiwiply logo link and nothing to buy", () => {
    const env = consultantEnv(2);
    expect(env.listHref).toBe("/w/consultant/resumes");
    expect(env.editorHref(7)).toBe("/w/consultant/resumes/7");
    expect(env.createBuiltUrl).toBe("/api/orgs/2/me-workspace/resumes/built");
    expect(env.brandHref).toBeNull();
    expect(env.upgradeHref).toBeNull();
  });

  it("the editor's top bar draws the Kiwiply logo only in the personal app, and says 'Pending consultant approval' next to the save state when acting for someone", () => {
    const { unmount } = render(<EditorTopBar {...barProps()} />);
    expect(screen.getByText("Kiwiply logo")).toBeTruthy();
    unmount();
    render(
      <BuilderEnvProvider env={actForEditorEnv(5, 42)}>
        <EditorTopBar {...barProps()} approvalNotice="Pending consultant approval" />
      </BuilderEnvProvider>,
    );
    expect(screen.queryByText("Kiwiply logo")).toBeNull();
    expect(document.querySelector("[data-approval-notice]")?.textContent).toBe("Pending consultant approval");
  });

  describe("the act-for fetch wrapper", () => {
    const ORIGIN = window.location.origin;
    const calls: { url: string; header: string | null }[] = [];
    let original: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      calls.length = 0;
      original = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input instanceof Request ? input.url : input), header: new Headers(init?.headers).get("X-Kiwiply-Act-For") });
        return new Response("{}");
      });
      window.fetch = original as unknown as typeof window.fetch;
    });

    const mountFor = (row: number, resumeId: number) =>
      render(
        <BuilderEnvProvider env={actForEditorEnv(row, resumeId)}>
          <span>editor</span>
        </BuilderEnvProvider>,
      );

    it("tags only the act-for resume's own /api/resumes/<id> calls and the builder config", async () => {
      const { unmount } = mountFor(5, 42);
      await window.fetch("/api/resumes/42/doc", { headers: { "if-match": "1" } });
      await window.fetch("/api/resumes/42");
      await window.fetch("/api/resumes/builder-config");
      await window.fetch(`${ORIGIN}/api/resumes/42/doc/pdf-status`);
      expect(calls.map((c) => c.header)).toEqual(["5", "5", "5", "5"]);
      expect(calls[0].url).toBe("/api/resumes/42/doc");
      unmount();
    });

    it("never tags a cross-origin URL, another resume, a look-alike path or a non-builder /api path", async () => {
      const { unmount } = mountFor(5, 42);
      await window.fetch("https://evil.example/api/resumes/42/doc");
      await window.fetch("//evil.example/api/resumes/42/doc");
      await window.fetch("/api/resumes/43/doc");
      await window.fetch("/api/resumes/420/doc");
      await window.fetch("/api/resumes/42x/doc");
      await window.fetch("/api/resumes/42/../43/doc"); // normalises to another resume
      await window.fetch("/api/orgs/2/me-workspace/resumes");
      await window.fetch("/api/profile");
      await window.fetch("/some/other/path");
      await window.fetch(new Request(`${ORIGIN}/api/billing/plan`));
      expect(calls).toHaveLength(10);
      for (const c of calls) expect(c.header, c.url).toBeNull();
      unmount();
    });

    it("a Request object for the act-for resume is tagged and keeps its own headers", async () => {
      const { unmount } = mountFor(5, 42);
      await window.fetch(new Request(`${ORIGIN}/api/resumes/42/doc`, { headers: { "if-match": "2" } }));
      expect(calls[0].header).toBe("5");
      unmount();
    });

    it("restores fetch on unmount", () => {
      const { unmount } = mountFor(5, 42);
      expect(window.fetch).not.toBe(original);
      unmount();
      expect(window.fetch).toBe(original);
    });

    it("switching rows re-tags with the new row for the new resume, and fetch is restored in the end", async () => {
      const { rerender, unmount } = mountFor(5, 42);
      rerender(
        <BuilderEnvProvider env={actForEditorEnv(6, 43)}>
          <span>editor</span>
        </BuilderEnvProvider>,
      );
      await window.fetch("/api/resumes/42/doc");
      await window.fetch("/api/resumes/43/doc");
      expect(calls.map((c) => c.header)).toEqual([null, "6"]);
      unmount();
      expect(window.fetch).toBe(original);
    });

    it("a wrapper left behind by something that wrapped on top of it passes straight through once unmounted", async () => {
      const { unmount } = mountFor(5, 42);
      const mine = window.fetch;
      const onTop = vi.fn((input: RequestInfo | URL, init?: RequestInit) => mine(input, init));
      window.fetch = onTop as unknown as typeof window.fetch;
      unmount();
      await window.fetch("/api/resumes/42/doc");
      expect(calls[0].header).toBeNull();
    });

    it("actForApplies reads the URL against the page's own origin", () => {
      expect(actForApplies("/api/resumes/42/doc", 42, ORIGIN)).toBe(true);
      expect(actForApplies(new URL(`${ORIGIN}/api/resumes/42/meta`), 42, ORIGIN)).toBe(true);
      expect(actForApplies("http://[bad", 42, ORIGIN)).toBe(false);
      expect(actForApplies(`${ORIGIN}.evil.example/api/resumes/42/doc`, 42, ORIGIN)).toBe(false);
    });
  });

  it("acting for someone draws no Download menu (saving a version and storing a PDF are the owner's)", () => {
    render(<EditorTopBar {...barProps()} allowDownload={false} />);
    expect(screen.queryByRole("button", { name: "Download" })).toBeNull();
    cleanup();
    render(<EditorTopBar {...barProps()} />);
    expect(screen.getByRole("button", { name: "Download" })).toBeTruthy();
  });

  it("the personal app installs no act-for header", async () => {
    const original = vi.fn(async () => new Response("{}"));
    window.fetch = original as unknown as typeof window.fetch;
    render(
      <BuilderEnvProvider env={PERSONAL_ENV}>
        <span>editor</span>
      </BuilderEnvProvider>,
    );
    expect(window.fetch).toBe(original);
  });

  it("Resume settings draws no sharing, no primary and no danger zone when the session may not use them", async () => {
    const meta = testMeta({ hasOriginal: true });
    render(
      <ToastProvider>
        <BuilderEnvProvider env={consultantEnv(2)}>
          <ResumeSettingsSheet
            resumeId={42}
            meta={meta}
            onMeta={vi.fn()}
            config={{ ...DEFAULT_BUILDER_CONFIG, capabilities: { ...PERSONAL_CAPABILITIES, mode: "consultant", shareLinks: false, deleteResume: false, archiveResume: false, setPrimary: false } }}
            active
            phone={false}
          />
        </BuilderEnvProvider>
      </ToastProvider>,
    );
    expect(await screen.findByText("About")).toBeTruthy();
    expect(screen.queryByText("Primary resume")).toBeNull();
    expect(screen.queryByText("Visibility")).toBeNull();
    expect(screen.queryByText("Danger zone")).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    expect(screen.getByText("About")).toBeTruthy();
  });
});
