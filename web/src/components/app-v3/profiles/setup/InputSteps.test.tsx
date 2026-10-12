import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SetupParse } from "@/lib/profile-setup/parse";
import PasteStep from "./PasteStep";
import UploadStep from "./UploadStep";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const result: SetupParse = { draft: { candidates: [], skills: ["Go"], suggestions: [], languages: [], identity: {}, removed: 0 }, source: "heuristic", removed: 0 };

describe("PasteStep", () => {
  it("stays off until there is enough text, then parses it with the AI choice (on by default)", async () => {
    const parse = vi.fn().mockResolvedValue(result);
    const onParsed = vi.fn();
    render(<PasteStep onParsed={onParsed} parse={parse} />);
    const go = screen.getByRole("button", { name: "Read my text" }) as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Resume text"), { target: { value: "Jane Doe, software engineer at Acme since 2020" } });
    expect(go.disabled).toBe(false);
    fireEvent.click(go);
    await waitFor(() => expect(onParsed).toHaveBeenCalledWith(result));
    expect(parse).toHaveBeenCalledWith("Jane Doe, software engineer at Acme since 2020", true);
  });

  it("honours the opt-out and shows the message when nothing could be read", async () => {
    localStorage.setItem("kiwiply.aiParseConsent", "0");
    const parse = vi.fn().mockRejectedValue(new Error("We couldn't find work history."));
    render(<PasteStep onParsed={vi.fn()} parse={parse} />);
    expect(screen.getByText(/Parsed right here in your browser/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Resume text"), { target: { value: "x".repeat(60) } });
    fireEvent.click(screen.getByRole("button", { name: "Read my text" }));
    expect((await screen.findByRole("alert")).textContent).toBe("We couldn't find work history.");
    expect(parse).toHaveBeenCalledWith("x".repeat(60), false);
    // The text is still there to fix and retry.
    expect((screen.getByLabelText("Resume text") as HTMLTextAreaElement).value).toBe("x".repeat(60));
  });
});

describe("UploadStep", () => {
  const pick = (file: File) => fireEvent.change(screen.getByTestId("resume-file"), { target: { files: [file] } });

  it("parses the chosen file and hands the result on", async () => {
    const parse = vi.fn().mockResolvedValue(result);
    const onParsed = vi.fn();
    render(<UploadStep onParsed={onParsed} parse={parse} />);
    const file = new File(["resume"], "cv.pdf", { type: "application/pdf" });
    pick(file);
    await waitFor(() => expect(onParsed).toHaveBeenCalledWith(result));
    expect(parse).toHaveBeenCalledWith(file, true);
  });

  it("shows the consent copy of the resumes page", () => {
    render(<UploadStep onParsed={vi.fn()} />);
    expect(screen.getByLabelText(/Parse with AI for best accuracy/)).toBeTruthy();
  });

  it("refuses a file that is too large without parsing it", async () => {
    const parse = vi.fn();
    render(<UploadStep onParsed={vi.fn()} parse={parse} />);
    const big = new File(["x"], "big.pdf");
    Object.defineProperty(big, "size", { value: 11 * 1024 * 1024 });
    pick(big);
    expect((await screen.findByRole("alert")).textContent).toMatch(/too large/);
    expect(parse).not.toHaveBeenCalled();
  });

  it("shows the reason and lets the user try again", async () => {
    const parse = vi.fn().mockRejectedValue(new Error("We couldn't read the text in that PDF."));
    render(<UploadStep onParsed={vi.fn()} parse={parse} />);
    pick(new File(["x"], "scan.pdf"));
    expect((await screen.findByRole("alert")).textContent).toBe("We couldn't read the text in that PDF.");
    expect((screen.getByRole("button", { name: "Choose a file" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
