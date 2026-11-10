import { describe, expect, it } from "vitest";
import { DEMO_LOGINS, isDemoLogin, tenantDemoLoginUrl } from "./demo";

describe("demo logins", () => {
  it("the personal site opens the job seeker and the app admin, never an organization account", () => {
    expect([...DEMO_LOGINS]).toEqual(["demo", "demo-admin"]);
  });

  it("still treats a session on the retired demo-org account as a demo session", () => {
    expect(isDemoLogin("demo-org")).toBe(true);
    expect(isDemoLogin(" Demo ")).toBe(true);
    expect(isDemoLogin("jane")).toBe(false);
    expect(isDemoLogin(null)).toBe(false);
  });
});

describe("tenantDemoLoginUrl", () => {
  it("keeps the visitor's port between loopback hosts", () => {
    expect(tenantDemoLoginUrl({ host: "acme.localhost", name: "Acme" }, { hostname: "localhost", port: "3304" })).toBe("http://acme.localhost:3304/login");
  });

  it("uses the host the API names, https and no port, anywhere else", () => {
    expect(tenantDemoLoginUrl({ host: "acme.example.org", name: "Acme" }, { hostname: "app.example.org", port: "" })).toBe("https://acme.example.org/login");
    expect(tenantDemoLoginUrl({ host: "acme.example.org", name: "Acme" }, { hostname: "localhost", port: "3304" })).toBe("https://acme.example.org/login");
  });

  it("refuses a host that is not a plain hostname", () => {
    expect(tenantDemoLoginUrl({ host: "evil.com/x", name: "x" }, { hostname: "localhost", port: "3304" })).toBe("");
  });
});
