// @vitest-environment jsdom
import { createRef } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
import { BuilderEnvProvider, PERSONAL_ENV, actForEditorEnv, consultantEnv } from "./builderEnv";

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
      <BuilderEnvProvider env={actForEditorEnv(5)}>
        <EditorTopBar {...barProps()} approvalNotice="Pending consultant approval" />
      </BuilderEnvProvider>,
    );
    expect(screen.queryByText("Kiwiply logo")).toBeNull();
    expect(document.querySelector("[data-approval-notice]")?.textContent).toBe("Pending consultant approval");
  });

  it("acting for someone names the directory row on every same-origin /api call, leaves other calls alone, and always restores fetch", async () => {
    const calls: { url: string; header: string | null }[] = [];
    const original = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), header: new Headers(init?.headers).get("X-Kiwiply-Act-For") });
      return new Response("{}");
    });
    vi.stubGlobal("fetch", original);
    window.fetch = original as unknown as typeof window.fetch;
    const { unmount } = render(
      <BuilderEnvProvider env={actForEditorEnv(5)}>
        <span>editor</span>
      </BuilderEnvProvider>,
    );
    await window.fetch("/api/resumes/42/doc", { headers: { "if-match": "1" } });
    await window.fetch("/some/other/path");
    expect(calls[0]).toEqual({ url: "/api/resumes/42/doc", header: "5" });
    expect(calls[1].header).toBeNull();
    unmount();
    expect(window.fetch).toBe(original);
    vi.unstubAllGlobals();
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
