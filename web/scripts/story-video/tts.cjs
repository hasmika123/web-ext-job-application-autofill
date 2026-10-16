// Text-to-speech cache for the narrated story videos. CommonJS on purpose: it is required by the Playwright support code and by render.cjs.
// A caption is spoken by the offline Windows SAPI voice (default) or an edge-tts neural voice (STORY_TTS=edge); its WAV is cached by hash(voice, rate, text) so a re-recording reuses it.
const { execFileSync, spawn } = require("node:child_process");
const { createHash } = require("node:crypto");
const { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } = require("node:fs");
const { join, resolve } = require("node:path");
const os = require("node:os");

// STORY_TTS=sapi (default: offline Windows voice) | edge (Microsoft neural voices through `python -m edge_tts`, needs the network).
// STORY_TTS_VOICE picks the edge voice (default en-US-AvaMultilingualNeural), STORY_TTS_RATE its speed (default -5%).
const PROVIDER = (process.env.STORY_TTS || "sapi").toLowerCase();
const EDGE = PROVIDER === "edge";
const VOICE = EDGE ? process.env.STORY_TTS_VOICE || "en-US-AvaMultilingualNeural" : process.env.STORY_VOICE || "Microsoft Zira Desktop";
const RATE = EDGE ? process.env.STORY_TTS_RATE || "-5%" : Number(process.env.STORY_VOICE_RATE ?? 0);
const PYTHON = process.env.STORY_PYTHON || "python";
const FFMPEG = process.env.FFMPEG || "C:/Users/j_kes/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.2-full_build/bin/ffmpeg.exe";
const CACHE = process.env.STORY_TTS_CACHE || join(os.tmpdir(), "kiwiply-story-tts");
const SPEAK = resolve(__dirname, "speak.ps1");

const key = (text) => createHash("sha1").update(`${EDGE ? "edge|" : ""}${VOICE}|${RATE}|${text}`).digest("hex").slice(0, 20);
const wavPath = (text) => join(CACHE, `${key(text)}.wav`);

/** edge-tts: one clip -> mp3 -> 24 kHz mono 16-bit WAV (arguments are passed as an array, so no shell quoting touches the text). */
function edgeClip(text, out, done) {
  const mp3 = out.replace(/\.wav$/, ".mp3");
  const run = (bin, args, next) => {
    const p = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("error", (e) => done(e));
    p.on("close", (code) => (code === 0 ? next() : done(new Error(`${bin} exited ${code}: ${err.slice(-400)}`))));
  };
  run(PYTHON, ["-m", "edge_tts", "--voice", VOICE, `--rate=${RATE}`, "--text", text, "--write-media", mp3], () =>
    run(FFMPEG, ["-y", "-v", "error", "-i", mp3, "-ar", "24000", "-ac", "1", "-sample_fmt", "s16", out], () => {
      rmSync(mp3, { force: true });
      done(null);
    }),
  );
}

/** Synthesise the missing edge clips, `parallel` at a time (with a retry: the service is a network call). */
async function ensureWavsAsync(texts, parallel = 6) {
  mkdirSync(CACHE, { recursive: true });
  if (!EDGE) return ensureWavs(texts);
  const todo = [...new Set(texts)].filter((t) => !existsSync(wavPath(t)));
  let next = 0;
  const one = (t) =>
    new Promise((res, rej) => {
      const attempt = (n) => edgeClip(t, wavPath(t), (e) => (!e ? res() : n < 3 ? setTimeout(() => attempt(n + 1), 1200) : rej(e)));
      attempt(1);
    });
  await Promise.all(Array.from({ length: Math.min(parallel, todo.length) }, async () => {
    while (next < todo.length) await one(todo[next++]);
  }));
  return texts.map(wavPath);
}

/** Synthesise every caption that is not cached yet (sapi: ONE PowerShell process; edge: one clip after the other). Returns the wav paths in input order. */
function ensureWavs(texts) {
  mkdirSync(CACHE, { recursive: true });
  const missing = [...new Set(texts)].filter((t) => !existsSync(wavPath(t)));
  if (missing.length && EDGE) {
    for (const t of missing) {
      let failure = null;
      for (let n = 0; n < 3; n++) {
        let finished = false;
        const out = wavPath(t);
        const mp3 = out.replace(/\.wav$/, ".mp3");
        try {
          execFileSync(PYTHON, ["-m", "edge_tts", "--voice", VOICE, `--rate=${RATE}`, "--text", t, "--write-media", mp3], { stdio: "pipe" });
          execFileSync(FFMPEG, ["-y", "-v", "error", "-i", mp3, "-ar", "24000", "-ac", "1", "-sample_fmt", "s16", out], { stdio: "pipe" });
          rmSync(mp3, { force: true });
          finished = true;
        } catch (e) {
          failure = e;
        }
        if (finished) { failure = null; break; }
      }
      if (failure) throw failure;
    }
  } else if (missing.length) {
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

/** Same as spokenMs but does not block the event loop (the recorder awaits it before it shows a caption that was not pre-generated). */
async function spokenMsAsync(text) {
  const [f] = await ensureWavsAsync([text], 1);
  return wavDurationMs(f);
}

module.exports = { PROVIDER, VOICE, RATE, CACHE, ensureWavs, ensureWavsAsync, spokenMsAsync, wavPath, readWav, wavDurationMs, spokenMs };
