import { describe, expect, it } from "vitest";
import { safeHttpsUrl } from "./jobSource";

describe("safeHttpsUrl", () => {
  it("keeps a plain https link with a real host", () => {
    expect(safeHttpsUrl("https://boards.greenhouse.io/acme/jobs/1")).toBe("https://boards.greenhouse.io/acme/jobs/1");
  });

  it("drops http, credentials, bare hosts and junk", () => {
    for (const bad of ["http://jobs.lever.co/a/1", "https://u:p@jobs.lever.co/a", "https://intranet/a", "https://.example.com/", "javascript:alert(1)", "", 5, null, "https://x.example y"]) {
      expect(safeHttpsUrl(bad)).toBeNull();
    }
  });

  it("keeps a local stand-in page (plain http on a named *.localhost host) and nothing else on http", () => {
    expect(safeHttpsUrl("http://jobs.localhost:3399/greenhouse/acme/1?t=Platform%20Engineer")).toBe("http://jobs.localhost:3399/greenhouse/acme/1?t=Platform%20Engineer");
    expect(safeHttpsUrl("http://localhost:3399/a")).toBeNull();
    expect(safeHttpsUrl("http://u:p@jobs.localhost:3399/a")).toBeNull();
    expect(safeHttpsUrl("http://jobs.localhost.evil.test/a")).toBeNull();
  });
});
