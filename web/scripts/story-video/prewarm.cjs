#!/usr/bin/env node
// Generate the speech for every literal caption found in the given video specs, in parallel, before recording.
//   STORY_TTS=edge STORY_TTS_CACHE=<dir> node scripts/story-video/prewarm.cjs e2e/videos/03-org-admin.video.ts [...]
// Captions built from variables (template strings) are not found here; the recorder generates those on the fly.
const { readFileSync } = require("node:fs");
const { ensureWavsAsync, PROVIDER, VOICE } = require("./tts.cjs");

const texts = new Set();
for (const file of process.argv.slice(2)) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(/"((?:[^"\\\n]|\\.)+)"/g)) {
    const t = m[1].split('\\"').join('"');
    if (t.length >= 25 && t.split(" ").length >= 5 && /[.!?]$/.test(t) && !t.includes("${")) texts.add(t);
  }
}
(async () => {
  const list = [...texts];
  console.log(`${PROVIDER} ${VOICE}: ${list.length} captions`);
  await ensureWavsAsync(list, 6);
  console.log("done");
})().catch((e) => { console.error(e); process.exit(1); });
