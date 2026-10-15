// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import { DEFAULT_BUILDER_CONFIG, PERSONAL_CAPABILITIES, type BuilderCapabilities, type ResumeBuilderConfig } from "@/lib/resume-builder-config.shared";
import { testLineage, testMeta, testVersions } from "./test-meta";

const m = vi.hoisted(() => ({ getMeta: vi.fn(), getLineage: vi.fn(), listVersions: vi.fn(), getAccess: vi.fn(), duplicateResume: vi.fn(), push: vi.fn() }));
vi.mock("@/lib/resume-meta", async (orig) => ({
  ...(await orig<typeof import("@/lib/resume-meta")>()),
  getMeta: m.getMeta,
  getLineage: m.getLineage,
  listVersions: m.listVersions,
  getAccess: m.getAccess,
}));
vi.mock("@/lib/resume-list-api", async (orig) => ({ ...(await orig<typeof import("@/lib/resume-list-api")>()), duplicateResume: m.duplicateResume }));
vi.mock("@/lib/use-date-display", () => ({ useDateDisplay: () => ({ locale: "en-US", timeZone: "UTC" }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: m.push }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));

import ResumeHeaderBar from "./ResumeHeaderBar";
import { BuilderEnvProvider, actForEditorEnv, consultantEnv } from "./builderEnv";

const CONSULTANT: BuilderCapabilities = { ...PERSONAL_CAPABILITIES, mode: "consultant", shareLinks: false, deleteResume: false, archiveResume: false, setPrimary: false, ai: false, tailor: false };
const ACT_FOR: BuilderCapabilities = {
  ...CONSULTANT,
  mode: "marketer-act-for",
  rename: false,
  duplicate: false,
  versionRestore: false,
  downloadOriginal: false,
  approvalNotice: "Pending consultant approval",
};

const ok = <T,>(value: T) => ({ kind: "ok" as const, value });

function bar(caps: BuilderCapabilities | undefined, env = consultantEnv(2), metaOver = {}) {
  const meta = testMeta({ hasOriginal: true, ...metaOver });
  m.getMeta.mockResolvedValue(ok(meta));
  m.getLineage.mockResolvedValue(ok(testLineage()));
  const config: ResumeBuilderConfig = { ...DEFAULT_BUILDER_CONFIG, capabilities: caps };
  render(
    <ToastProvider>
      <BuilderEnvProvider env={env}>
        <ResumeHeaderBar
          resumeId={42}
          initialMeta={meta}
          fallbackName="Fallback"
          config={config}
          viewport="wide"
          savedAt={null}
          ensureSaved={async () => true}
          onDocReplaced={vi.fn()}
          onTailor={vi.fn()}
          onOpenSettings={vi.fn()}
        />
      </BuilderEnvProvider>
    </ToastProvider>,
  );
}

const header = () => screen.getByRole("region", { name: "Resume details" });
const openKebab = () => fireEvent.click(within(header()).getByText("More actions"));
const kebabLabels = () => within(screen.getByRole("menu")).getAllByRole("menuitem").map((i) => i.textContent ?? "");

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset();
  m.listVersions.mockResolvedValue(ok(testVersions()));
  m.getAccess.mockResolvedValue(ok({ org: null, grants: [], links: [], viewers: 0 }));
});
afterEach(() => cleanup());

describe("the one header bar follows the session's capabilities", () => {
  it("personal (and an API that predates capabilities): every action, as it always was", () => {
    bar(undefined);
    openKebab();
    const labels = kebabLabels();
    for (const want of ["Rename", "Duplicate", "Save version…", "Version history", "Download original", "Resume settings…", "Archive", "Delete"]) expect(labels, want).toContain(want);
    expect(within(header()).getByRole("button", { name: /Visibility|Private|Only me|Organization/i })).toBeTruthy();
  });

  it("a consultant in an organization: no sharing, no primary, no archive or delete, no tailoring; rename, duplicate and versions stay", () => {
    bar(CONSULTANT);
    openKebab();
    const labels = kebabLabels();
    for (const gone of ["Set as primary", "Archive", "Unarchive", "Delete", "Tailor for a job…"]) expect(labels, gone).not.toContain(gone);
    for (const kept of ["Rename", "Duplicate", "Save version…", "Version history", "Download original", "Resume settings…"]) expect(labels, kept).toContain(kept);
    expect(within(header()).queryByRole("button", { name: /Shared with Recruiters|Recruiters/i })).toBeNull();
    expect(within(header()).queryByRole("button", { name: /Set as primary/ })).toBeNull();
  });

  it("the header says who last modified it, by name and role, with the absolute time on hover: the marketer, never the consultant whose account owns it", () => {
    const marketer = { login: "ent#5#sarah@acme.org", label: "Sarah Chen (marketer)" };
    bar(CONSULTANT, consultantEnv(2), { updatedBy: marketer, createdBy: marketer, source: { kind: "BUILT", origin: "PROFILE", tailoredFrom: null, madeBy: "Sarah Chen (marketer)", approvalRequired: true, approvedAt: null } });
    const text = within(header()).getByText(/Last modified/);
    expect(text.textContent).toMatch(/^Last modified .+ ago by Sarah Chen \(marketer\)$/);
    expect(text.parentElement?.getAttribute("title")).toMatch(/\d{4}.* by Sarah Chen \(marketer\)$/);
    expect(header().textContent).not.toContain("ent#");
  });

  it("Duplicate in an organization opens the copy inside the workspace's editor", async () => {
    m.duplicateResume.mockResolvedValue({ kind: "ok", id: 99 });
    bar(CONSULTANT);
    openKebab();
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Duplicate" }));
    await waitFor(() => expect(m.push).toHaveBeenCalledWith("/w/consultant/resumes/99"));
  });

  it("a marketer acting for a consultant: nothing but editing and looking (no rename, duplicate, versions, settings, sharing, primary, archive, delete)", () => {
    bar(ACT_FOR, actForEditorEnv(5));
    expect(within(header()).queryByRole("button", { name: "Rename" })).toBeNull();
    // there is nothing left to offer, so there is no empty menu either
    expect(within(header()).queryByText("More actions")).toBeNull();
    expect(within(header()).queryByRole("button", { name: /Versions/ })).toBeNull();
  });
});
