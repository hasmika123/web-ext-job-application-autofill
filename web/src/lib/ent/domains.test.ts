import { describe, expect, it } from "vitest";
import { certSteps, checkText, errorText } from "./domains";

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

  it("A4b: a failed certificate and the main-address refusal are explained", () => {
    expect(say("CERT_FAILED:UNREACHABLE")).toMatch(/couldn't reach the address/);
    expect(say("CERT_FAILED:TLS")).toMatch(/DNS-only/);
    expect(errorText({ status: 409, code: "HOST_NOT_LIVE", message: "x" })).toMatch(/Only a live address with its certificate/);
  });

  it("A4b: the steps of a domain: DNS verified, the certificate, live", () => {
    expect(certSteps({ status: "PENDING", certState: "NONE" }).map((s) => s.state)).toEqual(["now", "todo", "todo"]);
    expect(certSteps({ status: "ACTIVE", certState: "REQUESTED" }).map((s) => [s.label, s.state])).toEqual([
      ["DNS verified", "done"],
      ["Certificate being issued", "now"],
      ["Live", "todo"],
    ]);
    expect(certSteps({ status: "ACTIVE", certState: "ISSUED" }).map((s) => s.state)).toEqual(["done", "done", "done"]);
    expect(certSteps({ status: "ACTIVE", certState: "FAILED" })[1].state).toBe("failed");
  });

  it("explains a refusal", () => {
    expect(errorText({ status: 409, code: "HOSTNAME_TAKEN", message: "x" })).toBe("That domain is already in use.");
    expect(errorText({ status: 429, code: "CHECK_TOO_SOON", message: "x" })).toMatch(/a moment ago/);
    expect(errorText({ status: 422, message: "That domain can't be used: not a valid domain name." })).toMatch(/can't be used/);
  });
});
