// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));
const createBuilt = vi.fn();
vi.mock("@/lib/resume-doc", async (orig) => ({ ...(await orig<typeof import("@/lib/resume-doc")>()), createBuilt: (...a: unknown[]) => createBuilt(...a) }));
const attachOriginal = vi.fn();
vi.mock("@/lib/resume-list-api", () => ({ attachOriginal: (...a: unknown[]) => attachOriginal(...a) }));

// The file's text goes through the REAL parse pipeline (`parseFileForResume`, with its never-collected-values filter); only the parser itself is replaced
// by one that structures whatever text it is GIVEN, so anything the filter let through would end up in the request.
const RAW = [
  "Ada Lovelace",
  "Staff engineer at Acme 2019 to 2023",
  "SSN 078-05-1120",
  "Bank account number 123456789012 routing number 021000021",
  "Tax ID: 12-3456789",
  "Passport number: X1234567",
  "Date of birth: 04/05/1990",
].join("\n");
const structure = (text: string) => ({
  structured: {
    summary: text,
    skills: ["Java"],
    experience: [{ company: "Acme", title: "Staff engineer", location: "", startDate: "2019", endDate: "2023", current: false, bullets: [text] }],
    education: [],
    languages: [],
    projects: [],
  },
  bio: { firstName: "Ada" },
  rawText: text,
  source: "heuristic" as const,
});
const parseFromFile = vi.fn(async (_file: File, opts: { prepareText?: (t: string) => string }) => structure(opts.prepareText ? opts.prepareText(RAW) : RAW));
vi.mock("@/lib/resume-parse", () => ({
  parseResume: (f: File, o: { prepareText?: (t: string) => string }) => parseFromFile(f, o),
  parseResumeWithAi: (f: File, o: { prepareText?: (t: string) => string }) => parseFromFile(f, o),
  parseText: (t: string) => structure(t),
  parseTextWithAi: async (t: string) => structure(t),
}));

import NewResumeSheet from "./NewResumeSheet";
import { BuilderEnvProvider, actForEnv, consultantEnv } from "./builderEnv";

const FORBIDDEN = ["078-05-1120", "123456789012", "021000021", "12-3456789", "X1234567", "04/05/1990"];

function openIn(env: ReturnType<typeof consultantEnv>) {
  render(
    <ToastProvider>
      <BuilderEnvProvider env={env}>
        <NewResumeSheet open onClose={vi.fn()} defaultTemplateId="modern" />
      </BuilderEnvProvider>
    </ToastProvider>,
  );
}

async function uploadAndCreate() {
  fireEvent.click(screen.getByRole("radio", { name: /Upload a resume/ }));
  fireEvent.change(screen.getByTestId("resume-file"), { target: { files: [new File(["%PDF"], "Ada CV.pdf", { type: "application/pdf" })] } });
  await screen.findByTestId("upload-review");
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.click(await screen.findByRole("button", { name: "Create resume" }));
  await waitFor(() => expect(createBuilt).toHaveBeenCalled());
}

beforeEach(() => {
  push.mockReset();
  createBuilt.mockReset();
  createBuilt.mockResolvedValue({ kind: "ok", id: 77, orgResumeId: 5 });
  attachOriginal.mockReset();
  attachOriginal.mockResolvedValue({ kind: "ok" });
  window.localStorage.clear();
});
afterEach(() => cleanup());

describe("the one new-resume chooser inside an organization workspace: no sensitive value is ever collected", () => {
  it("a consultant's upload is scrubbed of SSN, bank and routing numbers, tax id, passport number and date of birth before anything is created", async () => {
    openIn(consultantEnv(2));
    await uploadAndCreate();
    const [body, url] = createBuilt.mock.calls[0] as [unknown, string];
    expect(url).toBe("/api/orgs/2/me-workspace/resumes/built");
    const sent = JSON.stringify(body);
    for (const value of FORBIDDEN) expect(sent, value).not.toContain(value);
    expect(sent).toContain("Staff engineer"); // the legitimate content is kept
    expect(push).toHaveBeenCalledWith("/w/consultant/resumes/77"); // and the editor opens inside the workspace
    // the original file is kept with the consultant's own resume
    expect(attachOriginal).toHaveBeenCalledTimes(1);
  });

  it("a marketer's upload for a consultant is scrubbed the same way, goes to the act-for route and never attaches the file", async () => {
    openIn(actForEnv(2, 9));
    await uploadAndCreate();
    const [body, url] = createBuilt.mock.calls[0] as [unknown, string];
    expect(url).toBe("/api/orgs/2/mkt/resumes/consultants/9/built");
    const sent = JSON.stringify(body);
    for (const value of FORBIDDEN) expect(sent, value).not.toContain(value);
    expect(attachOriginal).not.toHaveBeenCalled();
  });
});
