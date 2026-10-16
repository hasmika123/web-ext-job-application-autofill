// Text-to-speech cache for the narrated story videos. CommonJS on purpose: it is required by the Playwright support code and by render.cjs.
// A caption is spoken by the offline Windows SAPI voice; its WAV is cached by hash(voice, rate, text) so a re-recording reuses it.
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } = require("node:fs");
const { join, resolve } = require("node:path");
const os = require("node:os");

const VOICE = process.env.STORY_VOICE || "Microsoft Zira Desktop";
const RATE = Number(process.env.STORY_VOICE_RATE ?? 0);
const CACHE = process.env.STORY_TTS_CACHE || join(os.tmpdir(), "kiwiply-story-tts");
const SPEAK = resolve(__dirname, "speak.ps1");

const key = (text) => createHash("sha1").update(`${VOICE}|${RATE}|${text}`).digest("hex").slice(0, 20);
const wavPath = (text) => join(CACHE, `${key(text)}.wav`);

/** Synthesise every caption that is not cached yet, in ONE PowerShell process. Returns the list of wav paths in input order. */
function ensureWavs(texts) {
  mkdirSync(CACHE, { recursive: true });
  const missing = [...new Set(texts)].filter((t) => !existsSync(wavPath(t)));
  if (missing.length) {
    const jobs = join(CACHE, `jobs-${process.pid}-${Date.now()}.json`);
    writeFileSync(jobs, JSON.stringify(missing.map((t) => ({ text: t, out: wavPath(t) }))), "utf8");
    try {
      execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", SPEAK, "-Jobs", jobs, "-Voice", VOICE, "-Rate", String(RATE)], { stdio: "pipe" });
    } finally {
      rmSync(jobs, { force: true });
    }
  }
  return texts.map(wavPath);
}

/** Read a PCM WAV header: sample rate, channels, bits and the data chunk (offset + length). */
function readWav(file) {
  const b = readFileSync(file);
  let pos = 12;
  let fmt = null;
  while (pos + 8 <= b.length) {
    const id = b.toString("ascii", pos, pos + 4);
    const size = b.readUInt32LE(pos + 4);
    if (id === "fmt ") fmt = { channels: b.readUInt16LE(pos + 10), rate: b.readUInt32LE(pos + 12), bits: b.readUInt16LE(pos + 22) };
    if (id === "data") {
      const len = Math.min(size, b.length - (pos + 8));
      return { ...fmt, data: b.subarray(pos + 8, pos + 8 + len) };
    }
    pos += 8 + size + (size % 2);
  }
  throw new Error(`no data chunk in ${file}`);
}

function wavDurationMs(file) {
  const w = readWav(file);
  return Math.round((w.data.length / (w.rate * w.channels * (w.bits / 8))) * 1000);
}

/** The spoken length of a caption in ms (synthesises it first when it is not cached). */
function spokenMs(text) {
  const [f] = ensureWavs([text]);
  return wavDurationMs(f);
}

module.exports = { VOICE, RATE, CACHE, ensureWavs, wavPath, readWav, wavDurationMs, spokenMs };
