import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPhotoBlob, photoErrorMessage, photoUrl, removePhoto, uploadPhoto } from "./resume-photo";

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
vi.stubGlobal("fetch", (url: string, init?: RequestInit) => fetchMock(url, init));
afterEach(() => fetchMock.mockReset());

const saved = (version: number) => new Response(JSON.stringify({ docVersion: version, doc: { basics: { photo: { key: "k" } } } }), { status: 200, headers: { etag: `"${version}"`, "content-type": "application/json" } });
const problem = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("uploadPhoto / removePhoto", () => {
  it("posts the picture as multipart `file` and reads the version from the ETag", async () => {
    fetchMock.mockResolvedValue(saved(9));
    const r = await uploadPhoto(42, new Blob(["x"], { type: "image/png" }));
    expect(r).toMatchObject({ kind: "ok", version: 9 });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/resumes/42/photo");
    expect(init?.method).toBe("POST");
    const form = init?.body as FormData;
    expect((form.get("file") as File).name).toBe("photo.png");
    expect(init?.headers).toBeUndefined(); // the browser sets the multipart boundary
  });

  it("deletes through DELETE and adopts the answer", async () => {
    fetchMock.mockResolvedValue(saved(10));
    expect(await removePhoto(42)).toMatchObject({ kind: "ok", version: 10 });
    expect(fetchMock.mock.calls[0]![1]?.method).toBe("DELETE");
  });

  it("maps each coded refusal to words a person can act on", async () => {
    const cases: Array<[number, Record<string, unknown>, RegExp]> = [
      [413, { code: "PHOTO_TOO_LARGE", maxBytes: 5242880 }, /too large \(the limit is 5 MB\)/],
      [413, { code: "PHOTO_TOO_LARGE", maxBytes: 1048576 }, /limit is 1 MB/],
      [415, { code: "PHOTO_FORMAT" }, /JPEG, PNG or WebP/],
      [403, { code: "FEATURE_DISABLED" }, /switched off/],
      [429, { code: "RATE_LIMITED" }, /Too many uploads/],
      [422, { code: "PHOTO_INVALID", message: "The picture is too small (at least 64 px on the short side)." }, /too small/],
      [404, { title: "No" }, /no longer there/],
      [401, {}, /session expired/],
      [500, {}, /Couldn't save the photo/],
    ];
    for (const [status, body, expected] of cases) {
      fetchMock.mockResolvedValueOnce(problem(status, body));
      const r = await uploadPhoto(1, new Blob(["x"]));
      expect(r.kind, JSON.stringify(body)).toBe("error");
      if (r.kind === "error") {
        expect(r.status).toBe(status);
        expect(r.message).toMatch(expected);
      }
    }
  });

  it("an unreachable server and an answer without a version are errors, never throws", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await uploadPhoto(1, new Blob(["x"]))).toMatchObject({ kind: "error", status: 0, message: "Couldn't reach the server." });
    fetchMock.mockResolvedValueOnce(new Response("not json", { status: 200 }));
    expect(await removePhoto(1)).toMatchObject({ kind: "error" });
  });
});

describe("fetchPhotoBlob / photoUrl / photoErrorMessage", () => {
  it("returns the bytes, or null when they cannot be read", async () => {
    fetchMock.mockResolvedValueOnce(new Response("img", { status: 200 }));
    expect(await (await fetchPhotoBlob(3))!.text()).toBe("img");
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect(await fetchPhotoBlob(3)).toBeNull();
    fetchMock.mockRejectedValueOnce(new Error("x"));
    expect(await fetchPhotoBlob(3)).toBeNull();
  });

  it("the address changes with the photo's version so a replaced picture is not served from cache", () => {
    expect(photoUrl(3)).toBe("/api/resumes/3/photo");
    expect(photoUrl(3, "2026-10-17T10:00:00Z")).toBe("/api/resumes/3/photo?v=2026-10-17T10%3A00%3A00Z");
  });

  it("falls back to the server's own message", () => {
    expect(photoErrorMessage(500, { error: "Upstream broke" })).toBe("Upstream broke");
    expect(photoErrorMessage(500, null)).toBe("Couldn't save the photo.");
  });
});
