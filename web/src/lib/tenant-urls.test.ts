import { describe, expect, it } from "vitest";
import { loginRedirectPath, safeReturnTo, tenantOrigin, tenantUrl } from "./tenant-urls";

describe("safeReturnTo (X2.10): same-host paths only", () => {
  it.each([
    ["/w/admin", "/w/admin"],
    ["/w/admin?tab=2&x=%20y", "/w/admin?tab=2&x=%20y"],
    ["/w/admin#frag", "/w/admin"],
    ["/me", "/me"],
    ["/", "/"],
  ])("accepts %s", (raw, expected) => expect(safeReturnTo(raw)).toBe(expected));

  it.each([
    ["scheme-relative", "//evil.com"],
    ["absolute", "https://evil.com/x"],
    ["backslash", "/\\evil.com"],
    ["backslash mid", "/a\\b"],
    ["no leading slash", "evil.com"],
    ["javascript", "javascript:alert(1)"],
    ["tab trick", "/\t/evil.com"],
    ["newline trick", "/\n/evil.com"],
    ["space", "/a b"],
    ["encoded double slash", "/%2F/evil.com"],
    ["encoded backslash", "/%5Cevil.com"],
    ["encoded scheme", "/%68ttps://evil.com"],
    ["bad encoding", "/%E0%A4%A"],
    ["internal tree", "/_t/login"],
    ["internal tree root", "/_t"],
    ["the BFF", "/api/auth/logout"],
    ["login loop", "/login"],
    ["login loop with next", "/login?next=/x"],
    ["forgot password", "/forgot-password"],
    ["empty", ""],
    ["too long", "/" + "a".repeat(3000)],
  ])("refuses %s", (_name, raw) => expect(safeReturnTo(raw)).toBeNull());

  it("refuses non-strings", () => {
    expect(safeReturnTo(undefined)).toBeNull();
    expect(safeReturnTo(null)).toBeNull();
    expect(safeReturnTo(["/a", "/b"])).toBeNull();
  });
});

describe("loginRedirectPath", () => {
  it("carries a safe path and search as next", () => {
    expect(loginRedirectPath("/w/admin", "?tab=1")).toBe("/login?next=%2Fw%2Fadmin%3Ftab%3D1");
  });
  it("the root has no next", () => expect(loginRedirectPath("/")).toBe("/login"));
  it("an unsafe path has no next", () => {
    expect(loginRedirectPath("//evil.com")).toBe("/login");
    expect(loginRedirectPath("/login")).toBe("/login");
  });
});

describe("tenantOrigin / tenantUrl", () => {
  it("https for real hosts, http for localhost names", () => {
    expect(tenantOrigin("careers.acme.com")).toBe("https://careers.acme.com");
    expect(tenantOrigin("Acme.Localhost")).toBe("http://acme.localhost");
  });
  it("refuses anything that is not a plain hostname", () => {
    for (const bad of ["", "acme.com/evil", "acme.com@evil.com", "a b.com", "acme.com:8080", "-x.com", "x..com"]) expect(tenantOrigin(bad)).toBe("");
  });
  it("joins a host and a safe path, never an unsafe one", () => {
    expect(tenantUrl("acme.kiwiply.com", "/w/admin")).toBe("https://acme.kiwiply.com/w/admin");
    expect(tenantUrl("acme.kiwiply.com", "//evil.com")).toBe("");
    expect(tenantUrl("evil.com/x", "/w")).toBe("");
  });
});
