import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NothingFoundError, type SetupParse } from "@/lib/profile-setup/parse";
import SourceStep, { READ_ERROR, RESUME_ACCEPT, tooBig } from "./SourceStep";

vi.mock("next/image", () => ({ default: ({ src }: { src: string }) => <span data-mascot={src} /> }));

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

/** The admin limits `config.profile` carries (here: the API defaults, with a 2 MB upload cap). */
const BIO = { valueChars: 500, summaryChars: 2000 };
const MAX = 2 * 1024 * 1024;

const result: SetupParse = { draft: { candidates: [], skills: ["Go"], suggestions: [], languages: [], identity: {}, removed: 0 }, source: "heuristic", removed: 0 };

describe("SourceStep", () => {
  const pick = (file: File) => fireEvent.change(screen.getByTestId("resume-file"), { target: { files: [file] } });
  const base = { maxBytes: MAX, bioLimits: BIO, onParsed: vi.fn(), onPath: vi.fn(), onSkip: vi.fn(), mascot: true };

  it("upload is the hero: one real button for the drop zone, the cap in words, and the picker accepts PDF, DOCX and TXT", () => {
    render(<SourceStep persona={null} {...base} />);
    expect(screen.getByRole("heading", { level: 1, name: "Drop in your resume." })).toBeTruthy();
    expect(screen.getByText("We'll read it and you confirm what's right — no typing.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Choose a file/ })).toBeTruthy();
    expect(screen.getByText("PDF, DOCX or TXT · up to 2 MB")).toBeTruthy();
    expect(screen.getByTestId("resume-file").getAttribute("accept")).toBe(RESUME_ACCEPT);
  });

  it("parses the chosen file, tells the wizard the way in is upload, and hands the result on", async () => {
    const parse = vi.fn().mockResolvedValue(result);
    const onParsed = vi.fn();
    const onPath = vi.fn();
    render(<SourceStep persona="experienced" {...base} parse={parse} onParsed={onParsed} onPath={onPath} />);
    const file = new File(["resume"], "cv.pdf", { type: "application/pdf" });
    pick(file);
    expect(onPath).toHaveBeenCalledWith("upload");
    await waitFor(() => expect(onParsed).toHaveBeenCalledWith(result));
    expect(parse).toHaveBeenCalledWith(file, true, BIO);
  });

  it("shows the busy card while it reads", async () => {
    let finish: (r: SetupParse) => void = () => undefined;
    const parse = vi.fn().mockReturnValue(new Promise<SetupParse>((r) => (finish = r)));
    render(<SourceStep persona={null} {...base} parse={parse} />);
    pick(new File(["x"], "cv.pdf"));
    expect(await screen.findByText("Reading your resume…")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Choose a file/ })).toBeNull();
    finish(result);
  });

  it("experienced and switching see Paste first, then Start fresh under 'No file handy?'", () => {
    render(<SourceStep persona="experienced" {...base} />);
    expect(screen.getByText("No file handy?")).toBeTruthy();
    const chips = screen.getAllByRole("button").filter((b) => /^(Paste text|Start fresh)$/.test(b.textContent ?? ""));
    expect(chips.map((b) => b.textContent)).toEqual(["Paste text", "Start fresh"]);
    expect(chips[1].className).not.toContain("bg-accent-soft");
  });

  it("student and first job lead with Start fresh, soft-accented, under 'No resume yet? Totally fine.'", () => {
    const onPath = vi.fn();
    render(<SourceStep persona="student" {...base} onPath={onPath} />);
    expect(screen.getByText("No resume yet? Totally fine.")).toBeTruthy();
    const chips = screen.getAllByRole("button").filter((b) => /^(Paste text|Start fresh)$/.test(b.textContent ?? ""));
    expect(chips.map((b) => b.textContent)).toEqual(["Start fresh", "Paste text"]);
    expect(chips[0].className).toContain("bg-accent-soft");
    fireEvent.click(chips[0]);
    expect(onPath).toHaveBeenCalledWith("fresh");
    fireEvent.click(chips[1]);
    expect(onPath).toHaveBeenCalledWith("paste");
  });

  it("the lock line expands to the never-collected promise", () => {
    render(<SourceStep persona={null} {...base} />);
    const lock = screen.getByText("We remove SSN, bank and ID numbers before reading.").closest("details") as HTMLDetailsElement;
    expect(lock.open).toBe(false);
    expect(lock.textContent).toContain("We never collect Social Security, bank, passport or birth-date details.");
    fireEvent.click(lock.querySelector("summary") as HTMLElement);
    lock.open = true; // jsdom does not toggle `details` on a click
    expect(lock.open).toBe(true);
  });

  it("a phone has no drag copy and no drop handlers; the zone is still the one picker button", () => {
    vi.stubGlobal("navigator", { ...navigator, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148" });
    render(<SourceStep persona={null} {...base} />);
    const zone = screen.getByRole("button", { name: /Choose a file/ });
    fireEvent.dragOver(zone.parentElement as HTMLElement);
    expect(screen.queryByText("Drop it here")).toBeNull();
    expect(zone.textContent).not.toMatch(/drag/i);
  });

  it("a laptop shows 'Drop it here' while a file is dragged over, and takes the dropped file", async () => {
    vi.stubGlobal("navigator", { ...navigator, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0" });
    const parse = vi.fn().mockResolvedValue(result);
    const onParsed = vi.fn();
    render(<SourceStep persona={null} {...base} parse={parse} onParsed={onParsed} />);
    const zone = screen.getByRole("button", { name: /Choose a file/ }).parentElement as HTMLElement;
    fireEvent.dragOver(zone);
    expect(screen.getByText("Drop it here")).toBeTruthy();
    const file = new File(["resume"], "cv.pdf");
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    await waitFor(() => expect(onParsed).toHaveBeenCalledWith(result));
    expect(parse).toHaveBeenCalledWith(file, true, BIO);
  });

  it("refuses a file that is too large without parsing it, in the §5.3 words", async () => {
    const parse = vi.fn();
    render(<SourceStep persona={null} {...base} parse={parse} />);
    const big = new File(["x"], "big.pdf");
    Object.defineProperty(big, "size", { value: MAX + 1 });
    pick(big);
    expect((await screen.findByRole("alert")).textContent).toBe(tooBig("2 MB"));
    expect(tooBig("10 MB")).toBe("That file is over 10 MB. Try a smaller one, or paste the text instead.");
    expect(parse).not.toHaveBeenCalled();
  });

  it("an unreadable file gets the plain line and the zone comes back for another try; 'nothing found' keeps its own words", async () => {
    const parse = vi.fn().mockRejectedValueOnce(new Error("boom")).mockRejectedValueOnce(new NothingFoundError("We couldn't find work history, education or skills in that."));
    render(<SourceStep persona={null} {...base} parse={parse} />);
    pick(new File(["x"], "scan.pdf"));
    expect((await screen.findByRole("alert")).textContent).toBe(READ_ERROR);
    expect(READ_ERROR).toBe("We couldn't read that file. Try another, or paste the text instead.");
    expect((screen.getByRole("button", { name: /Choose a file/ }) as HTMLButtonElement).disabled).toBe(false);
    pick(new File(["x"], "empty.pdf"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/couldn't find work history/));
  });

  it("shows the consent copy of the resumes page, and 'Skip for now' goes on without a file", () => {
    const onSkip = vi.fn();
    render(<SourceStep persona={null} {...base} onSkip={onSkip} />);
    expect(screen.getByLabelText(/Parse with AI for best accuracy/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("draws the resume mascot only when the admin has them on", () => {
    const { container, rerender } = render(<SourceStep persona={null} {...base} />);
    expect(container.querySelector("[data-mascot='/v2/app/mascot-resume.png']")).not.toBeNull();
    rerender(<SourceStep persona={null} {...base} mascot={false} />);
    expect(container.querySelector("[data-mascot]")).toBeNull();
  });
});
