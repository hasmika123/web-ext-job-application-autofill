import { describe, expect, it } from "vitest";
import { actionLabel, humanize, ORG_TYPES, typeLabel } from "./admin-orgs";

describe("admin-orgs helpers", () => {
  it("humanizes enum values", () => {
    expect(humanize("PENDING_SETUP_FEE")).toBe("Pending setup fee");
    expect(humanize("ACTIVE")).toBe("Active");
    expect(typeLabel("PROFESSIONAL_SERVICES")).toBe("Professional services");
    expect(typeLabel("UNKNOWN_KIND")).toBe("Unknown kind");
  });
  it("never offers the reserved COACH type", () => {
    expect(ORG_TYPES.map((t) => t.value)).not.toContain("COACH");
  });
  it("labels the admin audit actions", () => {
    expect(actionLabel("ADMIN_SUBDOMAIN_PROVISION")).toBe("Subdomain provisioned");
    expect(actionLabel("ADMIN_SOMETHING_NEW")).toBe("Admin something new");
  });
});
