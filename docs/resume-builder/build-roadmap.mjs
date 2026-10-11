#!/usr/bin/env node
// Regenerates roadmap.html from stories.json (plain Node, no dependencies).
//   node docs/resume-builder/build-roadmap.mjs                      regenerate only
//   node docs/resume-builder/build-roadmap.mjs --set R0.1=done      change a status, then regenerate
//   node docs/resume-builder/build-roadmap.mjs --set R0.1=done,R0.2=in_progress
//   node docs/resume-builder/build-roadmap.mjs --list               print id, status, size, title
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const jsonPath = path.join(dir, 'stories.json');
const tplPath = path.join(dir, 'roadmap.template.html');
const outPath = path.join(dir, 'roadmap.html');
const STATUSES = ['not_started', 'in_progress', 'in_review', 'done', 'blocked'];

const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const args = process.argv.slice(2);
const sets = [];
let list = false;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--set') sets.push(...String(args[++i] ?? '').split(',').filter(Boolean));
  else if (a.startsWith('--set=')) sets.push(...a.slice(6).split(',').filter(Boolean));
  else if (a === '--list') list = true;
  else if (a === '-h' || a === '--help') {
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 6).join('\n'));
    process.exit(0);
  } else {
    console.error(`Unknown argument: ${a}`);
    process.exit(2);
  }
}

if (list) {
  for (const s of data.stories) console.log(`${s.id.padEnd(6)} ${s.status.padEnd(12)} ${s.size}  ${s.title}`);
  process.exit(0);
}

let changed = false;
for (const kv of sets) {
  const [id, st] = kv.split('=');
  const story = data.stories.find((s) => s.id === id);
  if (!story) {
    console.error(`No such story: ${id}`);
    process.exit(2);
  }
  if (!STATUSES.includes(st)) {
    console.error(`Bad status "${st}" for ${id}. Use one of: ${STATUSES.join(', ')}`);
    process.exit(2);
  }
  if (story.status !== st) {
    story.status = st;
    changed = true;
  }
  console.log(`${id} -> ${st}`);
}
if (changed) {
  data.updated = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2) + '\n');
}

// Validate: statuses known, dependencies point at real stories or epics.
const ids = new Set(data.stories.map((s) => s.id));
const epics = new Set(data.epics.map((e) => e.id));
for (const s of data.stories) {
  if (!STATUSES.includes(s.status)) throw new Error(`${s.id}: bad status ${s.status}`);
  for (const d of s.deps) if (!ids.has(d) && !epics.has(d)) throw new Error(`${s.id}: unknown dependency ${d}`);
}

// Embed as JSON inside <script type="application/json">: escape "<" (no </script>) and the JS line separators.
const BS = String.fromCharCode(92);
const swap = (s, ch, rep) => s.split(ch).join(rep);
let json = JSON.stringify(data);
json = swap(json, '<', BS + 'u003c');
json = swap(json, String.fromCharCode(0x2028), BS + 'u2028');
json = swap(json, String.fromCharCode(0x2029), BS + 'u2029');

const tpl = fs.readFileSync(tplPath, 'utf8');
const stamp = new Date().toISOString().slice(0, 10);
const html = tpl.replace('__DATA__', () => json).replace('__GENERATED__', () => stamp);
fs.writeFileSync(outPath, html);
const done = data.stories.filter((s) => s.status === 'done').length;
console.log(`roadmap.html written (${data.stories.length} stories, ${done} done).`);
