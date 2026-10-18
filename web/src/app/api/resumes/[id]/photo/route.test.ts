// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const serverApiFetch = vi.fn<(path: string, init?: RequestInit & { duplex?: string }) => Promise<Response>>();
vi.mock("@/lib/api", () => ({ serverApiFetch: (path: string, init?: RequestInit) => serverApiFetch(path, init) }));
vi.mock("@/lib/demo-server", () => ({ demoReadOnly: async () => null }));
const limit = vi.hoisted(() => ({ ok: true }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: () => (limit.ok ? { ok: true, retryAfter: 0 } : { ok: false, retryAfter: 9 }) }));
// A 4 KB cap instead of 10 MB, so the over-the-cap tests need not build megabytes.
vi.mock("@/lib/photo-upload", async (orig) => ({ ...(await orig<typeof import("@/lib/photo-upload")>()), PHOTO_REQUEST_CAP_BYTES: 4096 }));

import { DELETE, GET, POST } from "./route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const url = "http://web.test/api/resumes/42/photo";

/** What the API would answer to a stored photo: the saved document and its ETag. */
const saved = () => new Response('{"docVersion":9}', { status: 200, headers: { etag: '"9"', "content-type": "application/json" } });

const upload = (bytes: Uint8Array, name = "me.png") => {
  const form = new FormData();
  form.set("file", new Blob([bytes as BlobPart], { type: "image/png" }), name);
  return new Request(url, { method: "POST", body: form });
};

/** Reads whatever body the route handed to the API, as the real fetch would. */
async function drain(body: unknown): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const reader = (body as ReadableStream<Uint8Array>).getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

beforeEach(() => {
  limit.ok = true;
});
afterEach(() => serverApiFetch.mockReset());

describe("POST /api/resumes/:id/photo", () => {
  it("streams the multipart body upstream with its boundary, and relays the saved document and ETag", async () => {
    let sent: Uint8Array = new Uint8Array();
    serverApiFetch.mockImplementation(async (_p, init) => {
      sent = await drain(init!.body);
      return saved();
    });
    const bytes = new Uint8Array(1500).fill(7);
    const res = await POST(upload(bytes), ctx("42"));

    expect(res.status).toBe(200);
    expect(res.headers.get("etag")).toBe('"9"');
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ docVersion: 9 });
    const [path, init] = serverApiFetch.mock.calls[0]!;
    expect(path).toBe("/api/profile/resumes/42/photo");
    expect(init?.method).toBe("POST");
    expect(init?.duplex).toBe("half"); // a streamed request body
    expect(new Headers(init?.headers).get("content-type")).toMatch(/^multipart\/form-data; boundary=/);
    expect(init?.body).toBeInstanceOf(ReadableStream); // never buffered into a string or FormData here
    expect(Buffer.from(sent).includes(Buffer.from(bytes))).toBe(true); // the picture got through
  });

  it("relays the API's coded refusals verbatim (415 / 413 / 422 / 403)", async () => {
    for (const [status, code] of [
      [415, "PHOTO_FORMAT"],
      [413, "PHOTO_TOO_LARGE"],
      [422, "PHOTO_INVALID"],
      [403, "FEATURE_DISABLED"],
    ] as const) {
      serverApiFetch.mockImplementation(async (_p, init) => {
        await drain(init!.body);
        return new Response(JSON.stringify({ code }), { status, headers: { "content-type": "application/json" } });
      });
      const res = await POST(upload(new Uint8Array(100)), ctx("42"));
      expect(res.status).toBe(status);
      expect(await res.json()).toMatchObject({ code });
    }
  });

  it("refuses a declared Content-Length over the cap before anything is sent", async () => {
    const req = new Request(url, {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=xyz", "content-length": "999999" },
      body: new Blob([new Uint8Array(10)]),
    });
    const res = await POST(req, ctx("42"));
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ code: "PHOTO_TOO_LARGE" });
    expect(serverApiFetch).not.toHaveBeenCalled();
  });

  it("cuts off a stream that grows past the cap (no Content-Length to go by) and answers 413", async () => {
    serverApiFetch.mockImplementation(async (_p, init) => {
      await drain(init!.body); // the capped stream errors while the API is still reading
      return saved();
    });
    const form = new FormData();
    form.set("file", new Blob([new Uint8Array(9000)], { type: "image/png" }), "big.png");
    const asResponse = new Response(form);
    const type = asResponse.headers.get("content-type")!;
    const bytes = Buffer.from(await asResponse.arrayBuffer());
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < bytes.length; i += 1000) c.enqueue(new Uint8Array(bytes.subarray(i, i + 1000)));
        c.close();
      },
    });
    const req = new Request(url, { method: "POST", headers: { "content-type": type }, body: stream, duplex: "half" } as RequestInit & { duplex: string });
    const res = await POST(req, ctx("42"));
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ code: "PHOTO_TOO_LARGE" });
  });

  it("is a 415 for anything but a multipart upload, a 400 for a bad id, a 429 when over the rate limit", async () => {
    const json = new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect((await POST(json, ctx("42"))).status).toBe(415);
    expect((await POST(upload(new Uint8Array(10)), ctx("abc"))).status).toBe(400);
    limit.ok = false;
    const limited = await POST(upload(new Uint8Array(10)), ctx("42"));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("9");
    expect(serverApiFetch).not.toHaveBeenCalled();
  });
});

