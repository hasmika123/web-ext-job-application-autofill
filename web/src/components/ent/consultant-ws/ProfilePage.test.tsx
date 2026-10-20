// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/w/consultant/profile" }));

import ConsultantProfilePage from "./ProfilePage";

type W = Record<string, unknown>;

const fixture = (over: W = {}): W => ({
  orgId: 4,
  me: { consultantId: 9, name: "Anika Rao", jobTitle: "Senior Java Developer", yearsExperience: 8, location: "San Jose, CA", workMode: null },
  availability: { status: "AVAILABLE", since: "2026-10-01", availableFrom: null },
  strength: { percent: 78, missing: [{ key: "goals", label: "Set your career goals", section: "goals" }, { key: "employment", label: "Specify preferred employment type", section: "employment" }] },
  summary: { text: "Results-driven developer.", source: "RESUME", hasResume: true },
  skills: [{ id: 1, skill: "Java", primary: true }, { id: 2, skill: "Spring Boot", primary: true }],
  certifications: [{ id: 7, name: "AWS Certified Solutions Architect", issuer: "Amazon Web Services", issuedOn: "2023-03-01" }],
  experience: { resumeName: "Main", items: [{ id: 5, title: "Senior Java Developer", employer: "TechCorp Inc.", startYear: 2021, endYear: null }] },
  preferences: { roles: [{ id: 11, value: "Backend Developer" }], locations: [{ id: 12, value: "Remote" }], employmentTypes: ["CONTRACT"] },
  workAuthorization: "AUTHORIZED_NO_SPONSORSHIP",
  careerGoals: null,
  ...over,
});

const emptyFixture = (): W =>
  fixture({
    strength: { percent: 0, missing: ["summary", "skills", "certifications", "experience", "roles", "locations", "employment", "authorization", "goals"].map((k) => ({ key: k, label: `Missing ${k}`, section: k })) },
    summary: { text: null, source: "NONE", hasResume: false },
    skills: [],
    certifications: [],
    experience: { resumeName: null, items: [] },
    preferences: { roles: [], locations: [], employmentTypes: [] },
    workAuthorization: null,
  });

type Call = { method: string; url: string; body: unknown };
let calls: Call[];
let handler: (c: Call) => { status: number; body: unknown };

