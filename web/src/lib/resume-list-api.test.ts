import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attachOriginal, deleteResume, duplicateResume, importUploaded, patchResumeMeta } from "./resume-list-api";

const fetchMock = vi.fn();
const reply = (status: number, body: unknown = {}) => fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("duplicateResume", () => {
  it("returns the new resume's id", async () => {
    reply(201, { resume: { id: 12 }, doc: { resumeId: 12 } });
    expect(await duplicateResume(3)).toEqual({ kind: "ok", id: 12 });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/resumes/3/doc/duplicate");
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
  });
  it("maps 402 to the plan's cap, 404 and a network failure to errors", async () => {
    reply(402, { plan: "FREE", detail: "Free accounts keep up to 3 resumes." });
    expect(await duplicateResume(3)).toEqual({ kind: "limit", plan: "FREE", message: "Free accounts keep up to 3 resumes." });
    reply(404);
    expect((await duplicateResume(3)).kind).toBe("error");
    fetchMock.mockRejectedValueOnce(new Error("down"));
    expect(await duplicateResume(3)).toEqual({ kind: "error", message: "Couldn't reach the server." });
  });
});

describe("importUploaded", () => {
  it("is ok on 200, and ok when it was already built", async () => {
    reply(200, {});
    expect(await importUploaded(5)).toEqual({ kind: "ok" });
    reply(409, { code: "ALREADY_BUILT" });
    expect(await importUploaded(5)).toEqual({ kind: "ok" });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/resumes/5/doc/import");
  });
  it("reports anything else", async () => {
    reply(500, { error: "boom" });
    expect(await importUploaded(5)).toEqual({ kind: "error", code: undefined, message: "boom" });
  });
});

describe("patchResumeMeta", () => {
  it("PATCHes the metadata endpoint with the change", async () => {
    reply(200, {});
    expect(await patchResumeMeta(8, { name: "New name" })).toEqual({ kind: "ok" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/resumes/8/meta");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ name: "New name" });
  });
  it("passes the API's reason and code through", async () => {
    reply(409, { code: "PRIMARY_REQUIRED", message: "make another one primary first" });
    expect(await patchResumeMeta(8, { archived: true })).toEqual({ kind: "error", code: "PRIMARY_REQUIRED", message: "make another one primary first" });
  });
});

describe("deleteResume", () => {
  it("DELETEs the resume", async () => {
    reply(200, { ok: true });
    expect(await deleteResume(4)).toEqual({ kind: "ok" });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/resumes/4");
    expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
  });
  it("marks a resume used by an application", async () => {
    reply(409, { error: "archive it instead" });
    expect(await deleteResume(4)).toEqual({ kind: "error", code: "IN_USE", message: "archive it instead" });
  });
});

describe("attachOriginal", () => {
  it("posts the file as multipart", async () => {
    reply(200, { ok: true });
    const f = new File(["x"], "cv.pdf", { type: "application/pdf" });
    expect(await attachOriginal(6, f)).toEqual({ kind: "ok" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/resumes/6/file");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("file")).toBeInstanceOf(File);
  });
  it("says why when it fails", async () => {
    reply(502, { error: "Couldn't attach the file." });
    expect(await attachOriginal(6, new File(["x"], "cv.pdf"))).toEqual({ kind: "error", message: "Couldn't attach the file." });
  });
});
