import { describe, expect, it } from "vitest";
import { acceptLabel, inboxEndpoints, interviewLine, parseConsultantInbox, parseInbox, safeMeetingLink, stageTone } from "./inbox";

const inbox = (o: Record<string, unknown> = {}) => ({
  entitled: true,
  available: true,
  connected: true,
  address: "anika@gmail.com",
  status: "CONNECTED",
  connectedAt: "2026-10-14T10:00:00Z",
  lastCheckedAt: null,
  lastError: null,
  stoppedNote: null,
  messages: 3,
  notifyEmail: true,
  sandbox: false,
  sandboxAddress: null,
  ...o,
});

describe("parseConsultantInbox", () => {
  it("rejects a body that is not the contract", () => {
    expect(parseConsultantInbox(null)).toBeNull();
    expect(parseConsultantInbox({})).toBeNull();
    expect(parseConsultantInbox({ inbox: { connected: "yes" } })).toBeNull();
  });

  it("reads the connection, the suggestions and the updates, and drops rows that are not the contract", () => {
    const v = parseConsultantInbox({
      inbox: inbox(),
      suggestions: [{ id: 5, company: "Lumen Health", role: "Data Engineer", category: "APPLIED", stage: "APPLIED", subject: "s", fromName: "n", fromAddress: "a@b.example", sentAt: "2026-10-13T10:00:00Z" }, { company: "no id" }, 3],
      updates: [{ applicationId: 9, company: "Orbit Freight", role: "Platform Engineer", stage: "INTERVIEW", stageLabel: "Interview", reading: "Interview invite", at: "2026-10-13T10:00:00Z", source: "INBOX" }, { nope: 1 }],
    })!;
    expect(v.entitled).toBe(true);
    expect(v.inbox.address).toBe("anika@gmail.com");
    expect(v.suggestions).toHaveLength(1);
    expect(v.suggestions[0].company).toBe("Lumen Health");
    expect(v.updates).toHaveLength(1);
    expect(v.updates[0].source).toBe("INBOX");
  });

  it("an unknown status is no status, and the body has no field for a password", () => {
    expect(parseInbox(inbox({ status: "WEIRD" }))!.status).toBeNull();
    expect(parseInbox(inbox({ status: "NO_ENTITLEMENT", stoppedNote: "Your organization no longer includes inbox tracking." }))).toMatchObject({
      status: "NO_ENTITLEMENT",
      stoppedNote: "Your organization no longer includes inbox tracking.",
    });
    const parsed = JSON.stringify(parseInbox(inbox({ appPassword: "abcdefghijklmnop", passwordEnc: "v1:x" })));
    expect(parsed).not.toContain("abcdefghijklmnop");
    expect(parsed).not.toContain("v1:");
  });

  it("not entitled and not connected is a page, not an error", () => {
    const v = parseConsultantInbox({ inbox: inbox({ entitled: false, connected: false, address: null, status: null }), suggestions: [], updates: [] })!;
    expect(v.entitled).toBe(false);
    expect(v.inbox.connected).toBe(false);
  });
});

describe("helpers", () => {
  it("names what accepting does", () => {
    expect(acceptLabel("INTERVIEW")).toBe("Add to my board as Interview");
    expect(acceptLabel("APPLIED")).toBe("Add to my board as Applied");
    expect(acceptLabel("SAVED")).toBe("Add to my board");
  });

  it("the routes are the tenant-bound ones and take the organization from the page", () => {
    expect(inboxEndpoints(7)).toEqual({ connect: "/api/orgs/7/me-workspace/inbox", notify: "/api/orgs/7/me-workspace/inbox/notify" });
  });

  it("tones", () => {
    expect(stageTone("INTERVIEW")).toBe("amber");
    expect(stageTone("OFFER")).toBe("green");
    expect(stageTone("REJECTED")).toBe("red");
    expect(stageTone("???")).toBe("slate");
  });
});

describe("update interview and undo", () => {
  const row = (o: Record<string, unknown>) => ({ applicationId: 9, company: "Orbit Freight", role: "Platform Engineer", stage: "INTERVIEW", stageLabel: "Interview", reading: null, at: "2026-10-13T10:00:00Z", source: "INBOX", ...o });
  const read = (o: Record<string, unknown>) => parseConsultantInbox({ inbox: inbox(), suggestions: [], updates: [row(o)] })!.updates[0];

  it("reads the interview and the undo, and is null for both when the server sends none", () => {
    const u = read({ interview: { id: 3, startsAt: "2026-10-27T21:00:00Z", tz: "America/Los_Angeles", kind: "PHONE", link: "https://meet.example.com/x", location: "Room 4", cancelled: false }, undo: { eventId: "55", undoable: true } });
    expect(u.interview).toMatchObject({ id: 3, kind: "PHONE", link: "https://meet.example.com/x", location: "Room 4", cancelled: false });
    expect(u.undo).toEqual({ eventId: "55", undoable: true });
    const none = read({});
    expect(none.interview).toBeNull();
    expect(none.undo).toBeNull();
    expect(read({ interview: { startsAt: "not a date" }, undo: { undoable: true } })).toMatchObject({ interview: null, undo: null });
  });

  it("keeps only an https meeting link that is not a Kiwiply address", () => {
    expect(safeMeetingLink("https://zoom.example.com/j/1")).toBe("https://zoom.example.com/j/1");
    for (const bad of ["http://zoom.example.com/j/1", "javascript:alert(1)", "/relative", "https://kiwiply.com/x", "https://app.kiwiply.com/x", null, 5]) expect(safeMeetingLink(bad)).toBeNull();
  });

  it("writes the time in the interview's own zone with the short zone name", () => {
    expect(interviewLine({ startsAt: "2026-10-27T21:00:00Z", tz: "America/Los_Angeles", kind: "PHONE" })).toBe("Interview Tue Oct 27, 2:00 PM PDT · Phone");
    expect(interviewLine({ startsAt: "2026-10-27T21:00:00Z", tz: "America/New_York", kind: "VIDEO" })).toBe("Interview Tue Oct 27, 5:00 PM EDT · Video");
    expect(interviewLine({ startsAt: "2026-10-27T21:00:00Z", tz: "Not/AZone", kind: "ONSITE" })).toMatch(/^Interview \w{3} Oct 2[78], .* · On-site$/);
  });
});
