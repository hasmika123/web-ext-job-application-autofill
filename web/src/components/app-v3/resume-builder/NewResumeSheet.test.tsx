import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import type { StructuredResume } from "@kiwiply/ui";
import type { ResumeUploadParse } from "@/lib/profile-setup/parse";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));
const createBuilt = vi.fn();
vi.mock("@/lib/resume-doc", async (orig) => ({ ...(await orig<typeof import("@/lib/resume-doc")>()), createBuilt: (...a: unknown[]) => createBuilt(...a) }));
const attachOriginal = vi.fn();
vi.mock("@/lib/resume-list-api", () => ({ attachOriginal: (...a: unknown[]) => attachOriginal(...a) }));

import NewResumeSheet, { BUILD_PROFILE_HREF, type NewResumeSheetProps } from "./NewResumeSheet";
import type { ProfileSummary, ResumeChoice } from "./new-resume/model";

const PROFILE: ProfileSummary = { itemCount: 5, roles: 3, schools: 2, skills: 14, score: 78, headline: "Backend Engineer" };

const structured = (): StructuredResume => ({
  summary: "Engineer.",
  skills: ["Java", "SQL", "Go"],
  experience: [
    { company: "Acme", title: "Engineer", location: "", startDate: "2020", endDate: "", current: true, bullets: ["Built"] },
    { company: "Globex", title: "Intern", location: "", startDate: "2018", endDate: "2019", current: false, bullets: ["Learned"] },
    { company: "Initech", title: "Analyst", location: "", startDate: "2016", endDate: "2017", current: false, bullets: [] },
  ],
  education: [{ school: "MIT", degree: "BS", field: "CS", startDate: "2012", endDate: "2016", gpa: "", location: "" }],
  languages: [],
  projects: [],
});

const PARSE: ResumeUploadParse = { structured: structured(), bio: { firstName: "Ada" }, source: "heuristic", removed: 2 };
const FILE = new File(["%PDF"], "Ada Lovelace CV.pdf", { type: "application/pdf" });

const RESUMES: ResumeChoice[] = [
  { id: 7, name: "Backend v3", kind: "BUILT", updatedAt: "2026-10-10T00:00:00Z", score: 82, templateId: "modern" },
  { id: 8, name: "Old upload", kind: "UPLOADED", updatedAt: "2026-09-01T00:00:00Z", score: null, templateId: null },
];

function open(props: Partial<NewResumeSheetProps> = {}) {
  const onClose = vi.fn();
  const onLimit = vi.fn();
  const parseFile = vi.fn().mockResolvedValue(PARSE);
  render(
    <ToastProvider>
      <NewResumeSheet open onClose={onClose} onLimit={onLimit} parseFile={parseFile} profile={PROFILE} resumes={RESUMES} defaultTemplateId="modern" {...props} />
    </ToastProvider>,
  );
  return { onClose, onLimit, parseFile };
}

const radio = (re: RegExp) => screen.getByRole("radio", { name: re });
const next = () => fireEvent.click(screen.getByRole("button", { name: "Continue" }));
const create = () => fireEvent.click(screen.getByRole("button", { name: "Create resume" }));
const nameBox = () => screen.getByRole("textbox", { name: /Resume name/ }) as HTMLInputElement;

async function uploadFile() {
  fireEvent.change(screen.getByTestId("resume-file"), { target: { files: [FILE] } });
  await screen.findByTestId("upload-review");
}

