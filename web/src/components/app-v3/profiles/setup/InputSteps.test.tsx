import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SetupParse } from "@/lib/profile-setup/parse";
import PasteStep, { MIN_CHARS, TOO_SHORT } from "./PasteStep";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

/** The admin limits `config.profile` carries (here: the API defaults, with a 2 MB upload cap). */
const BIO = { valueChars: 500, summaryChars: 2000 };

const result: SetupParse = { draft: { candidates: [], skills: ["Go"], suggestions: [], languages: [], identity: {}, removed: 0 }, source: "heuristic", removed: 0 };

describe("PasteStep", () => {
  const long = "Jane Doe, software engineer at Acme since 2020. ".repeat(3);

  it("has the §5.4 words, stays off until there are 80 characters, then parses with the AI choice (on by default)", async () => {
    const parse = vi.fn().mockResolvedValue(result);
    const onParsed = vi.fn();
    render(<PasteStep onParsed={onParsed} parse={parse} bioLimits={BIO} />);
    expect(screen.getByRole("heading", { level: 1, name: "Paste it in." })).toBeTruthy();
    expect(screen.getByText("From Google Docs, ChatGPT, Notes or LinkedIn — anything with your roles and schools.")).toBeTruthy();
    expect(screen.getByText("We remove SSN, bank and ID numbers before reading.")).toBeTruthy();
    const go = screen.getByRole("button", { name: "Read it" }) as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Resume text"), { target: { value: "x".repeat(MIN_CHARS - 1) } });
    expect(go.disabled).toBe(true);
    expect(screen.getByText(TOO_SHORT)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Resume text"), { target: { value: long } });
    expect(go.disabled).toBe(false);
    expect(screen.queryByText(TOO_SHORT)).toBeNull();
    fireEvent.click(go);
    await waitFor(() => expect(onParsed).toHaveBeenCalledWith(result));
    expect(parse).toHaveBeenCalledWith(long, true, BIO);
  });

  it("honours the opt-out and shows the message when nothing could be read", async () => {
    localStorage.setItem("kiwiply.aiParseConsent", "0");
    const parse = vi.fn().mockRejectedValue(new Error("We couldn't find work history."));
    render(<PasteStep onParsed={vi.fn()} parse={parse} bioLimits={BIO} />);
    expect(screen.getByText(/Parsed right here in your browser/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Resume text"), { target: { value: long } });
    fireEvent.click(screen.getByRole("button", { name: "Read it" }));
    expect((await screen.findByRole("alert")).textContent).toBe("We couldn't find work history.");
    expect(parse).toHaveBeenCalledWith(long, false, BIO);
    // The text is still there to fix and retry.
    expect((screen.getByLabelText("Resume text") as HTMLTextAreaElement).value).toBe(long);
  });

  it("'Upload a file instead' goes back to the source screen", () => {
    const onBack = vi.fn();
    render(<PasteStep onParsed={vi.fn()} onBack={onBack} bioLimits={BIO} />);
    fireEvent.click(screen.getByRole("button", { name: "Upload a file instead" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("a clipboard API puts a Paste button next to the box", async () => {
    vi.stubGlobal("navigator", { ...navigator, clipboard: { readText: () => Promise.resolve("copied resume text") } });
    render(<PasteStep onParsed={vi.fn()} bioLimits={BIO} />);
    fireEvent.click(await screen.findByRole("button", { name: "Paste" }));
    await waitFor(() => expect((screen.getByLabelText("Resume text") as HTMLTextAreaElement).value).toBe("copied resume text"));
  });
});
