import { describe, expect, it } from "vitest";
import { fixtureDoc, fixtureText } from "./test-fixtures";
import { canonicalJson, contentHash, writeJson } from "./json";
import { toStructuredJson, toStructuredPretty } from "./project";
import { renderText } from "./text";
import { upgradeDocument } from "./upgrade";

describe("upgradeDocument (v1 -> v2)", () => {
  it("upgrading the v1 golden gives the v1-upgraded golden byte for byte (canonical JSON)", () => {
    const upgraded = upgradeDocument(fixtureDoc("full"));
    expect(upgraded.schema).toBe(2);
    expect(upgraded.basics).not.toHaveProperty("photoKey");
    expect(canonicalJson(upgraded)).toBe(canonicalJson(fixtureDoc("full-v1-upgraded")));
  });

  it("v1-equivalent content projects and renders identically after the upgrade", () => {
    for (const name of ["full", "sparse"] as const) {
      const v1 = fixtureDoc(name);
      const v2 = upgradeDocument(v1);
      expect(toStructuredPretty(v2)).toBe(fixtureText(`${name}.structured.json`));
      expect(toStructuredJson(v2)).toBe(toStructuredJson(v1));
      expect(renderText(v2)).toBe(fixtureText(`${name}.txt`));
    }
  });

  it("the upgraded content hash is the hash of the v1-upgraded golden", async () => {
    expect(await contentHash(upgradeDocument(fixtureDoc("full")))).toBe(await contentHash(fixtureDoc("full-v1-upgraded")));
  });

  it("turns photoKey into photo at the same position", () => {
    const v1 = { schema: 1, meta: { title: "T" }, basics: { name: "N", photoKey: "resume-photos/1/a.jpg", email: "e" }, sections: [] };
    expect(writeJson(upgradeDocument(v1))).toBe(
      '{"schema":2,"meta":{"title":"T"},"basics":{"name":"N","photo":{"key":"resume-photos/1/a.jpg"},"email":"e"},"sections":[]}',
    );
  });

  it.each([[null], [""], ["   "], [7], [{ key: "x" }]])("drops a null, blank or non-string photoKey (%j)", (photoKey) => {
    const v2 = upgradeDocument({ schema: 1, basics: { name: "N", photoKey }, sections: [] });
    expect(v2.basics).toEqual({ name: "N" });
  });

  it("an existing photo wins over a leftover photoKey", () => {
    const v2 = upgradeDocument({ schema: 1, basics: { photoKey: "a", photo: { key: "b" } } });
    expect(v2.basics).toEqual({ photo: { key: "b" } });
  });

  it("does not mutate its input and is idempotent", () => {
    const v1 = fixtureDoc("full");
    const before = JSON.stringify(v1);
    const once = upgradeDocument(v1);
    expect(JSON.stringify(v1)).toBe(before);
    expect(upgradeDocument(once)).toEqual(once);
    expect(once).not.toBe(v1);
  });

  it("passes v2 documents and unrecognised input through unchanged", () => {
    const v2 = fixtureDoc("full-v2");
    expect(upgradeDocument(v2)).toEqual(v2);
    const future = { schema: 3, basics: { photoKey: "k" } };
    expect(upgradeDocument(future)).toEqual(future);
    const unversioned = { basics: { photoKey: "k" } };
    expect(upgradeDocument(unversioned)).toEqual(unversioned);
    expect(upgradeDocument([1])).toEqual([1]);
    expect(upgradeDocument(null)).toBeNull();
  });

  it("keeps unknown keys", () => {
    const v2 = upgradeDocument({ schema: 1, future: { x: 1 }, basics: { photoKey: null, nickname: "Pri" }, sections: [] }) as unknown as {
      future: { x: number };
      basics: { nickname: string };
    };
    expect(v2.future.x).toBe(1);
    expect(v2.basics.nickname).toBe("Pri");
  });
});
