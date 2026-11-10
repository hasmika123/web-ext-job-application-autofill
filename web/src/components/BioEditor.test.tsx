import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock("@/lib/resume-parse", () => ({ parseResume: vi.fn() }));
vi.mock("@/lib/extension-signal", () => ({ notifyExtension: vi.fn() }));

import BioEditor from "./BioEditor";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({}) });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} }); // the section scroll-spy
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const BIO = { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", headline: "Engineer", summary: "Builds things." };
const flush = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const saved = () => JSON.parse(JSON.parse(fetchMock.mock.calls.at(-1)![1].body as string).payload) as Record<string, unknown>;

describe("BioEditor: headline and summary (R1.6)", () => {
  it("the identity section has a Headline (60 characters) and a Summary textarea (the configured cap)", () => {
    render(<BioEditor initialBio={BIO} show={["identity"]} summaryMax={1500} />);
    const headline = screen.getByLabelText("Headline") as HTMLInputElement;
    expect(headline.maxLength).toBe(60);
    expect(headline.value).toBe("Engineer");
    const summary = screen.getByLabelText("Summary") as HTMLTextAreaElement;
    expect(summary.tagName).toBe("TEXTAREA");
    expect(summary.maxLength).toBe(1500);
    expect(screen.getByText("14 / 1500")).toBeTruthy(); // a live counter
  });

  it("without a configured cap the summary falls back to 2000", () => {
    render(<BioEditor initialBio={BIO} show={["identity"]} />);
    expect((screen.getByLabelText("Summary") as HTMLTextAreaElement).maxLength).toBe(2000);
  });

  it("autosaves headline and summary into the payload like any other key", async () => {
    render(<BioEditor initialBio={BIO} show={["identity"]} />);
    fireEvent.change(screen.getByLabelText("Headline"), { target: { value: "Staff engineer" } });
    fireEvent.change(screen.getByLabelText("Summary"), { target: { value: "Leads platform work." } });
    await flush(1500);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(saved()).toMatchObject({ headline: "Staff engineer", summary: "Leads platform work.", firstName: "Ada" });
  });
});

describe("BioEditor: source chips from meta.provenance (R1.6)", () => {
  const provenance = { firstName: "user", headline: "parsed", summary: "learned" };

  it("shows where each saved value came from, beside the field", () => {
    const { container } = render(<BioEditor initialBio={BIO} show={["identity"]} provenance={provenance} />);
    const chip = (key: string) => container.querySelector(`[data-source="${key}"]`)?.textContent;
    expect(chip("headline")).toBe("From your resume");
    expect(chip("firstName")).toBe("You added");
    expect(chip("summary")).toBe("Learned while applying");
    expect(chip("lastName")).toBeUndefined(); // no recorded source: no chip
  });

  it("the chip is not part of the field's accessible name", () => {
    render(<BioEditor initialBio={BIO} show={["identity"]} provenance={provenance} />);
    expect(screen.getByLabelText("Headline")).toBeTruthy(); // exact label text still resolves
  });

  it("a value you just edited reads as yours at once; clearing it removes the chip", () => {
    const { container } = render(<BioEditor initialBio={BIO} show={["identity"]} provenance={provenance} />);
    fireEvent.change(screen.getByLabelText("Headline"), { target: { value: "Staff engineer" } });
    expect(container.querySelector('[data-source="headline"]')?.textContent).toBe("You added");
    fireEvent.change(screen.getByLabelText("Headline"), { target: { value: "" } });
    expect(container.querySelector('[data-source="headline"]')).toBeNull();
  });
});

describe("BioEditor: never-collected values stay out of free text", () => {
  it("refuses an SSN in the summary with a message and keeps the saved value", async () => {
    render(<BioEditor initialBio={BIO} show={["identity"]} />);
    fireEvent.change(screen.getByLabelText("Summary"), { target: { value: "My SSN is 123-45-6789." } });
    fireEvent.blur(screen.getByLabelText("Summary"));
    expect(screen.getByText(/We never store .* — please remove it\. It was not saved\./)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Headline"), { target: { value: "Staff engineer" } }); // something else changes, so a save happens
    await flush(1500);
    expect(saved().summary).toBe("Builds things."); // not the number
    expect(saved().headline).toBe("Staff engineer");
  });
});
