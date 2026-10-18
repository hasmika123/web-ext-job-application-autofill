import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const serverApiFetch = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>();
vi.mock("@/lib/api", () => ({ serverApiFetch: (path: string, init?: RequestInit) => serverApiFetch(path, init) }));

import { GET as getLineage } from "./[id]/lineage/route";
import { POST as postDetach } from "./[id]/detach/route";
import { POST as postCheckpoint } from "./[id]/doc/checkpoint/route";
import { GET as getVersions } from "./[id]/doc/versions/route";
import { GET as getVersionText } from "./[id]/doc/versions/[n]/text/route";
import { POST as postRestore } from "./[id]/doc/versions/[n]/restore/route";
import { POST as postSync } from "./[id]/doc/sync-master/route";
import { POST as postSyncApply } from "./[id]/doc/sync-master/apply/route";
import { PATCH as patchAccess } from "./[id]/access/[accessId]/route";

const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const post = (body: string) => new Request("http://w/x", { method: "POST", body });

beforeEach(() => serverApiFetch.mockImplementation(async () => json(200, { ok: true })));
afterEach(() => serverApiFetch.mockReset());

describe("resume header BFF routes (R3.10): thin proxies to Spring", () => {
  it("lineage, detach and the version list go to the owner's resume", async () => {
    await getLineage(new Request("http://w/x"), params({ id: "42" }));
    expect(serverApiFetch).toHaveBeenLastCalledWith("/api/profile/resumes/42/lineage", expect.anything());
    await postDetach(post(""), params({ id: "42" }));
    const [path, init] = serverApiFetch.mock.calls.at(-1)!;
    expect(path).toBe("/api/profile/resumes/42/detach");
    expect(init?.method).toBe("POST");
    await getVersions(new Request("http://w/x"), params({ id: "42" }));
    expect(serverApiFetch.mock.calls.at(-1)![0]).toBe("/api/profile/resumes/42/doc/versions");
  });

  it("checkpoint sends {} for an empty body and the name otherwise", async () => {
    await postCheckpoint(post(""), params({ id: "42" }));
    expect(serverApiFetch.mock.calls.at(-1)![0]).toBe("/api/profile/resumes/42/doc/checkpoint");
    expect(serverApiFetch.mock.calls.at(-1)![1]?.body).toBe("{}");
    await postCheckpoint(post('{"name":"Sent"}'), params({ id: "42" }));
    expect(serverApiFetch.mock.calls.at(-1)![1]?.body).toBe('{"name":"Sent"}');
  });

  it("version text is text/plain and restore passes Spring's ETag through", async () => {
    serverApiFetch.mockResolvedValueOnce(new Response("Priya\n", { status: 200, headers: { "content-type": "text/plain;charset=UTF-8" } }));
    const text = await getVersionText(new Request("http://w/x"), params({ id: "42", n: "6" }));
    expect(serverApiFetch.mock.calls.at(-1)![0]).toBe("/api/profile/resumes/42/doc/versions/6/text");
    expect(text.headers.get("content-type")).toContain("text/plain");
    expect(await text.text()).toBe("Priya\n");

    serverApiFetch.mockResolvedValueOnce(json(200, { docVersion: 17 }, { etag: '"17"' }));
    const res = await postRestore(post(""), params({ id: "42", n: "5" }));
    expect(serverApiFetch.mock.calls.at(-1)![0]).toBe("/api/profile/resumes/42/doc/versions/5/restore");
    expect(serverApiFetch.mock.calls.at(-1)![1]?.method).toBe("POST");
    expect(res.headers.get("etag")).toBe('"17"');
  });

  it("sync-master and its apply (which needs a body)", async () => {
    await postSync(post(""), params({ id: "42" }));
    expect(serverApiFetch.mock.calls.at(-1)![0]).toBe("/api/profile/resumes/42/doc/sync-master");
    await postSyncApply(post('{"ids":["c1"]}'), params({ id: "42" }));
    expect(serverApiFetch.mock.calls.at(-1)![0]).toBe("/api/profile/resumes/42/doc/sync-master/apply");
    expect(serverApiFetch.mock.calls.at(-1)![1]?.body).toBe('{"ids":["c1"]}');
    expect((await postSyncApply(post("  "), params({ id: "42" }))).status).toBe(400);
  });

  it("PATCH access switches PDF download on a link", async () => {
    await patchAccess(new Request("http://w/x", { method: "PATCH", body: '{"allowDownload":true}' }), params({ id: "42", accessId: "9" }));
    const [path, init] = serverApiFetch.mock.calls.at(-1)!;
    expect(path).toBe("/api/profile/resumes/42/access/9");
    expect(init?.method).toBe("PATCH");
    expect(init?.body).toBe('{"allowDownload":true}');
    expect((await patchAccess(new Request("http://w/x", { method: "PATCH", body: "" }), params({ id: "42", accessId: "9" }))).status).toBe(400);
  });

  it("relays Spring's refusals verbatim", async () => {
    serverApiFetch.mockResolvedValue(json(409, { code: "NOT_TAILORED", title: "Not a tailored resume" }));
    const res = await postDetach(post(""), params({ id: "42" }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("NOT_TAILORED");
  });

  it("rejects ids that are not numbers before calling Spring", async () => {
    for (const bad of ["abc", "1/../2", "1;drop"]) {
      expect((await getLineage(new Request("http://w/x"), params({ id: bad }))).status).toBe(400);
      expect((await postDetach(post(""), params({ id: bad }))).status).toBe(400);
      expect((await getVersions(new Request("http://w/x"), params({ id: bad }))).status).toBe(400);
    }
    expect((await getVersionText(new Request("http://w/x"), params({ id: "42", n: "x" }))).status).toBe(400);
    expect((await postRestore(post(""), params({ id: "42", n: "../1" }))).status).toBe(400);
    expect(serverApiFetch).not.toHaveBeenCalled();
  });
});
