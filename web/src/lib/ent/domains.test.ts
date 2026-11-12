import { describe, expect, it } from "vitest";
import { checkText, errorText } from "./domains";

/** CUSTOM-DOMAINS-BUILD.md (A4): the check results the Domains page explains (10-domain-routing.md s4.4). */
describe("domain check words", () => {
  const say = (code: string | null) => checkText(code, "careers.acme.com", "edge.kiwiply.com", "74.208.212.158");

  it("names what is missing or wrong, with the values to fix", () => {
    expect(say("OK")).toBe("Both DNS records are in place.");
    expect(say("TXT_MISSING")).toMatch(/can't find the ownership record/);
    expect(say("CNAME_MISSING")).toBe("Point careers.acme.com at edge.kiwiply.com with a CNAME record.");
    expect(say("CNAME_WRONG_TARGET:acme.herokudns.com")).toBe("careers.acme.com currently points at acme.herokudns.com. Change it to edge.kiwiply.com.");
    expect(say("A_WRONG_IP:1.2.3.4")).toBe("careers.acme.com points at 1.2.3.4. It needs to point at 74.208.212.158.");
    expect(say("DNS_ERROR:timed out")).toMatch(/couldn't reach your DNS provider/);
    expect(say(null)).toBeNull();
  });

  it("explains a refusal", () => {
    expect(errorText({ status: 409, code: "HOSTNAME_TAKEN", message: "x" })).toBe("That domain is already in use.");
    expect(errorText({ status: 429, code: "CHECK_TOO_SOON", message: "x" })).toMatch(/a moment ago/);
    expect(errorText({ status: 422, message: "That domain can't be used: not a valid domain name." })).toMatch(/can't be used/);
  });
});
