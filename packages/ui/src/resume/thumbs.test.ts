import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { listTemplates } from "./registry";

const dir = join(dirname(fileURLToPath(import.meta.url)), "thumbs");
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("template thumbnails", () => {
  it("every registered thumb is a 240x340 PNG", () => {
    for (const meta of listTemplates()) {
      const png = readFileSync(join(dir, meta.thumb));
      expect(png.subarray(0, 8).equals(SIGNATURE), `${meta.thumb} signature`).toBe(true);
      expect(png.readUInt32BE(16), `${meta.thumb} width`).toBe(240);
      expect(png.readUInt32BE(20), `${meta.thumb} height`).toBe(340);
    }
  });

  it("no two templates share a thumb file", () => {
    const files = listTemplates().map((m) => m.thumb);
    expect(new Set(files).size).toBe(files.length);
  });
});
