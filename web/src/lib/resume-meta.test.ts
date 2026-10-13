import { afterEach, describe, expect, it, vi } from "vitest";
import { createCheckpoint, createLink, deleteResume, getMeta, getVersionText, patchMeta, restoreVersion, revokeAccess, setLinkDownload, syncMaster, versionLabel } from "./resume-meta";

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
vi.stubGlobal("fetch", (url: string, init?: RequestInit) => fetchMock(url, init));
afterEach(() => fetchMock.mockReset());

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("resume-meta client", () => {
  it("reads the metadata and PATCHes a change with a JSON body", async () => {
    fetchMock.mockResolvedValue(json(200, { id: 42, name: "A" }));
    expect(await getMeta(42)).toEqual({ kind: "ok", value: { id: 42, name: "A" } });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/resumes/42/meta");
    await patchMeta(42, { primary: true });
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("/api/resumes/42/meta");
    expect(init?.method).toBe("PATCH");
    expect(init?.body).toBe('{"primary":true}');
  });

  it("turns Spring's refusals into a sentence and keeps the code", async () => {
    fetchMock.mockResolvedValue(json(409, { code: "PRIMARY_REQUIRED", detail: "Pick another resume as primary instead", title: "Conflict" }));
    expect(await patchMeta(42, { archived: true })).toEqual({ kind: "error", status: 409, code: "PRIMARY_REQUIRED", message: "Pick another resume as primary instead" });
    fetchMock.mockResolvedValue(json(409, { error: "This resume is used by a tracked application. Archive it instead." }));
    expect(await deleteResume(42)).toMatchObject({ kind: "error", status: 409, message: "This resume is used by a tracked application. Archive it instead." });
    fetchMock.mockResolvedValue(json(500, {}));
    expect(await getMeta(42)).toMatchObject({ kind: "error", message: "Couldn't load this resume's details." });
    fetchMock.mockResolvedValue(json(401, {}));
    expect(await getMeta(42)).toMatchObject({ kind: "error", status: 401, message: "Your session expired. Sign in again." });
  });

  it("never throws: a network failure is an error result", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    expect(await getMeta(42)).toEqual({ kind: "error", status: 0, message: "Couldn't reach the server." });
    expect(await syncMaster(42)).toMatchObject({ kind: "error", status: 0 });
  });

  it("restore returns the document with the version from the ETag", async () => {
    fetchMock.mockResolvedValue(json(200, { resumeId: 42, docVersion: 3 }, { etag: '"17"' }));
    expect(await restoreVersion(42, 5)).toEqual({ kind: "ok", value: { resumeId: 42, docVersion: 17 } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/resumes/42/doc/versions/5/restore");
    expect(init?.method).toBe("POST");
  });

  it("a checkpoint sends the name only when there is one; a version's text is plain text", async () => {
    fetchMock.mockResolvedValue(json(200, { versionNo: 8, reason: "NAMED", pdf: null }));
    await createCheckpoint(42, "Sent to Acme");
    expect(fetchMock.mock.calls[0][1]?.body).toBe('{"name":"Sent to Acme"}');
    await createCheckpoint(42);
    expect(fetchMock.mock.calls[1][1]?.body).toBe("{}");
    fetchMock.mockResolvedValue(new Response("Priya\n", { status: 200, headers: { "content-type": "text/plain" } }));
    expect(await getVersionText(42, 6)).toEqual({ kind: "ok", value: "Priya\n" });
    expect(fetchMock.mock.calls[2][0]).toBe("/api/resumes/42/doc/versions/6/text");
  });

  it("links: create, switch PDF download, revoke", async () => {
    fetchMock.mockResolvedValue(json(201, { id: 9 }));
    await createLink(42);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/resumes/42/access/link");
    expect(fetchMock.mock.calls[0][1]?.body).toBe("{}");
    fetchMock.mockResolvedValue(json(200, { id: 9, allowDownload: true }));
    await setLinkDownload(42, 9, true);
    expect(fetchMock.mock.calls[1][0]).toBe("/api/resumes/42/access/9");
    expect(fetchMock.mock.calls[1][1]?.method).toBe("PATCH");
    expect(fetchMock.mock.calls[1][1]?.body).toBe('{"allowDownload":true}');
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    expect(await revokeAccess(42, 9)).toEqual({ kind: "ok", value: null });
    expect(fetchMock.mock.calls[2][1]?.method).toBe("DELETE");
  });

  it("names a version by its name, else by what wrote it", () => {
    expect(versionLabel({ name: "Sent to Acme", reason: "NAMED" })).toBe("Sent to Acme");
    expect(versionLabel({ name: null, reason: "AUTOSAVE" })).toBe("Auto-save");
    expect(versionLabel({ name: "  ", reason: "TEMPLATE_SWITCH" })).toBe("Template switch");
    expect(versionLabel({ name: null, reason: "RESTORE" })).toBe("Restored");
    expect(versionLabel({ name: null, reason: "SOMETHING_NEW" })).toBe("Version");
  });
});
