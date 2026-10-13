import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  dayText,
  DEFAULT_QUERY,
  errorSentence,
  hasFilters,
  listParams,
  nextSort,
  pageCount,
  parseUrl,
  showingText,
  siteHref,
  siteText,
  sinceText,
  sizeLabel,
  tabParams,
  tileDelta,
  tileInitials,
  tileTone,
  urlParams,
  type ClientQuery,
} from "./clients";

const q = (over: Partial<ClientQuery> = {}): ClientQuery => ({ ...DEFAULT_QUERY, sort: { ...DEFAULT_QUERY.sort }, ...over });

describe("tileDelta", () => {
  it("writes the percent the board does, or the plain difference when the previous figure was zero", () => {
    expect(tileDelta({ previous: 77, delta: 9, deltaPercent: 11.7 }, "percent")).toEqual({ dir: "up", text: "+11.7%" });
    expect(tileDelta({ previous: 4, delta: 2, deltaPercent: 50 }, "percent")).toEqual({ dir: "up", text: "+50%" });
    expect(tileDelta({ previous: 0, delta: 6, deltaPercent: null }, "percent")).toEqual({ dir: "up", text: "+6" });
  });
  it("draws nothing without history", () => {
    expect(tileDelta({ previous: null, delta: null, deltaPercent: null }, "percent")).toBeNull();
    expect(tileDelta(null, "percent")).toBeNull();
  });
});

describe("the query and the address", () => {
  it("sends only what is set, and a search of at least two characters", () => {
    expect(listParams(q({ q: "t" })).has("q")).toBe(false);
    const p = listParams(q({ q: " tech ", industry: "Technology", health: "AT_RISK", managerId: "7", sort: { key: "name", dir: "asc" }, page: 2, size: 25 }));
    expect(p.get("q")).toBe("tech");
    expect(p.get("industry")).toBe("Technology");
    expect(p.get("health")).toBe("AT_RISK");
    expect(p.get("managerId")).toBe("7");
    expect(p.get("sort")).toBe("name");
    expect(p.get("dir")).toBe("asc");
    expect(p.get("page")).toBe("2");
    expect(p.get("size")).toBe("25");
    expect(listParams(q()).get("sort")).toBe("activity");
  });

  it("the tabs ask only for the search and the page", () => {
    const p = tabParams(q({ q: "pat", industry: "Retail", page: 1 }));
    expect([...p.keys()].sort()).toEqual(["page", "q", "size"]);
  });

  it("round-trips through the address, writing only what differs from the default", () => {
    expect(urlParams(q(), null, "overview").toString()).toBe("");
    const query = q({ tab: "contacts", q: "pat", health: "HEALTHY", sort: { key: "health", dir: "asc" }, page: 2, size: 25, view: "grid" });
    const text = urlParams(query, 12, "requirements").toString();
    expect(text).toContain("tab=contacts");
    expect(text).toContain("page=3");
    expect(text).toContain("client=12");
    expect(text).toContain("dtab=requirements");
    const back = parseUrl(new URLSearchParams(text));
    expect(back.query).toEqual(query);
    expect(back.openId).toBe(12);
    expect(back.dtab).toBe("requirements");
  });

  it("falls back to the default on junk in the address", () => {
    const u = parseUrl(new URLSearchParams("tab=zzz&sort=weird,up&page=-4&size=999&client=abc&dtab=x&view=cube"));
    expect(u.query).toEqual(q());
    expect(u.openId).toBeNull();
    expect(u.dtab).toBe("overview");
  });

  it("knows when filters are on", () => {
    expect(hasFilters(q())).toBe(false);
    expect(hasFilters(q({ q: "t" }))).toBe(false);
    expect(hasFilters(q({ q: "te" }))).toBe(true);
    expect(activeFilterCount(q({ status: "ACTIVE", sizeBand: "51-200" }))).toBe(2);
  });

  it("sorts names A to Z first and figures biggest first, flipping on a second click", () => {
    expect(nextSort({ key: "activity", dir: "desc" }, "name")).toEqual({ key: "name", dir: "asc" });
    expect(nextSort({ key: "name", dir: "asc" }, "name")).toEqual({ key: "name", dir: "desc" });
    expect(nextSort({ key: "name", dir: "asc" }, "requirements")).toEqual({ key: "requirements", dir: "desc" });
  });
});

describe("the words", () => {
  it("counts pages and writes the footer like the board", () => {
    expect(pageCount(86, 10)).toBe(9);
    expect(pageCount(0, 10)).toBe(1);
    expect(showingText(86, 0, 10, 10)).toBe("1-10 of 86 clients");
    expect(showingText(1, 0, 10, 1)).toBe("1-1 of 1 client");
    expect(showingText(0, 0, 10, 0)).toBe("0 clients");
    expect(showingText(12, 1, 10, 2, "contact")).toBe("11-12 of 12 contacts");
  });

  it("formats dates and the site like the drawer", () => {
    expect(dayText("2024-04-18T10:00:00Z")).toBe("Apr 18, 2024");
    expect(dayText("2024-04-18")).toBe("Apr 18, 2024");
    expect(dayText(null)).toBe("");
    expect(sinceText("2022-01-15")).toBe("Client since Jan 2022");
    expect(sinceText(null)).toBe("");
    expect(sizeLabel("1000-5000")).toBe("1,000 - 5,000 employees");
    expect(siteText("https://www.techcorp.com/")).toBe("www.techcorp.com");
    expect(siteHref("https://www.techcorp.com")).toBe("https://www.techcorp.com");
    expect(siteHref("javascript:alert(1)")).toBeNull();
  });

  it("makes the company tile from the name, one colour per name", () => {
    expect(tileInitials("TechCorp Inc.")).toBe("T");
    expect(tileInitials("Global Finance Co.")).toBe("GF");
    expect(tileInitials("Retail Solutions")).toBe("R");
    expect(tileInitials("Ledger & Co.")).toBe("L");
    expect(tileInitials("Retail")).toBe("R");
    expect(tileInitials("  ")).toBe("?");
    expect(tileTone("TechCorp Inc.")).toBe(tileTone("TechCorp Inc."));
  });

  it("turns an API refusal into a sentence", () => {
    expect(errorSentence({ status: 0, message: "offline" })).toBe("offline");
    expect(errorSentence({ status: 412, message: "x" })).toContain("Someone else changed");
    expect(errorSentence({ status: 404, message: "x" })).toContain("no longer in your view");
    expect(errorSentence({ status: 409, code: "DUPLICATE_CLIENT", message: "x" })).toContain("already have a client");
    expect(errorSentence({ status: 422, code: "WORK_EMAIL_REQUIRED", message: "x" })).toContain("work e-mail");
    expect(errorSentence({ status: 422, message: "Name must be at least 2 characters" })).toBe("Name must be at least 2 characters");
  });
});
