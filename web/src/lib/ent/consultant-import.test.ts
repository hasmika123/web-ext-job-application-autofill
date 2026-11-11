import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_ROWS, TEMPLATE, applyImport, checkImport, parseCheck, parseCsv, readImport } from "./consultant-import";

afterEach(() => vi.unstubAllGlobals());

/** ONBOARDING-BUILD.md A3: the browser reads the CSV; the API checks and imports. */
describe("reading a consultants CSV", () => {
  it("reads quoted cells, commas and line breaks inside quotes, escaped quotes, CRLF and a BOM", () => {
    const rows = parseCsv('﻿name,note\r\n"Rao, Anika","said ""hi""\nthere"\r\n\r\nBen,plain\n');
    expect(rows).toEqual([["name", "note"], ["Rao, Anika", 'said "hi"\nthere'], ["Ben", "plain"]]);
  });

  it("matches columns by name in any order and splits skills on ; or |", () => {
    const r = readImport("E-mail,Full Name,Skills,Years of Experience,Dept,Favourite colour\na@x.test,Ana Abe,Java; Spring | AWS,6,Engineering,blue\n", true);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows[0]).toMatchObject({ name: "Ana Abe", email: "a@x.test", skills: ["Java", "Spring", "AWS"], years: "6", department: "Engineering", invite: true });
    expect(r.unknownColumns).toEqual(["Favourite colour"]);
  });

  it("the template reads back as one consultant", () => {
    const r = readImport(TEMPLATE, false);
    expect(r.ok && r.rows).toHaveLength(1);
    expect(r.ok && r.rows[0].location).toBe("Austin, TX");
  });

  it("says plainly what is wrong with the file", () => {
    expect(readImport("name\nAna", true)).toMatchObject({ ok: false });
    expect(readImport("only,a,header\n", true)).toMatchObject({ ok: false });
    const big = "name,email\n" + Array.from({ length: MAX_ROWS + 1 }, (_, i) => `R${i},r${i}@x.test`).join("\n");
    expect(readImport(big, true)).toMatchObject({ ok: false });
  });

  it("parses the verdicts and calls the routes, Apply with its Idempotency-Key", async () => {
    expect(parseCheck({ total: 2, ready: 1, rows: [{ row: 1, email: "a@x.test", status: "READY", invite: "WILL_INVITE" }, { row: 2, status: "WEIRD" }] })!.rows[1].status).toBe("INVALID");
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(JSON.stringify(url.endsWith("/check") ? { total: 1, ready: 1, rows: [] } : { added: 1, invited: 1, skipped: 0, rows: [] }), { status: 200 });
      }),
    );
    const row = { name: "Ana", email: "a@x.test", jobTitle: "", location: "", workMode: "", years: "", skills: [], department: "", invite: true };
    expect((await checkImport(2, [row])).ok).toBe(true);
    const applied = await applyImport(2, [row], "k-123");
    expect(applied.ok && applied.value.added).toBe(1);
    expect(calls[0].url).toBe("/api/orgs/2/consultants/import/check");
    expect(calls[1].url).toBe("/api/orgs/2/consultants/import");
    expect((calls[1].init.headers as Record<string, string>)["Idempotency-Key"]).toBe("k-123");
  });
});
