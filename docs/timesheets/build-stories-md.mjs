#!/usr/bin/env node
// Renders docs/TIMESHEETS-STORIES.md from docs/timesheets/stories.json (plain Node, no dependencies).
//   node docs/timesheets/build-stories-md.mjs            regenerate the markdown backlog
//   node docs/timesheets/build-stories-md.mjs --list     print id, status, size, title
// Statuses are changed with the master generator: node docs/roadmap/build-master-roadmap.mjs --set H0.1=done
// (once it lists this file). stories.json is the single source of truth; never edit the markdown by hand.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '..', '..');
const d = JSON.parse(fs.readFileSync(path.join(dir, 'stories.json'), 'utf8'));

if (process.argv.includes('--list')) {
  for (const s of d.stories) console.log(`${s.id.padEnd(6)} ${s.status.padEnd(12)} ${s.size}  ${s.title}`);
  process.exit(0);
}

const SKELETON = ['H0.1', 'H0.2', 'H0.3', 'H0.4', 'H0.5', 'H0.6', 'H0.7'];
const EPIC_HEAD = {
  H0: 'Walking skeleton: pilot gate → placement → one sheet submitted and approved → one CSV → smoke',
  H1: 'Placements, clients & rates',
  H2: 'Weekly entry, phone-first',
  H3: 'Proof & the never-collected gate',
  H4: 'Reminders & notifications',
  H5: 'Exports',
  H6: 'Money records (record only)',
  H7: 'Billing, retention, erasure & admin',
  H8: 'Pilot, onboarding & growth',
};
let out = `# Timesheets & Consultancy Ops — stories

Backlog for \`docs/TIMESHEETS-DESIGN.md\`. Ordered; each story is sized for **one Sonnet agent in one
session** (implement + tests + one commit). Commit message: \`ts<epic>.<n>: <subject>\` (e.g.
\`ts0.1: timesheet skeleton schema\`). Branch \`timesheets\` (off \`version2\`); PR into \`develop\` only when
the user asks. Definition of done per \`CLAUDE.md\` (tests green, PROGRESS.md box + Log line; the extension is
never touched by this product).

**Status source of truth: \`docs/timesheets/stories.json\`** (the master roadmap reads it; this file is
rendered from it by \`docs/timesheets/build-stories-md.mjs\` — edit the JSON, then regenerate, never the other
way round). Product area **H**, every epic **P2** (decision D10): the timesheets-first order lives in the
dependencies below, never in the priority. Org foundation stories (O1.x, O2.x, O6.x, O13.x) stay in
\`docs/roadmap/areas/org.json\` as cross-area deps — **the org model does not exist in the API yet**, so nothing
here can start before O1.1–O1.5, O2.2 and O6.1.

Conventions: **Owner** API (Spring) · web (Next) · ui (\`packages/ui\`). **Size** S ≤ ½ day · M ≈ 1 day ·
L ≈ 2 days (split before starting if it looks bigger). **Tests** name the suites a story must add or extend.
"AC" = acceptance criteria. **Benchmark** = the competitor bar the story meets or beats. Every number is a
setting key + default (DESIGN §11), never a constant.

**★ = the first five stories to build** (H0.1–H0.5). **Walking skeleton = H0.1 → H0.7**: schema → gate →
placement → one weekly sheet submitted and approved → one CSV → smoke script, end to end on a phone, with
no proof, no money and no AI.

---
`;
for (const e of d.epics) {
  const stories = d.stories.filter((s) => s.epic === e.id);
  out += `\n## ${e.id} — ${EPIC_HEAD[e.id] || e.name}${e.id === 'H0' ? ' (walking skeleton)' : ''}\n\n`;
  out += `_${e.goal}_${e.note ? ' ' + e.note : ''}\n`;
  for (const s of stories) {
    const star = s.star ? '★ ' : '';
    const sk = SKELETON.includes(s.id) ? ' ⟶ walking skeleton' : '';
    out += `\n### ${star}${s.id} ${s.title}${sk}\n`;
    if (s.story) out += `${s.story}\n`;
    if (s.genz) out += `> ${s.genz}\n`;
    for (const a of s.ac || []) out += `- AC: ${a}\n`;
    if (s.tech) out += `- Tech: ${s.tech}\n`;
    out += `- Deps: ${s.depsNote || ((s.deps || []).join(', ') || 'none') + '. Size ' + s.size + '.'}\n`;
    if (s.relates && s.relates.length) out += `- Relates: ${s.relates.join(', ')}.\n`;
    if (s.tests) out += `- Tests: ${s.tests}\n`;
    if (s.benchmark) out += `- Benchmark: ${s.benchmark}\n`;
  }
  out += '\n---\n';
}
out += `\n## Story count\n| Epic | Stories | Points (S1 M2 L3) |\n|---|---|---|\n`;
let total = 0, pts = 0;
for (const e of d.epics) {
  const st = d.stories.filter((s) => s.epic === e.id);
  const p = st.reduce((n, s) => n + (d.sizeWeights[s.size] || 2), 0);
  total += st.length; pts += p;
  out += `| ${e.id} ${e.name} | ${st.length} | ${p} |\n`;
}
out += `| **Total** | **${total}** | **${pts}** |\n`;
out += `\nOld → new ids: the fourteen stories this backlog replaces (org area, Consultancy Ops epic) map to these ids in DESIGN §13.\n`;
fs.writeFileSync(path.join(root, 'docs', 'TIMESHEETS-STORIES.md'), out);
console.log(`Wrote docs/TIMESHEETS-STORIES.md: ${total} stories, ${pts} points`);