describe("GET /api/resumes/:id/photo", () => {
  it("proxies the picture with its ETag and private cache header", async () => {
    serverApiFetch.mockResolvedValue(
      new Response(new Uint8Array([0xff, 0xd8]), {
        status: 200,
        headers: { "content-type": "image/jpeg", etag: '"resume-photos/3/42-a-photo.jpg"', "cache-control": "private, max-age=300" },
      }),
    );
    const res = await GET(new Request(url, { headers: { "if-none-match": '"old"' } }), ctx("42"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("etag")).toBe('"resume-photos/3/42-a-photo.jpg"');
    expect(res.headers.get("cache-control")).toBe("private, max-age=300");
    expect(serverApiFetch.mock.calls[0]![0]).toBe("/api/profile/resumes/42/photo");
    expect(new Headers(serverApiFetch.mock.calls[0]![1]?.headers).get("if-none-match")).toBe('"old"');
  });

  it("passes a 304 through without a body, and a 404 / 502 as a bare status", async () => {
    serverApiFetch.mockResolvedValueOnce(new Response(null, { status: 304, headers: { etag: '"k"' } }));
    const notModified = await GET(new Request(url), ctx("42"));
    expect(notModified.status).toBe(304);
    expect(notModified.body).toBeNull();

    serverApiFetch.mockResolvedValueOnce(new Response("nope", { status: 404 }));
    expect((await GET(new Request(url), ctx("42"))).status).toBe(404);

    serverApiFetch.mockRejectedValueOnce(new Error("down"));
    expect((await GET(new Request(url), ctx("42"))).status).toBe(502);
    expect((await GET(new Request(url), ctx("x1"))).status).toBe(400);
  });
});

describe("DELETE /api/resumes/:id/photo", () => {
  it("forwards the delete and relays the saved document", async () => {
    serverApiFetch.mockResolvedValue(saved());
    const res = await DELETE(new Request(url, { method: "DELETE" }), ctx("42"));
    expect(res.status).toBe(200);
    expect(res.headers.get("etag")).toBe('"9"');
    const [path, init] = serverApiFetch.mock.calls[0]!;
    expect(path).toBe("/api/profile/resumes/42/photo");
    expect(init?.method).toBe("DELETE");
  });

  it("refuses a bad id and relays the API's generic 404", async () => {
    expect((await DELETE(new Request(url, { method: "DELETE" }), ctx("../1"))).status).toBe(400);
    serverApiFetch.mockResolvedValue(new Response('{"title":"x"}', { status: 404, headers: { "content-type": "application/json" } }));
    expect((await DELETE(new Request(url, { method: "DELETE" }), ctx("42"))).status).toBe(404);
  });
});