beforeEach(() => {
  calls = [];
  handler = () => ({ status: 200, body: fixture() });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const c = { method: init.method ?? "GET", url, body: init.body ? JSON.parse(String(init.body)) : undefined };
      calls.push(c);
      const r = handler(c);
      return new Response(JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json" } });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const mount = async () => {
  render(<ConsultantProfilePage orgId={4} firstName="Anika Rao" />);
  await screen.findByRole("heading", { name: "Anika Rao" });
};
const card = (key: string) => document.querySelector(`[data-home-card="profile-${key}"]`) as HTMLElement;
const writes = () => calls.filter((c) => c.method !== "GET");

describe("My Profile from real data", () => {
  it("asks the BFF once and draws the consultant's own profile", async () => {
    await mount();
    expect(calls).toEqual([{ method: "GET", url: "/api/orgs/4/me-workspace/profile", body: undefined }]);
    const top = document.querySelector("[data-profile-top]") as HTMLElement;
    expect(within(top).getByText("Senior Java Developer")).toBeTruthy();
    expect(within(top).getByText("Consultant")).toBeTruthy();
    expect(within(top).getByText("8+ years")).toBeTruthy();
    expect(within(top).getByText("San Jose, CA")).toBeTruthy();
    expect((document.querySelector("[data-avatar]") as HTMLElement).textContent).toBe("AR");
    expect(top.querySelector("img")).toBeNull(); // we store no photos
    expect(screen.getByText("Profile 78% complete: set your career goals")).toBeTruthy();
    expect(within(card("summary")).getByText("Results-driven developer.")).toBeTruthy();
    expect(within(card("skills")).getByText("Spring Boot")).toBeTruthy();
    expect(within(card("certifications")).getByText("AWS Certified Solutions Architect")).toBeTruthy();
    expect(within(card("certifications")).getByText("Mar 2023")).toBeTruthy();
    expect(within(card("experience")).getByText("TechCorp Inc.")).toBeTruthy();
    expect(within(card("experience")).getByText("2021 – Present")).toBeTruthy();
    expect(within(card("authorization")).getByText("Authorized to work in the United States")).toBeTruthy();
    expect(within(card("authorization")).getByText("No sponsorship required")).toBeTruthy();
    expect((within(card("employment")).getByLabelText("Contract") as HTMLInputElement).checked).toBe(true);
    expect((within(card("employment")).getByLabelText("Full Time") as HTMLInputElement).checked).toBe(false);
    expect(within(card("goals")).getByText(/Not set yet/)).toBeTruthy();
    expect(screen.queryByText(/sample/i)).toBeNull();
  });

  it("has one Edit profile button, no strength ring, missing-details card, Quick Actions or help card", async () => {
    await mount();
    const top = document.querySelector("[data-profile-top]") as HTMLElement;
    expect(within(top).getAllByRole("button").filter((b) => !b.getAttribute("aria-label") && b.textContent === "Edit profile")).toHaveLength(1);
    for (const name of ["Update Skills", "Update skills", "Add Certification", "Save Preferences"]) expect(within(top).queryByRole("button", { name })).toBeNull();
    expect(screen.queryByRole("img", { name: /Profile strength/ })).toBeNull();
    expect(document.querySelector("[data-missing]")).toBeNull();
    expect(screen.queryByText(/Quick Actions/)).toBeNull();
    expect(screen.queryByText(/Ask a question|Get Profile Tips/)).toBeNull();
    expect(screen.getByRole("link", { name: /Edit work experience in My Resumes/ })).toBeTruthy();
  });

  it("says Profile complete when nothing is missing", async () => {
    handler = () => ({ status: 200, body: fixture({ strength: { percent: 100, missing: [] } }) });
    await mount();
    expect(screen.getByText("Profile complete")).toBeTruthy();
  });

  it("says plainly what is empty and invents nothing", async () => {
    handler = () => ({ status: 200, body: emptyFixture() });
    await mount();
    expect(within(card("summary")).getByText(/No summary yet/)).toBeTruthy();
    expect(within(card("skills")).getByText(/No skills yet/)).toBeTruthy();
    expect(within(card("certifications")).getByText(/No certifications yet/)).toBeTruthy();
    expect(within(card("experience")).getByText(/No work experience on your resume yet/)).toBeTruthy();
    expect(within(card("roles")).getByText("No preferred roles yet.")).toBeTruthy();
    expect(within(card("locations")).getByText("No preferred locations yet.")).toBeTruthy();
    expect(within(card("authorization")).getByText(/Not set yet/)).toBeTruthy();
    expect(screen.getByText("Profile 0% complete: missing summary")).toBeTruthy();
  });

  it("shows nothing for another role and a retry when the call fails", async () => {
    handler = () => ({ status: 404, body: { code: "NOT_FOUND" } });
    render(<ConsultantProfilePage orgId={4} firstName="A" />);
    expect(await screen.findByText("This page isn't part of your role")).toBeTruthy();
    cleanup();
    handler = () => ({ status: 500, body: {} });
    render(<ConsultantProfilePage orgId={4} firstName="A" />);
    expect(await screen.findByText(/didn't load/)).toBeTruthy();
  });
});

describe("inline writes", () => {
  it("changes availability from the top pill and shows the fresh view", async () => {
    await mount();
    handler = (c) => (c.method === "PUT" ? { status: 200, body: fixture({ availability: { status: "NOTICE", since: "2026-10-13", availableFrom: null } }) } : { status: 200, body: fixture() });
    fireEvent.click(screen.getByRole("button", { name: "Availability" }));
    fireEvent.click(await screen.findByRole("option", { name: "On notice" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({ method: "PUT", url: "/api/orgs/4/me-workspace/profile/availability", body: { status: "NOTICE" } });
    await waitFor(() => expect(within(card("availability")).getByText("On notice", { selector: "p" })).toBeTruthy());
    expect(screen.getByRole("status").textContent).toBe("Availability updated");
  });

  it("adds a skill, refuses an empty one before calling, and removes a skill in edit mode", async () => {
    await mount();
    fireEvent.click(within(card("skills")).getByRole("button", { name: "Add skills" }));
    fireEvent.click(within(card("skills")).getByRole("button", { name: "Add" }));
    expect(writes()).toHaveLength(0);
    expect(within(card("skills")).getByRole("alert").textContent).toBe("Enter a value.");

    handler = (c) => (c.method === "POST" ? { status: 200, body: fixture({ skills: [{ id: 1, skill: "Java", primary: true }, { id: 2, skill: "Spring Boot", primary: true }, { id: 3, skill: "Docker", primary: true }] }) } : { status: 200, body: fixture() });
    fireEvent.change(within(card("skills")).getByLabelText("Skill"), { target: { value: "  Docker " } });
    fireEvent.click(within(card("skills")).getByRole("button", { name: "Add" }));
    await waitFor(() => expect(within(card("skills")).getByText("Docker")).toBeTruthy());
    expect(writes()[0]).toEqual({ method: "POST", url: "/api/orgs/4/me-workspace/profile/skills", body: { skill: "Docker" } });

    handler = (c) => (c.method === "DELETE" ? { status: 200, body: fixture({ skills: [{ id: 2, skill: "Spring Boot", primary: true }] }) } : { status: 200, body: fixture() });
    fireEvent.click(within(card("skills")).getByRole("button", { name: "Edit skills" }));
    fireEvent.click(within(card("skills")).getByRole("button", { name: "Remove Java" }));
    await waitFor(() => expect(within(card("skills")).queryByText("Java")).toBeNull());
    expect(writes()[1]).toEqual({ method: "DELETE", url: "/api/orgs/4/me-workspace/profile/skills/1", body: undefined });
  });

  it("shows the API's refusal when sensitive data is typed and keeps what is on screen", async () => {
    await mount();
    handler = () => ({ status: 422, body: { error: "We never store a Social Security or tax identification number - please remove it (summary)", code: "SENSITIVE_CONTENT" } });
    fireEvent.click(within(card("summary")).getByRole("button", { name: "Edit professional summary" }));
    fireEvent.change(within(card("summary")).getByLabelText("Professional summary"), { target: { value: "My SSN is 123-45-6789" } });
    fireEvent.click(within(card("summary")).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(within(card("summary")).getByRole("alert").textContent).toMatch(/We never store a Social Security/));
    expect(within(card("summary")).getByLabelText("Professional summary")).toBeTruthy(); // still editing
    expect(screen.getByText(/Please don't include ID numbers/)).toBeTruthy();
  });

  it("saves the summary and closes the editor", async () => {
    await mount();
    handler = (c) => (c.method === "PUT" ? { status: 200, body: fixture({ summary: { text: "New words.", source: "RESUME", hasResume: true } }) } : { status: 200, body: fixture() });
    fireEvent.click(within(card("summary")).getByRole("button", { name: "Edit professional summary" }));
    fireEvent.change(within(card("summary")).getByLabelText("Professional summary"), { target: { value: " New words. " } });
    fireEvent.click(within(card("summary")).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(within(card("summary")).getByText("New words.")).toBeTruthy());
    expect(writes()[0]).toEqual({ method: "PUT", url: "/api/orgs/4/me-workspace/profile/summary", body: { text: "New words." } });
  });

  it("adds a certification with a month and refuses a future month before calling", async () => {
    await mount();
    fireEvent.click(within(card("certifications")).getByRole("button", { name: "Add certification" }));
    fireEvent.change(screen.getByLabelText("Certification name"), { target: { value: "CKA" } });
    fireEvent.change(screen.getByLabelText("Month issued (optional)"), { target: { value: "2999-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Add certification" }));
    expect(writes()).toHaveLength(0);
    expect(screen.getByRole("alert").textContent).toMatch(/passed/);

    handler = (c) => (c.method === "POST" ? { status: 200, body: fixture() } : { status: 200, body: fixture() });
    fireEvent.change(screen.getByLabelText("Month issued (optional)"), { target: { value: "2024-05" } });
    fireEvent.change(screen.getByLabelText("Issued by (optional)"), { target: { value: "CNCF" } });
    fireEvent.click(screen.getByRole("button", { name: "Add certification" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0].body).toEqual({ name: "CKA", issuer: "CNCF", issuedOn: "2024-05" });
  });

  it("removes a certification only in edit mode", async () => {
    await mount();
    expect(within(card("certifications")).queryByRole("button", { name: /^Remove/ })).toBeNull();
    handler = (c) => (c.method === "DELETE" ? { status: 200, body: fixture({ certifications: [] }) } : { status: 200, body: fixture() });
    fireEvent.click(within(card("certifications")).getByRole("button", { name: "Edit certifications" }));
    fireEvent.click(within(card("certifications")).getByRole("button", { name: "Remove AWS Certified Solutions Architect" }));
    await waitFor(() => expect(within(card("certifications")).getByText(/No certifications yet/)).toBeTruthy());
    expect(writes()[0].url).toBe("/api/orgs/4/me-workspace/profile/certifications/7");
  });

  it("sends the full employment-type set when a box is ticked, and the work-authorization choice", async () => {
    await mount();
    handler = () => ({ status: 200, body: fixture() });
    fireEvent.click(within(card("employment")).getByLabelText("Full Time"));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({ method: "PUT", url: "/api/orgs/4/me-workspace/profile/employment-types", body: { values: ["CONTRACT", "FULL_TIME"] } });

    fireEvent.click(within(card("authorization")).getByRole("button", { name: "Edit work authorization" }));
    fireEvent.click(within(card("authorization")).getByLabelText(/Not currently authorized/));
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(writes()[1]).toEqual({ method: "PUT", url: "/api/orgs/4/me-workspace/profile/work-authorization", body: { value: "NOT_AUTHORIZED" } });
    expect(within(card("authorization")).queryByRole("textbox")).toBeNull(); // a choice, never free text
  });

  it("adds a preferred role and says so when the save fails", async () => {
    await mount();
    handler = () => ({ status: 500, body: {} });
    fireEvent.click(within(card("roles")).getByRole("button", { name: "Add role" }));
    fireEvent.change(within(card("roles")).getByLabelText("Role"), { target: { value: "Architect" } });
    fireEvent.click(within(card("roles")).getByRole("button", { name: "Add" }));
    await waitFor(() => expect(within(card("roles")).getByRole("alert").textContent).toMatch(/Nothing changed/));
    expect(writes()[0]).toEqual({ method: "POST", url: "/api/orgs/4/me-workspace/profile/prefs", body: { kind: "ROLE", value: "Architect" } });
    expect(within(card("roles")).queryByText("Architect")).toBeNull();
  });
});

describe("navigation inside the page", () => {
  it("opens the summary editor from the header's Edit profile button", async () => {
    await mount();
    fireEvent.click(within(document.querySelector("[data-profile-top]") as HTMLElement).getByRole("button", { name: "Edit profile" }));
    expect(within(card("summary")).getByLabelText("Professional summary")).toBeTruthy();
  });
});
