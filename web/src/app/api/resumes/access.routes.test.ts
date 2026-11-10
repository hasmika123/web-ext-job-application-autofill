import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const serverApiFetch = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>();
vi.mock("@/lib/api", () => ({ serverApiFetch: (path: string, init?: RequestInit) => serverApiFetch(path, init) }));

import { GET as getMeta, PATCH as patchMeta } from "./[id]/meta/route";
import { GET as getAccess, POST as postAccess } from "./[id]/access/route";
import { POST as postLink } from "./[id]/access/link/route";
import { DELETE as deleteAccess } from "./[id]/access/[accessId]/route";
import { GET as getViews } from "./[id]/views/route";
import { GET as getShared } from "./shared-with-me/route";
import { GET as getSharedDoc } from "./shared/[id]/doc/route";
import { GET as getSharedPdf } from "./shared/[id]/export/route";

const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const post = (url: string, body: string) => new Request(url, { method: "POST", body });

beforeEach(() => serverApiFetch.mockImplementation(async () => json(200, { ok: true })));
afterEach(() => serverApiFetch.mockReset());

describe("resume access BFF routes (R3.11): thin proxies to Spring", () => {
  it("meta: GET and PATCH go to the owner's meta, PATCH relays the sharing switches untouched", async () => {
    await getMeta(new Request("http://w/x"), params({ id: "42" }));
    expect(serverApiFetch).toHaveBeenLastCalledWith("/api/profile/resumes/42/meta", expect.anything());
    await patchMeta(post("http://w/x", '{"recruiterSharing":true}'), params({ id: "42" }));
    const [path, init] = serverApiFetch.mock.calls.at(-1)!;
    expect(path).toBe("/api/profile/resumes/42/meta");
    expect(init?.method).toBe("PATCH");
    expect(init?.body).toBe('{"recruiterSharing":true}');
    expect((await patchMeta(post("http://w/x", "  "), params({ id: "42" }))).status).toBe(400);
  });

  it("access: list, share with a person, create a link, revoke", async () => {
    await getAccess(new Request("http://w/x"), params({ id: "7" }));
    expect(serverApiFetch).toHaveBeenLastCalledWith("/api/profile/resumes/7/access", expect.anything());
    await postAccess(post("http://w/x", '{"email":"a@b.co"}'), params({ id: "7" }));
    expect(serverApiFetch.mock.calls.at(-1)![0]).toBe("/api/profile/resumes/7/access");
    await postLink(post("http://w/x", ""), params({ id: "7" })); // an empty body is a link with the defaults
    const [linkPath, linkInit] = serverApiFetch.mock.calls.at(-1)!;
    expect(linkPath).toBe("/api/profile/resumes/7/access/link");
    expect(linkInit?.body).toBe("{}");
    await deleteAccess(new Request("http://w/x", { method: "DELETE" }), params({ id: "7", accessId: "9" }));
    const [delPath, delInit] = serverApiFetch.mock.calls.at(-1)!;
    expect(delPath).toBe("/api/profile/resumes/7/access/9");
    expect(delInit?.method).toBe("DELETE");
  });

  it("relays Spring's refusals verbatim (status and body)", async () => {
    serverApiFetch.mockResolvedValue(json(422, { code: "LIMIT", title: "You can share a resume with at most 3 links" }));
    const res = await postLink(post("http://w/x", "{}"), params({ id: "7" }));
    expect(res.status).toBe(422);
    expect(((await res.json()) as { code: string }).code).toBe("LIMIT");
    serverApiFetch.mockResolvedValue(json(404, { title: "Not Found" }));
    expect((await getAccess(new Request("http://w/x"), params({ id: "7" }))).status).toBe(404);
  });

  it("rejects ids that are not numbers before calling Spring", async () => {
    for (const bad of ["abc", "1/../2", "1;drop"]) {
      expect((await getAccess(new Request("http://w/x"), params({ id: bad }))).status).toBe(400);
      expect((await getSharedDoc(new Request("http://w/x"), params({ id: bad }))).status).toBe(400);
    }
    expect((await deleteAccess(new Request("http://w/x"), params({ id: "7", accessId: "x" }))).status).toBe(400);
    expect(serverApiFetch).not.toHaveBeenCalled();
  });

  it("views: forwards a numeric limit only", async () => {
    await getViews(new Request("http://w/x?limit=20"), params({ id: "7" }));
    expect(serverApiFetch.mock.calls.at(-1)![0]).toBe("/api/profile/resumes/7/views?limit=20");
    await getViews(new Request("http://w/x?limit=20;x"), params({ id: "7" }));
    expect(serverApiFetch.mock.calls.at(-1)![0]).toBe("/api/profile/resumes/7/views");
  });

  it("shared with me: the list and the read-only document", async () => {
    await getShared();
    expect(serverApiFetch.mock.calls.at(-1)![0]).toBe("/api/profile/resumes/shared-with-me");
    await getSharedDoc(new Request("http://w/x"), params({ id: "77" }));
    expect(serverApiFetch.mock.calls.at(-1)![0]).toBe("/api/profile/resumes/shared/77/doc");
  });

  it("shared export: PDF bytes pass through, refusals keep their status and body, other formats are 400", async () => {
    serverApiFetch.mockResolvedValue(new Response(new Uint8Array([37, 80, 68, 70]), { status: 200, headers: { "content-type": "application/pdf" } }));
    const ok = await getSharedPdf(new Request("http://w/x?format=pdf"), params({ id: "77" }));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("application/pdf");
    expect(Array.from(new Uint8Array(await ok.arrayBuffer()))).toEqual([37, 80, 68, 70]);

    serverApiFetch.mockResolvedValue(json(409, { code: "PDF_NOT_READY" }));
    const notReady = await getSharedPdf(new Request("http://w/x?format=pdf"), params({ id: "77" }));
    expect(notReady.status).toBe(409);
    expect(((await notReady.json()) as { code: string }).code).toBe("PDF_NOT_READY");

    expect((await getSharedPdf(new Request("http://w/x?format=docx"), params({ id: "77" }))).status).toBe(400);
  });
});
