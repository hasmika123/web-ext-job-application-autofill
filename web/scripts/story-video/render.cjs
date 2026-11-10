#!/usr/bin/env node
// Turns a recorded story (Playwright video.webm + the narration log) into a narrated H.264/AAC MP4.
//
//   node scripts/story-video/render.cjs --log <narration.json> --out <file.mp4> [--video <video.webm>] [--srt]
//
// The log is written by e2e/stories/_support/narration.ts when STORY_NARRATION_LOG=<file> is set while the story runs.
// One SAPI clip per caption is placed at its timestamp (sample-accurate mix, no ffmpeg filter graph), then ffmpeg muxes it with the video.
const { spawnSync } = require("node:child_process");
const { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } = require("node:fs");
const { dirname, join, resolve } = require("node:path");
const { ensureWavs, readWav } = require("./tts.cjs");

const FFMPEG = process.env.FFMPEG || "C:/Users/j_kes/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.2-full_build/bin/ffmpeg.exe";
const FFPROBE = FFMPEG.replace(/ffmpeg(\.exe)?$/, "ffprobe$1");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

function newestWebm(dir) {
  const found = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".webm")) found.push({ p, t: statSync(p).mtimeMs, size: statSync(p).size });
    }
  };
  walk(dir);
  found.sort((a, b) => b.size - a.size); // the flow is one page = one video; the biggest is the walkthrough
  return found[0] && found[0].p;
}

const ts = (ms) => {
  const h = String(Math.floor(ms / 3600000)).padStart(2, "0");
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, "0");
  const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, "0");
  return `${h}:${m}:${s},${String(Math.floor(ms % 1000)).padStart(3, "0")}`;
};

function run(bin, args) {
  const r = spawnSync(bin, args, { encoding: "utf8", maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`${bin} failed:\n${(r.stderr || "").slice(-2000)}`);
  return r.stdout;
}

function main() {
  const logFile = resolve(arg("log"));
  const out = resolve(arg("out"));
  const log = JSON.parse(readFileSync(logFile, "utf8"));
  const videoArg = arg("video", "") || newestWebm(log.outputDir) || "";
  const video = videoArg ? resolve(videoArg) : "";
  if (!video || !existsSync(video)) throw new Error(`no video.webm found (looked in ${log.outputDir})`);
  const entries = log.entries;
  const wavs = ensureWavs(entries.map((e) => e.text));
  const first = readWav(wavs[0]);
  const bytes = first.bits / 8;
  const rate = first.rate;
  const clips = wavs.map((w) => {
    const c = readWav(w);
    if (c.rate !== rate || c.channels !== 1 || c.bits !== first.bits) throw new Error("mixed SAPI formats are not supported");
    return c.data;
  });
  const lastEnd = Math.max(...entries.map((e, i) => (e.ms / 1000) * rate + clips[i].length / bytes));
  const total = Math.ceil(lastEnd + rate);
  const mix = new Int32Array(total);
  entries.forEach((e, i) => {
    const start = Math.round((e.ms / 1000) * rate);
    const data = clips[i];
    for (let k = 0; k < data.length / bytes; k++) mix[start + k] += data.readInt16LE(k * 2);
  });
  const pcm = Buffer.alloc(total * 2);
  for (let k = 0; k < total; k++) pcm.writeInt16LE(Math.max(-32768, Math.min(32767, mix[k])), k * 2);
  const hdr = Buffer.alloc(44);
  hdr.write("RIFF", 0); hdr.writeUInt32LE(36 + pcm.length, 4); hdr.write("WAVEfmt ", 8);
  hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(1, 22); hdr.writeUInt32LE(rate, 24);
  hdr.writeUInt32LE(rate * 2, 28); hdr.writeUInt16LE(2, 32); hdr.writeUInt16LE(16, 34); hdr.write("data", 36); hdr.writeUInt32LE(pcm.length, 40);
  mkdirSync(dirname(out), { recursive: true });
  const audio = out.replace(/\.mp4$/i, ".audio.wav");
  writeFileSync(audio, Buffer.concat([hdr, pcm]));

  run(FFMPEG, [
    "-y", "-i", video, "-i", audio,
    "-vf", "fps=25,scale=trunc(iw/2)*2:trunc(ih/2)*2",
    "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k", "-af", "apad", "-shortest", "-movflags", "+faststart", out,
  ]);
  try { require("node:fs").rmSync(audio); } catch { /* keep going */ }

  if (process.argv.includes("--srt")) {
    const srt = entries.map((e, i) => {
      const end = (entries[i + 1] ? Math.min(entries[i + 1].ms, e.ms + 9000) : e.ms + 6000);
      return `${i + 1}\n${ts(e.ms)} --> ${ts(end)}\n${e.text}\n`;
    });
    writeFileSync(out.replace(/\.mp4$/i, ".srt"), srt.join("\n"), "utf8");
  }
  const dur = Number(run(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out]).trim());
  console.log(JSON.stringify({ out, seconds: Math.round(dur), minutes: (dur / 60).toFixed(1), captions: entries.length }));
}

main();
