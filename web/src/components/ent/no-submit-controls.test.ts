// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * X8.9 / E1 (ADR-010): Kiwiply and its marketers never submit an application. The consultant submits on the employer's own site; the tenant UI only
 * records. This scan fails when a component under `src/app/(tenant)` or `src/components/ent` renders a control or copy that offers to submit an
 * application ("Submit application", "Apply now", "Submit to client", ...) or posts to a submit/apply route. Records-only wording stays allowed:
 * "Create draft", "Mark as applied", "Approved to submit" (a status fact), and any sentence that NEGATES it ("never submits", "does not submit").
 */
const SRC = resolve(__dirname, "..", "..");
const ROOTS = [join(SRC, "app", "(tenant)"), join(SRC, "components", "ent")];

/** Phrases that offer to transmit an application. */
export const FORBIDDEN = /\b(submit\s+(the\s+|an\s+|this\s+|your\s+)?application|apply\s+now|submit\s+to\s+(the\s+)?(client|ats|employer|company)|auto[-\s]?(apply|submit)|submit\s+on\s+(their|his|her|the\s+consultant's)\s+behalf)\b/i;
/** A sentence that denies it is fine ("Kiwiply never submits an application"). */
export const NEGATION = /\b(never|not|no|nor|without|cannot|can't|don't|doesn't|won't|neither)\b/i;
/** A route that posts a submission: /submit, /apply, /auto-apply, /transmit as a path segment of a string literal. */
export const FORBIDDEN_ROUTE = /["'`][^"'`\n]*\/(submit|apply|auto-?apply|auto-?submit|transmit)(\/|\?|["'`$])/i;
/** Exact strings reviewed and allowed (records-only wording that merely contains a flagged phrase). */
export const ALLOW_LIST: string[] = [];

function walk(dir: string, out: string[]): string[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of names) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx|ts)$/.test(name) && !/\.test\.(tsx|ts)$/.test(name) && !/\.stories\.tsx$/.test(name)) out.push(full);
  }
  return out;
}

export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

export function offences(source: string): string[] {
  const found: string[] = [];
  for (const line of stripComments(source).split(/\r?\n/)) {
    const text = line.trim();
    if (!text || ALLOW_LIST.some((a) => text.includes(a))) continue;
    if (FORBIDDEN.test(text) && !NEGATION.test(text)) found.push(text);
    else if (FORBIDDEN_ROUTE.test(text)) found.push(text);
  }
  return found;
}

describe("no tenant component offers to submit an application (E1, X8.9)", () => {
  const files = ROOTS.flatMap((r) => walk(r, []));

  it("scans a real set of tenant components", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("finds no control, copy or route that submits or transmits an application", () => {
    const bad: string[] = [];
    for (const f of files) {
      for (const o of offences(readFileSync(f, "utf8"))) bad.push(`${relative(SRC, f)}: ${o}`);
    }
    expect(bad).toEqual([]);
  });

  it("catches the controls it is meant to catch", () => {
    expect(offences(`<Button>Submit application</Button>`)).toHaveLength(1);
    expect(offences(`<a>Apply now</a>`)).toHaveLength(1);
    expect(offences(`<Button label="Submit to client" />`)).toHaveLength(1);
    expect(offences(`label: "Auto-apply for me"`)).toHaveLength(1);
    expect(offences("fetch(`/api/orgs/${id}/mkt/applications/${a}/submit`, { method: 'POST' })")).toHaveLength(1);
    expect(offences(`post("/api/orgs/1/jobs/apply")`)).toHaveLength(1);
  });

  it("lets the records-only wording through", () => {
    expect(offences(`<Button>Create draft</Button>`)).toEqual([]);
    expect(offences(`<p>Kiwiply never submits an application for anyone.</p>`)).toEqual([]);
    expect(offences(`<p>This does not submit the application.</p>`)).toEqual([]);
    expect(offences(`// Submit application is deliberately absent`)).toEqual([]);
    expect(offences(`fetch("/api/orgs/1/mkt/submissions/2/status")`)).toEqual([]);
    expect(offences(`<Badge>Approved to submit</Badge>`)).toEqual([]);
  });
});
