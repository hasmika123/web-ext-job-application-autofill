import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import AiDisclosure from "./AiDisclosure";

afterEach(cleanup);

describe("AiDisclosure", () => {
  it("shows the one-line disclosure and the Made with Kiwiply AI chip, details closed", () => {
    render(<AiDisclosure model="m-1" callId={42} />);
    expect(screen.getByText("AI · review before you use it")).toBeTruthy();
    expect(screen.getByText("Made with Kiwiply AI")).toBeTruthy();
    expect(screen.getByRole("button", { name: /why\?/i }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText(/What was sent/)).toBeNull();
  });

  it("Why? opens what was sent, the model and the call id", () => {
    render(<AiDisclosure model="gemini-flash-lite" callId={4812} />);
    fireEvent.click(screen.getByRole("button", { name: /why\?/i }));
    expect(screen.getByRole("button", { name: /why\?/i }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(/What was sent: your resume text and, if set, the job description/)).toBeTruthy();
    expect(screen.getByText("Model: gemini-flash-lite")).toBeTruthy();
    expect(screen.getByText("Call 4812")).toBeTruthy();
  });

  it("leaves out the model and call lines when unknown, and the chip when switched off", () => {
    render(<AiDisclosure chip={false} sent="one line of your resume" />);
    fireEvent.click(screen.getByRole("button", { name: /why\?/i }));
    expect(screen.getByText(/What was sent: one line of your resume/)).toBeTruthy();
    expect(screen.queryByText(/Model:/)).toBeNull();
    expect(screen.queryByText(/^Call /)).toBeNull();
    expect(screen.queryByText("Made with Kiwiply AI")).toBeNull();
  });
});