beforeEach(() => {
  push.mockReset();
  createBuilt.mockReset();
  attachOriginal.mockReset();
  attachOriginal.mockResolvedValue({ kind: "ok" });
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("NewResumeSheet: step 1, the four sources", () => {
  it("offers exactly the four cards, in order, with their copy", () => {
    open();
    const titles = screen.getAllByRole("radio").map((r) => r.textContent);
    expect(titles).toHaveLength(4);
    expect(titles[0]).toContain("Use my profile");
    expect(titles[1]).toContain("Upload a resume");
    expect(titles[2]).toContain("Copy an existing resume");
    expect(titles[3]).toContain("Start from scratch");
    expect(screen.getByText("PDF, DOCX or TXT · we read it and you review")).toBeTruthy();
    expect(screen.getByText("A blank resume — just your name and contact, you add the rest")).toBeTruthy();
  });

  it("profile card is preselected and shows counts from the profile", () => {
    open();
    expect(radio(/Use my profile/).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("Your saved profile: 3 roles · 2 schools · 14 skills · 78% complete")).toBeTruthy();
  });

  it("an empty profile shows 'Build my profile', and 'Start with just my name and contact' picks scratch", () => {
    open({ profile: { itemCount: 0, roles: 0, schools: 0, skills: 0, score: null, headline: null } });
    expect(screen.getByText("Your profile is empty")).toBeTruthy();
    expect((radio(/Use my profile/) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("link", { name: "Build my profile · 2 min" }).getAttribute("href")).toBe("/profiles/setup?return=%2Fresume-builder%3Fnew%3Dprofile");
    // the quickest way in is an upload, so that is what is preselected
    expect(radio(/Upload a resume/).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Start with just my name and contact" }));
    expect(radio(/Start from scratch/).getAttribute("aria-checked")).toBe("true");
  });

  it("opened for ?new=profile (initialSource profile) it preselects Use my profile", () => {
    open({ initialSource: "profile" });
    expect(radio(/Use my profile/).getAttribute("aria-checked")).toBe("true");
    expect(radio(/Upload a resume/).getAttribute("aria-checked")).toBe("false");
  });

  it("the Build my profile link round-trips: the setup's return path is the chooser on Use my profile", () => {
    expect(BUILD_PROFILE_HREF).toBe("/profiles/setup?return=%2Fresume-builder%3Fnew%3Dprofile");
    const params = new URL(BUILD_PROFILE_HREF, "https://x.test").searchParams;
    expect(params.get("return")).toBe("/resume-builder?new=profile");
  });

  it("Copy lists the non-archived resumes handed to it, and says so when there are none", () => {
    open();
    expect(screen.getByText("Start from one of your 2 resumes")).toBeTruthy();
    fireEvent.click(radio(/Copy an existing resume/));
    const list = screen.getByRole("radiogroup", { name: "Resume to copy" });
    expect(within(list).getAllByRole("radio").map((r) => r.textContent)).toEqual([expect.stringContaining("Backend v3"), expect.stringContaining("Old upload")]);
    expect(within(list).getByText("82%")).toBeTruthy();
    expect(within(list).getByText("Uploaded")).toBeTruthy();
    cleanup();

    open({ resumes: [] });
    expect(screen.getByText("You don't have a resume to copy yet")).toBeTruthy();
    expect((radio(/Copy an existing resume/) as HTMLButtonElement).disabled).toBe(true);
  });

  it("Upload reads the file, then shows the review counts, the redaction line and the KeepMask checklist", async () => {
    const { parseFile } = open();
    fireEvent.click(radio(/Upload a resume/));
    expect(screen.getByLabelText(/AI/i)).toBeTruthy(); // the parsing-consent checkbox
    await uploadFile();
    expect(parseFile).toHaveBeenCalledWith(FILE, true);
    expect(screen.getByTestId("upload-review").textContent).toContain("We found 3 roles, 1 school, 3 skills");
    expect(screen.getByText("We removed 2 sensitive values — we never collect those.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Review items" }));
    const globex = screen.getByRole("checkbox", { name: /Intern · Globex/ }) as HTMLInputElement;
    expect(globex.checked).toBe(true);
    fireEvent.click(globex);
    expect(globex.checked).toBe(false);
  });

  it("Continue stays disabled until the chosen source has what it needs", async () => {
    open();
    const cont = screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement;
    expect(cont.disabled).toBe(false); // profile, with items
    fireEvent.click(radio(/Upload a resume/));
    expect(cont.disabled).toBe(true);
    await uploadFile();
    expect(cont.disabled).toBe(false);
    fireEvent.click(radio(/Copy an existing resume/));
    expect(cont.disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: /Backend v3/ }));
    expect(cont.disabled).toBe(false);
  });

  it("a file that cannot be read is explained and nothing continues", async () => {
    open({ parseFile: vi.fn().mockRejectedValue(new Error("We couldn't read the text in that PDF.")) });
    fireEvent.click(radio(/Upload a resume/));
    fireEvent.change(screen.getByTestId("resume-file"), { target: { files: [FILE] } });
    expect((await screen.findByRole("alert")).textContent).toContain("couldn't read the text");
    expect((screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("NewResumeSheet: step 2 and Create", () => {
  it("names the resume by the rule for each source", async () => {
    open();
    next();
    expect(nameBox().value).toBe("Backend Engineer"); // profile: the headline
    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    fireEvent.click(radio(/Start from scratch/));
    next();
    expect(nameBox().value).toBe("My resume");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    fireEvent.click(radio(/Copy an existing resume/));
    fireEvent.click(screen.getByRole("radio", { name: /Backend v3/ }));
    next();
    expect(nameBox().value).toBe("Backend v3 (copy)");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    fireEvent.click(radio(/Upload a resume/));
    await uploadFile();
    next();
    expect(nameBox().value).toBe("Ada Lovelace CV"); // the file name without its extension
  });

  it("a profile without a headline is named 'My resume'", () => {
    open({ profile: { ...PROFILE, headline: null } });
    next();
    expect(nameBox().value).toBe("My resume");
  });

  it("says which template it uses (no template step) and that it can change in the editor", () => {
    open();
    next();
    expect(screen.getByText(/Template:/).textContent).toBe("Template: Modern — you can change it in the editor");
  });

  it("a preselected template is the one named", () => {
    open({ templateId: "modern", defaultTemplateId: "other" });
    next();
    expect(screen.getByText(/Template:/).textContent).toContain("Modern");
  });

  it("Create posts the profile source with the typed name and target, and opens the editor", async () => {
    createBuilt.mockResolvedValue({ kind: "ok", id: 31 });
    open();
    next();
    fireEvent.change(nameBox(), { target: { value: "Staff Backend" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Target role/ }), { target: { value: "Staff Engineer" } });
    create();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/resume-builder/31"));
    expect(createBuilt).toHaveBeenCalledWith({ source: { kind: "profile" }, label: "Staff Backend", target: "Staff Engineer" }, "/api/resumes/built");
  });

  it("Create posts scratch and copy sources", async () => {
    createBuilt.mockResolvedValue({ kind: "ok", id: 32 });
    open();
    fireEvent.click(radio(/Start from scratch/));
    next();
    create();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/resume-builder/32"));
    expect(createBuilt).toHaveBeenLastCalledWith({ source: { kind: "scratch" }, label: "My resume" }, "/api/resumes/built");
    cleanup();

    createBuilt.mockClear();
    open();
    fireEvent.click(radio(/Copy an existing resume/));
    fireEvent.click(screen.getByRole("radio", { name: /Backend v3/ }));
    next();
    create();
    await waitFor(() => expect(createBuilt).toHaveBeenCalled());
    expect(createBuilt).toHaveBeenLastCalledWith({ source: { kind: "copy", fromResumeId: 7 }, label: "Backend v3 (copy)" }, "/api/resumes/built");
  });

  it("Create posts the parsed upload with the KeepMask of what was unticked, then attaches the original", async () => {
    createBuilt.mockResolvedValue({ kind: "ok", id: 33 });
    open();
    fireEvent.click(radio(/Upload a resume/));
    await uploadFile();
    fireEvent.click(screen.getByRole("button", { name: "Review items" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Intern · Globex/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Skills/ }));
    next();
    create();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/resume-builder/33"));
    const body = createBuilt.mock.calls[0][0];
    expect(body.source).toMatchObject({ kind: "upload", fileName: "Ada Lovelace CV.pdf", keep: { experience: [0, 2], skills: false } });
    expect(body.source.keep.education).toBeUndefined();
    expect(body.source.structured.experience).toHaveLength(3);
    expect(body.label).toBe("Ada Lovelace CV");
    expect(attachOriginal).toHaveBeenCalledWith(33, FILE);
    // the editor is opened after the original is attached, never before
    expect(attachOriginal.mock.invocationCallOrder[0]).toBeLessThan(push.mock.invocationCallOrder[0]);
  });

  it("a failed attach of the original still opens the editor, with a toast", async () => {
    createBuilt.mockResolvedValue({ kind: "ok", id: 34 });
    attachOriginal.mockResolvedValue({ kind: "error", message: "nope" });
    open();
    fireEvent.click(radio(/Upload a resume/));
    await uploadFile();
    next();
    create();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/resume-builder/34"));
    expect(await screen.findByText("Resume created, but the original file couldn't be attached")).toBeTruthy();
  });

  it("a 402 closes the chooser and hands the notice to the page", async () => {
    createBuilt.mockResolvedValue({ kind: "limit", plan: "FREE", message: "Free accounts keep up to 3 resumes." });
    const { onClose, onLimit } = open();
    next();
    create();
    await waitFor(() => expect(onLimit).toHaveBeenCalledWith({ plan: "FREE", message: "Free accounts keep up to 3 resumes." }));
    expect(onClose).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("a never-collected value in the upload sends you back to the review with that item marked", async () => {
    createBuilt.mockResolvedValue({ kind: "sensitive", path: "structured.experience[1].bullets[0]", message: "We never store a Social Security number." });
    open();
    fireEvent.click(radio(/Upload a resume/));
    await uploadFile();
    next();
    create();
    expect((await screen.findByRole("alert")).textContent).toContain("We never store a Social Security number.");
    expect(screen.getByRole("heading", { name: "Start your resume from" })).toBeTruthy();
    const row = screen.getByRole("checkbox", { name: /Intern · Globex/ }).closest("label") as HTMLElement;
    expect(row.textContent).toContain("Has a value we never collect");
    expect(push).not.toHaveBeenCalled();
  });

  it("any other refusal is shown on the second step and the user can try again", async () => {
    createBuilt.mockResolvedValueOnce({ kind: "error", message: "Couldn't reach the server." }).mockResolvedValueOnce({ kind: "ok", id: 35 });
    open();
    next();
    create();
    expect((await screen.findByRole("alert")).textContent).toContain("Couldn't reach the server.");
    create();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/resume-builder/35"));
  });
});

describe("NewResumeSheet: layout", () => {
  it("is a dialog on desktop", () => {
    open();
    expect(screen.getByRole("dialog", { name: "Start your resume from" })).toBeTruthy();
  });

  it("renders as a fullscreen sheet on a phone", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: /max-width: 639px/.test(q), media: q, addEventListener: () => {}, removeEventListener: () => {} }));
    open();
    const sheet = screen.getByRole("dialog", { name: "Start your resume from" });
    expect(sheet.id).toBe("rb-new-resume");
  });

  it("renders nothing while closed", () => {
    render(
      <ToastProvider>
        <NewResumeSheet open={false} onClose={() => {}} defaultTemplateId="modern" />
      </ToastProvider>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
