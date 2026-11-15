/**
 * Zip a folder with no dependency (Node's zlib: deflateRawSync + crc32). Used to hand an organization its extension package (CUSTOM-DOMAINS-BUILD.md A6):
 * the zip is what the Chrome Web Store's upload expects (manifest.json at the root), and what a pilot unzips and loads unpacked.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { crc32, deflateRawSync } from "node:zlib";

function files(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]))
    .sort();
}

/** Writes `out` with every file under `dir`, paths relative to it (forward slashes), deflated. Returns the number of entries. */
export function zipFolder(dir, out) {
  const local = [];
  const central = [];
  let offset = 0;
  const entries = files(dir);
  for (const f of entries) {
    const name = Buffer.from(relative(dir, f).split(sep).join("/"), "utf8");
    const data = readFileSync(f);
    const packed = deflateRawSync(data);
    const crc = crc32(data) >>> 0;
    const time = statSync(f).mtime;
    const dosTime = ((time.getHours() << 11) | (time.getMinutes() << 5) | Math.floor(time.getSeconds() / 2)) & 0xffff;
    const dosDate = (((time.getFullYear() - 1980) << 9) | ((time.getMonth() + 1) << 5) | time.getDate()) & 0xffff;
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(0x0800, 6); // UTF-8 names
    head.writeUInt16LE(8, 8); // deflate
    head.writeUInt16LE(dosTime, 10);
    head.writeUInt16LE(dosDate, 12);
    head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(packed.length, 18);
    head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(name.length, 26);
    head.writeUInt16LE(0, 28);
    local.push(head, name, packed);
    const dir2 = Buffer.alloc(46);
    dir2.writeUInt32LE(0x02014b50, 0);
    dir2.writeUInt16LE(20, 4);
    dir2.writeUInt16LE(20, 6);
    dir2.writeUInt16LE(0x0800, 8);
    dir2.writeUInt16LE(8, 10);
    dir2.writeUInt16LE(dosTime, 12);
    dir2.writeUInt16LE(dosDate, 14);
    dir2.writeUInt32LE(crc, 16);
    dir2.writeUInt32LE(packed.length, 20);
    dir2.writeUInt32LE(data.length, 24);
    dir2.writeUInt16LE(name.length, 28);
    dir2.writeUInt32LE(offset, 42);
    central.push(dir2, name);
    offset += head.length + name.length + packed.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  writeFileSync(out, Buffer.concat([...local, centralBuf, end]));
  return entries.length;
}
