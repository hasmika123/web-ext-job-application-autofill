#!/usr/bin/env node
// Generates master-roadmap.html (self-contained drill-down) from the thirteen plan sources
// (user, org, admin, ext, mkt, plat, ai, mob, pay, trust, sup + the Resume Builder and Timesheets products).
//   node docs/roadmap/build-master-roadmap.mjs                    regenerate
//   node docs/roadmap/build-master-roadmap.mjs --set U1.2=done,R0.1=in_progress   (any prefix)
//   node docs/roadmap/build-master-roadmap.mjs --list             counts per area + dangling-id warnings
// Env: ROADMAP_AREAS_DIR overrides docs/roadmap/areas (used for fixtures/tests).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const AREAS_DIR = process.env.ROADMAP_AREAS_DIR ? path.resolve(process.env.ROADMAP_AREAS_DIR) : path.join(here, 'areas');
const OUT = process.env.ROADMAP_OUT ? path.resolve(process.env.ROADMAP_OUT) : path.join(here, 'master-roadmap.html');
const STATUSES = ['not_started', 'in_progress', 'in_review', 'partial', 'done', 'blocked'];
const WEIGHT = { S: 1, M: 2, L: 3 };
const CREDIT = { done: 1, in_review: 0.75, partial: 0.5, in_progress: 0.25, not_started: 0, blocked: 0 };

// group: dashboards | cross | products (home-page sections; a SPOTLIGHTS entry's group must be one of these keys). name = short label; the JSON's own long
// title is kept as fullName. prefix/kind come from each JSON when present (config is the fallback).
const GROUPS = [
  { key: 'dashboards', title: 'Dashboards', blurb: 'The three signed-in surfaces people actually use: the job seeker, the organization and the Kiwiply team.' },
  { key: 'cross', title: 'Cross-cutting', blurb: 'The engines and foundations under every dashboard: extension, growth, reliability, AI, mobile, billing, trust and support.' },
  { key: 'products', title: 'Products', blurb: 'Standalone products built on the shared platform.' },
];
const AREAS = [
  { key: 'user', group: 'dashboards', prefix: 'U', name: 'User dashboard', file: path.join(AREAS_DIR, 'user.json'), plan: 'PLAN-user.md', audit: 'AUDIT-user.md',
    summary: 'Everything a job seeker touches after signing in: the board, applications, inbox matches, profile, resumes and settings, built phone-first so it feels native on a 390px screen.' },
  { key: 'org', group: 'dashboards', prefix: 'O', name: 'Organization dashboard', file: path.join(AREAS_DIR, 'org.json'), plan: 'PLAN-org.md', audit: 'AUDIT-org.md',
    summary: 'The workspace for consultancies and teams: members and seats, per-person items, consultant boards, marketer-prepared resumes and job banks, billing and setup. Timesheets and Consultancy Ops now live in the Timesheets product.' },
  { key: 'admin', group: 'dashboards', prefix: 'A', name: 'App admin dashboard', file: path.join(AREAS_DIR, 'admin.json'), plan: 'PLAN-admin.md', audit: 'AUDIT-admin.md',
    summary: 'The internal console for running Kiwiply: plan and price catalog with the margin guard, users and orgs, AI quotas, services queue, support tools and system health.' },
  { key: 'ent', group: 'products', prefix: 'X', name: 'Enterprise V2', file: path.join(AREAS_DIR, 'ent.json'), plan: null, audit: null,
    docs: [['Overview', '../enterprise-v2/README.md'], ['Requirements', '../ENTERPRISE-V2-REQUIREMENTS.md'], ['Coverage audit', '../enterprise-v2/45-requirements-coverage.md'], ['Backlog', '../enterprise-v2/07-backlog.md'], ['Build order', '../enterprise-v2/06-phase-plan.md'], ['Progress', '../enterprise-v2/progress-tracker.md']],
    summary: 'Multi-tenant enterprise portals on the one shared deployment: each organization gets its own domain and branded login, configurable multi-role workspaces, consultant licenses priced as a base plus feature add-ons, and the talent-marketing pipeline (consultants submit, marketers prepare, HR and Finance only record). Design is complete: 46 design docs, 154 stories, every requirement covered. Build is under way: Phase 1 X1.1 to X1.5 done (flags, tenancy schema, tenant resolution, branded-host routing, tenant-bound sessions).' },
  { key: 'ext', group: 'cross', prefix: 'E', name: 'Browser extension', file: path.join(AREAS_DIR, 'ext.json'), plan: 'PLAN-ext.md', audit: 'AUDIT-ext.md',
    summary: 'The on-page engine: ATS adapters proven against captured real DOM, a fill report after every fill, capture and submit detection, store listings for Chrome, Edge and Firefox. It never auto-submits and never bypasses a CAPTCHA.' },
  { key: 'mkt', group: 'cross', prefix: 'M', name: 'Marketing & growth', file: path.join(AREAS_DIR, 'mkt.json'), plan: 'PLAN-mkt.md', audit: 'AUDIT-mkt.md',
    summary: 'The public face and the growth engine: an honest-claims register enforced in CI, a pricing page that says the money rules out loud, SEO and a content engine, the missing help center, referral, creator and campus programmes.' },
  { key: 'plat', group: 'cross', prefix: 'P', name: 'Platform & reliability', file: path.join(AREAS_DIR, 'plat.json'), plan: 'PLAN-plat.md', audit: 'AUDIT-plat.md',
    summary: 'What keeps kiwiply.com up and its data safe on one shared box: backups that actually run and restore, monitoring with a public status page, pinned deploys with one-variable rollback, staging and the FileStorage seam.' },
  { key: 'ai', group: 'cross', prefix: 'I', name: 'AI platform', file: path.join(AREAS_DIR, 'ai.json'), plan: 'PLAN-ai.md', audit: 'AUDIT-ai.md',
    summary: 'The layer under every AI feature: one gateway with model routing, a prompt registry with evals, truth-check guardrails, embeddings, explainable scores, shared metering and budgets, and the BYO key that keeps Free honest.' },
  { key: 'mob', group: 'cross', prefix: 'N', name: 'Mobile & PWA', file: path.join(AREAS_DIR, 'mob.json'), plan: 'PLAN-mob.md', audit: 'AUDIT-mob.md',
    summary: 'Capture on the phone, apply on the laptop: the installable PWA, a share-sheet save, send-to-laptop, push and offline, an honest phone-apply path, and the store payment rules for a native app later.' },
  { key: 'pay', group: 'cross', prefix: 'B', name: 'Payments & billing', file: path.join(AREAS_DIR, 'pay.json'), plan: 'PLAN-pay.md', audit: 'AUDIT-pay.md',
    summary: 'The engine around Stripe: a catalog with entitlements and a margin guard that holds the 80% and 20% floors, tax and invoices, regional pricing, discounts, plan switching, dunning and in-app cancel.' },
  { key: 'sub', group: 'cross', prefix: 'K', name: 'Subscription module', file: path.join(AREAS_DIR, 'sub.json'), plan: null, audit: null,
    docs: [['Design index', '../subscriptions/README.md'], ['Current state', '../subscriptions/01-current-state-review.md'], ['Pricing model', '../subscriptions/03-pricing-model.md'], ['Decisions', '../subscriptions/decisions-for-user.md'], ['Stories & build order', '../subscriptions/10-stories-and-build-order.md']],
    summary: 'One catalog of services for individuals and organizations; plans are versioned compositions an admin publishes at any time (base, included services, optional add-ons, per-seat rules); one pricing engine and one EntitlementService for both worlds; Stripe stays the truth. Annual billing is designed behind a switch that defaults off (decision S-01).' },
  { key: 'trust', group: 'cross', prefix: 'T', name: 'Trust & compliance', file: path.join(AREAS_DIR, 'trust.json'), plan: 'PLAN-trust.md', audit: 'AUDIT-trust.md',
    summary: 'Privacy operations, minors and age rules, AI-in-hiring law, accessibility and the security program, plus a trust centre that shows the user exactly who sees their data. Includes the list of items that need a lawyer.' },
  { key: 'sup', group: 'cross', prefix: 'S', name: 'Support & community', file: path.join(AREAS_DIR, 'sup.json'), plan: 'PLAN-sup.md', audit: 'AUDIT-sup.md',
    summary: 'Help that answers inside the product: a help center, tickets the user can follow, an AI help assistant, a job-scam safety centre, feedback and changelog, a status page and a community.' },
  { key: 'resume', group: 'products', prefix: 'R', name: 'Resume Builder', file: path.join(here, '..', 'resume-builder', 'stories.json'), plan: null, audit: null, resume: true,
    docs: [['Design', '../RESUME-BUILDER-DESIGN.md'], ['Decisions', '../RESUME-BUILDER-DECISIONS.md'], ['Stories', '../RESUME-BUILDER-STORIES.md']],
    summary: 'A guided resume builder on top of one common profile: edit once, switch templates, version history, export, then Pro AI assist, job tailoring and ATS match.' },
  { key: 'timesheets', group: 'products', prefix: 'H', name: 'Timesheets', file: path.join(here, '..', 'timesheets', 'stories.json'), plan: null, audit: null,
    docs: [['Design', '../TIMESHEETS-DESIGN.md'], ['Decisions', '../TIMESHEETS-DECISIONS.md'], ['Stories', '../TIMESHEETS-STORIES.md']],
    summary: 'An Organization add-on for consultancies: phone-first weekly timesheets, client-approved proof with a never-collected scan, one-tap approval, exports, then invoice, payment and profit records. It records money and never moves it, and is priced in admin (P2).' },
];
// Spotlight epics: optional home-page cards that surface selected epics of an area whose stories are
// already counted there. Stats are computed from epicIds only and never add to the overall totals.
// Currently EMPTY (the old 'ops' spotlight became the Timesheets product, area H). To add one, append
//   { key, group: '<a GROUPS key>', badge: 'XX', name, summary, epicIds: ['O11'], areaKey: 'org' }
// epicIds resolve across all areas; the card renders at the top of its group's section.
const SPOTLIGHTS = [];
// Shared market documents linked from the home page and every area page.
const GLOBAL_DOCS = [['Competitive landscape', 'COMPETITIVE-LANDSCAPE.md'], ['Competitive gaps', 'COMPETITIVE-GAPS.md']];
// Fallback epic priorities for the Resume Builder only; a `priority` on an epic in the JSON always wins.
const RESUME_PRIORITY = { R0: 'P0', R1: 'P0', R2: 'P0', R3: 'P1', R4: 'P1', R5: 'P1', R6: 'P1', R7: 'P2' };

const str = (v) => (v == null ? '' : String(v));
const arr = (v) => (Array.isArray(v) ? v.map(str) : v ? [str(v)] : []);
const today = () => new Date().toISOString().slice(0, 10);

function readJson(file) {
  try { return { data: JSON.parse(fs.readFileSync(file, 'utf8')) }; }
  catch (e) { return { error: e.code === 'ENOENT' ? 'missing' : 'invalid: ' + e.message }; }
}

function firstParagraph(file) {
  let t;
  try { t = fs.readFileSync(file, 'utf8'); } catch { return ''; }
  const lines = t.replace(/\r/g, '').split('\n');
  let buf = [], inFence = false;
  for (const raw of lines) {
    const l = raw.trim();
    if (l.startsWith('```')) { inFence = !inFence; continue; }
    if (inFence) continue;
    const skip = !l || /^(#|>|\||[-*+] |\d+\. |---|<)/.test(l);
    if (skip) { if (buf.length) break; continue; }
    buf.push(l);
  }
  let s = buf.join(' ').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`]+/g, '').replace(/\s+/g, ' ').trim();
  if (s.length > 440) s = s.slice(0, 437).replace(/\s+\S*$/, '') + '...';
  return s;
}

function normStory(s, area, epicIds) {
  const id = str(s.id);
  const epic = str(s.epic) || (id.includes('.') ? id.split('.')[0] : id);
  const status = STATUSES.includes(s.status) ? s.status : 'not_started';
  const design = s.design ? str(s.design).replace(/^docs\//, '../') : null;
  return {
    id, epic, title: str(s.title), status, size: WEIGHT[s.size] ? s.size : 'M',
    owners: arr(s.owners), deps: arr(s.deps), relates: arr(s.relates), supersedes: arr(s.supersedes), benchmark: str(s.benchmark), critical: !!(s.critical || s.star),
    story: str(s.story), genz: str(s.genz), ac: arr(s.ac), tests: arr(s.tests),
    tech: str(s.tech), evidence: arr(s.evidence), design,
  };
}

function loadArea(a) {
  const base = { key: a.key, group: a.group, kind: a.group === 'cross' ? 'cross-cutting' : '', fullName: '', prefix: a.prefix, name: a.name, summary: '', planHref: null, audit: null, docs: [], pending: false, epics: [], updated: '' };
  const r = readJson(a.file);
  const planFile = a.plan && path.join(here, a.plan);
  const auditFile = a.audit && path.join(here, a.audit);
  if (planFile && fs.existsSync(planFile)) base.planHref = a.plan;
  if (auditFile && fs.existsSync(auditFile)) base.audit = a.audit;
  base.docs = (a.docs || []).filter(([, f]) => fs.existsSync(path.join(here, f))).map(([label, href]) => ({ label, href }));
  if (!r.data || !Array.isArray(r.data.stories)) {
    base.pending = true; base.reason = r.error || 'no stories array';
    base.summary = a.summary;
    return base;
  }
  const d = r.data;
  base.updated = str(d.updated);
  // keep the short area name from AREAS (the plan JSON carries a long title, kept as fullName);
  // the curated summary wins over a JSON `summary` so all thirteen read in one voice
  base.summary = a.summary || str(d.summary);
  if (d.name && str(d.name) !== a.name) base.fullName = str(d.name);
  if (d.prefix) base.prefix = str(d.prefix);
  if (d.kind) base.kind = str(d.kind);
  const epicsIn = Array.isArray(d.epics) ? d.epics : [];
  const map = new Map();
  for (const e of epicsIn) {
    const id = str(e.id);
    map.set(id, { id, name: str(e.name), goal: str(e.goal), priority: /^P[0-3]$/.test(e.priority) ? e.priority : (a.resume ? RESUME_PRIORITY[id] || 'P1' : 'P1'), stories: [] });
  }
  for (const s of d.stories) {
    const st = normStory(s, a);
    if (!map.has(st.epic)) map.set(st.epic, { id: st.epic, name: st.epic, goal: '', priority: 'P1', stories: [] });
    map.get(st.epic).stories.push(st);
  }
  base.epics = [...map.values()];
  return base;
}

function pct(stories) {
  let t = 0, d = 0;
  for (const s of stories) { const w = WEIGHT[s.size] || 2; t += w; d += w * (CREDIT[s.status] || 0); }
  return t ? d / t : 0;
}

function loadAll() { return AREAS.map(loadArea); }

const GAP_RE = /^G\d+$/;
// Resolve every story/epic id, plus G<n> competitive-gap rows and bare area prefixes (e.g. "M").
// Anything else is dangling: shown as plain text on the page and listed by --list.
function refIndex(areas) {
  const stories = new Set(), epics = new Set(), prefixes = new Set(), dupes = [];
  for (const a of areas) {
    if (a.prefix) prefixes.add(a.prefix);
    for (const e of a.epics) {
      epics.add(e.id);
      for (const s of e.stories) { if (stories.has(s.id)) dupes.push(s.id); stories.add(s.id); }
    }
  }
  return { stories, epics, prefixes, dupes };
}
function findWarnings(areas) {
  const ix = refIndex(areas), dangling = [];
  let refs = 0, gaps = 0, areaRefs = 0;
  for (const a of areas) for (const e of a.epics) for (const s of e.stories) {
    for (const field of ['deps', 'relates', 'supersedes']) for (const id of s[field]) {
      refs++;
      if (ix.stories.has(id) || ix.epics.has(id)) continue;
      if (GAP_RE.test(id)) { gaps++; continue; }
      if (ix.prefixes.has(id)) { areaRefs++; continue; }
      dangling.push({ from: s.id, field, id });
    }
  }
  return { dangling, dupes: ix.dupes, refs, gaps, areaRefs };
}

function list(areas) {
  const P = (n, w) => String(n).padStart(w);
  const pc = (x) => (x * 100).toFixed(1).padStart(5) + '%';
  const ST = ['done', 'in_review', 'partial', 'in_progress', 'blocked', 'not_started'];
  const SH = { done: 'done', in_review: 'rev', partial: 'part', in_progress: 'prog', blocked: 'blk', not_started: 'todo' };
  console.log(`${'area'.padEnd(6)} ${'pfx'.padEnd(3)} ${'group'.padEnd(10)} ${P('epics', 5)} ${P('stor', 5)} ${P('prog', 6)} ${P('P0', 6)}  ${ST.map((s) => P(SH[s], 5)).join(' ')}`);
  for (const a of areas) {
    if (a.pending) { console.log(`${a.key.padEnd(6)} ${a.prefix.padEnd(3)} PENDING (${a.reason})`); continue; }
    const st = a.epics.flatMap((e) => e.stories);
    const c = {}; st.forEach((s) => (c[s.status] = (c[s.status] || 0) + 1));
    const p0 = st.filter((s) => a.epics.find((e) => e.id === s.epic).priority === 'P0');
    console.log(`${a.key.padEnd(6)} ${a.prefix.padEnd(3)} ${a.group.padEnd(10)} ${P(a.epics.length, 5)} ${P(st.length, 5)} ${pc(pct(st))} ${pc(pct(p0))}  ${ST.map((s) => P(c[s] || 0, 5)).join(' ')}`);
  }
  const live = areas.filter((a) => !a.pending);
  for (const sp of SPOTLIGHTS) {
    const eps = live.flatMap((a) => a.epics).filter((e) => sp.epicIds.includes(e.id));
    const st = eps.flatMap((e) => e.stories);
    const c = {}; st.forEach((s) => (c[s.status] = (c[s.status] || 0) + 1));
    const p0 = eps.filter((e) => e.priority === 'P0').flatMap((e) => e.stories);
    const pris = [...new Set(eps.map((e) => e.priority))].join('/') || '-';
    console.log(`${sp.key.padEnd(6)} ${sp.badge.padEnd(3)} ${'spotlight'.padEnd(10)} ${P(eps.length, 5)} ${P(st.length, 5)} ${pc(pct(st))} ${pc(pct(p0))}  ${ST.map((s) => P(c[s] || 0, 5)).join(' ')}  <- ${sp.epicIds.join('+')} ${pris}, also in ${sp.areaKey}; excluded from overall`);
    const missing = sp.epicIds.filter((id) => !eps.some((e) => e.id === id));
    if (missing.length) console.log(`WARNING spotlight ${sp.key}: epic id(s) not found: ${missing.join(', ')}`);
  }
  const all = live.flatMap((a) => a.epics.flatMap((e) => e.stories));
  const epicsAll = live.flatMap((a) => a.epics);
  console.log(`overall ${live.length} areas, ${epicsAll.length} epics, ${all.length} stories, ${(pct(all) * 100).toFixed(1)}%`);
  const byPri = ['P0', 'P1', 'P2', 'P3'].map((p) => [p, epicsAll.filter((e) => e.priority === p)]).filter(([, l]) => l.length);
  console.log('epics by priority: ' + byPri.map(([p, l]) => `${p} ${l.length} (${(pct(l.flatMap((e) => e.stories)) * 100).toFixed(1)}%)`).join(' | '));
  const w = findWarnings(live);
  console.log(`references: ${w.refs} total in deps/relates/supersedes (${w.gaps} competitive-gap rows G<n>, ${w.areaRefs} bare area prefixes, both resolved)`);
  if (w.dupes.length) console.log(`WARNING duplicate story ids: ${[...new Set(w.dupes)].join(', ')}`);
  if (w.dangling.length) {
    console.log(`WARNING ${w.dangling.length} dangling id(s) (shown as plain text on the page):`);
    for (const d of w.dangling) console.log(`  ${d.from} ${d.field} -> ${d.id}`);
  } else console.log('dangling ids: 0');
}

function setStatuses(pairs) {
  let bad = false;
  const byFile = new Map();
  for (const p of pairs) {
    const [id, status] = p.split('=').map((x) => (x || '').trim());
    if (!STATUSES.includes(status)) { console.error(`Bad status "${status}" for ${id}. Use: ${STATUSES.join(', ')}`); bad = true; continue; }
    let found = false;
    for (const a of AREAS) {
      if (!fs.existsSync(a.file)) continue;
      if (!byFile.has(a.file)) { const r = readJson(a.file); if (!r.data) continue; byFile.set(a.file, { data: r.data, changed: false }); }
      const rec = byFile.get(a.file);
      const s = (rec.data.stories || []).find((x) => x.id === id);
      if (s) { s.status = status; rec.changed = true; found = true; console.log(`${id} -> ${status} (${path.basename(a.file)})`); break; }
    }
    if (!found) { console.error(`Story not found: ${id}`); bad = true; }
  }
  for (const [file, rec] of byFile) {
    if (!rec.changed) continue;
    rec.data.updated = today();
    fs.writeFileSync(file, JSON.stringify(rec.data, null, 2) + '\n');
  }
  return !bad;
}

function build(areas) {
  const updatedMax = areas.map((a) => a.updated).filter(Boolean).sort().pop() || '';
  const docs = GLOBAL_DOCS.filter(([, f]) => fs.existsSync(path.join(here, f))).map(([label, href]) => ({ label, href }));
  const w = findWarnings(areas.filter((a) => !a.pending));
  const payload = { generated: today(), dataUpdated: updatedMax, groups: GROUPS, spotlights: SPOTLIGHTS, docs, warnings: { dangling: w.dangling, dupes: [...new Set(w.dupes)] }, areas };
  const json = JSON.stringify(payload).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const html = TEMPLATE.replace('/*__DATA__*/null', () => json);
  fs.writeFileSync(OUT, html);
  const inc = areas.filter((a) => !a.pending).map((a) => a.key), pen = areas.filter((a) => a.pending).map((a) => a.key);
  console.log(`Wrote ${path.relative(process.cwd(), OUT)}  included: ${inc.join(', ') || 'none'}  pending: ${pen.join(', ') || 'none'}`);
  if (w.dangling.length || w.dupes.length) console.log(`WARNING ${w.dangling.length} dangling id(s), ${w.dupes.length} duplicate story id(s); run --list for details`);
}

// ---------------------------------------------------------------------------
const TEMPLATE = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kiwiply master roadmap</title>
<meta name="color-scheme" content="light dark">
<style>
:root{
  --bg:#F5F7FC;--card:#FFFFFF;--ink:#0E1A3C;--muted:#55627F;--line:#DCE2F0;
  --lime:#84E63C;--lime-ink:#0E1A3C;--lime-soft:#EAF9D9;--blue-soft:#E7EFFE;--lilac-soft:#EFEBFD;--sand-soft:#FFF3DD;
  --accent-text:#2F6B0B;--focus:#3B5BFF;--track:#E4E9F5;--shadow:0 1px 2px rgba(14,26,60,.06),0 6px 20px rgba(14,26,60,.06);
  --s-done:#1F7A33;--s-done-bg:#DDF5E2;--s-partial:#0B6E7A;--s-partial-bg:#D9F1F4;--s-prog:#2B4FD0;--s-prog-bg:#E0E7FD;
  --s-rev:#6A39C7;--s-rev-bg:#EBE1FB;--s-block:#B3261E;--s-block-bg:#FBE0DE;--s-none:#55627F;--s-none-bg:#E9EDF6;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --bg:#0A1124;--card:#121B36;--ink:#E9EEFB;--muted:#9AA7C8;--line:#26335A;
  --lime-soft:#1E3314;--blue-soft:#16264D;--lilac-soft:#241D4A;--sand-soft:#3A2D14;
  --accent-text:#9BEF5A;--focus:#8DA2FF;--track:#22305A;--shadow:0 1px 2px rgba(0,0,0,.4),0 6px 20px rgba(0,0,0,.3);
  --s-done:#7EE08F;--s-done-bg:#16361F;--s-partial:#6FD6E3;--s-partial-bg:#10363B;--s-prog:#9DB1FF;--s-prog-bg:#1B2A5E;
  --s-rev:#C3A5FF;--s-rev-bg:#2D2158;--s-block:#FF9B94;--s-block-bg:#47201D;--s-none:#A9B5D4;--s-none-bg:#1F2A4B;
}}
:root[data-theme="dark"]{
  --bg:#0A1124;--card:#121B36;--ink:#E9EEFB;--muted:#9AA7C8;--line:#26335A;
  --lime-soft:#1E3314;--blue-soft:#16264D;--lilac-soft:#241D4A;--sand-soft:#3A2D14;
  --accent-text:#9BEF5A;--focus:#8DA2FF;--track:#22305A;--shadow:0 1px 2px rgba(0,0,0,.4),0 6px 20px rgba(0,0,0,.3);
  --s-done:#7EE08F;--s-done-bg:#16361F;--s-partial:#6FD6E3;--s-partial-bg:#10363B;--s-prog:#9DB1FF;--s-prog-bg:#1B2A5E;
  --s-rev:#C3A5FF;--s-rev-bg:#2D2158;--s-block:#FF9B94;--s-block-bg:#47201D;--s-none:#A9B5D4;--s-none-bg:#1F2A4B;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 "Plus Jakarta Sans",Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;overflow-x:hidden}
button,input,select{font:inherit;color:inherit}
a{color:inherit}
:focus-visible{outline:3px solid var(--focus);outline-offset:2px;border-radius:8px}
.wrap{max-width:1180px;margin:0 auto;padding:20px 16px 64px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
h1,h2,h3,h4,p{margin:0}
.top{display:flex;gap:20px;align-items:center;flex-wrap:wrap;background:var(--card);border:1px solid var(--line);border-radius:20px;padding:20px;box-shadow:var(--shadow)}
.top .t{flex:1 1 280px;min-width:0}
.eyebrow{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--accent-text)}
h1{font-size:clamp(24px,4vw,34px);line-height:1.15;font-weight:800;letter-spacing:-.02em;margin:2px 0 6px}
.sub{color:var(--muted);max-width:60ch}
.meta{display:flex;flex-wrap:wrap;gap:6px 14px;color:var(--muted);font-size:13px;margin-top:10px;align-items:center}
.rule{font-size:12px;color:var(--muted)}
.linkbtn{background:none;border:0;padding:2px 0;cursor:pointer;color:var(--accent-text);font-weight:700;text-decoration:underline;font-size:13px}
.ring{position:relative;width:var(--d,120px);height:var(--d,120px);flex:none}
.ring svg{width:100%;height:100%;transform:rotate(-90deg)}
.ring .bg{stroke:var(--track)}.ring .fg{stroke:var(--lime);stroke-linecap:round;transition:stroke-dashoffset .6s ease}
.ring b{position:absolute;inset:0;display:flex;align-items:baseline;justify-content:center;padding-top:calc(var(--d,120px)*.33);font-size:calc(var(--d,120px)*.24);font-weight:800;letter-spacing:-.02em}
.ring b small{font-size:.5em;font-weight:700;margin-left:1px}
.ahead .t,.abox .t,.top .t{display:flex;flex-direction:column;gap:8px}
[id^=story-],[id^=epic-]{scroll-margin-top:90px}
.bar{height:8px;border-radius:99px;background:var(--track);overflow:hidden}
.bar i{display:block;height:100%;background:var(--lime);border-radius:99px}
.bar.p0 i{background:var(--focus)}
.toolbar{position:sticky;top:0;z-index:5;background:var(--bg);padding:12px 0 10px;margin-top:8px;display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.toolbar input[type=search],.toolbar select{height:40px;border-radius:12px;border:1px solid var(--line);background:var(--card);padding:0 12px;min-width:0}
.toolbar input[type=search]{flex:1 1 220px}
.toolbar select{flex:0 1 140px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:40px;padding:0 16px;border-radius:12px;border:1px solid var(--line);background:var(--card);cursor:pointer;font-weight:700;white-space:nowrap}
.btn[hidden]{display:none}
.btn:hover{border-color:var(--ink)}
.btn.primary{background:var(--lime);color:var(--lime-ink);border-color:transparent}
.btn.primary:hover{filter:brightness(.95)}
.crumb{display:flex;flex-wrap:wrap;gap:4px 8px;align-items:center;font-size:14px;margin:6px 0 14px;color:var(--muted)}
.crumb a{color:var(--ink);font-weight:700;text-decoration:none;border-bottom:2px solid var(--lime)}
.crumb span[aria-current]{color:var(--ink);font-weight:700}
.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr))}
.grid.areas{grid-template-columns:repeat(auto-fill,minmax(min(100%,420px),1fr))}
.fade{animation:fade .28s ease both}
@keyframes fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.fade{animation:none}.ring .fg{transition:none}}
.abox{position:relative;border-radius:20px;padding:20px;border:1px solid var(--line);display:flex;flex-direction:column;gap:12px;box-shadow:var(--shadow)}
.abox.user{background:var(--lilac-soft)}.abox.org{background:var(--blue-soft)}.abox.admin{background:var(--sand-soft)}.abox.resume{background:var(--lime-soft)}.abox.timesheets{background:var(--blue-soft)}
.abox.g-cross{background:var(--card);border-left:6px solid var(--lime)}
.abox.addon{background:var(--card);border-left:6px solid var(--focus)}
.abox.addon .pfx{width:auto;min-width:26px;padding:0 6px}
.abox .also{font-size:12px;color:var(--muted);font-weight:600}
.abox.pending{background:var(--card);opacity:.65;filter:grayscale(.7);box-shadow:none;border-style:dashed}
.abox .hd{display:flex;gap:14px;align-items:center}
.abox h2{font-size:20px;line-height:1.2;font-weight:800;letter-spacing:-.01em}
.pfx{display:inline-grid;place-items:center;width:26px;height:26px;border-radius:8px;background:var(--ink);color:var(--bg);font-size:13px;font-weight:800;margin-right:8px;vertical-align:2px}
.abox p.sum{color:var(--ink);opacity:.86;font-size:14px}
.counts{display:flex;flex-wrap:wrap;gap:6px}
.pill{font-size:12px;font-weight:700;padding:3px 9px;border-radius:99px;background:var(--card);border:1px solid var(--line);white-space:nowrap}
.p0line{display:flex;align-items:center;gap:10px;font-size:12px;font-weight:700;color:var(--muted)}
.p0line .bar{flex:1}
.chip{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:700;padding:2px 9px;border-radius:99px;white-space:nowrap}
.chip:before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}
.st-done{color:var(--s-done);background:var(--s-done-bg)}.st-partial{color:var(--s-partial);background:var(--s-partial-bg)}
.st-in_progress{color:var(--s-prog);background:var(--s-prog-bg)}.st-in_review{color:var(--s-rev);background:var(--s-rev-bg)}
.st-blocked{color:var(--s-block);background:var(--s-block-bg)}.st-not_started{color:var(--s-none);background:var(--s-none-bg)}
.pr{font-size:12px;font-weight:800;padding:2px 8px;border-radius:8px;border:1.5px solid currentColor}
.pr-P0{color:var(--s-block)}.pr-P1{color:var(--s-prog)}.pr-P2{color:var(--s-none)}
.gz{font-size:11px;font-weight:800;padding:2px 8px;border-radius:8px;background:var(--lime);color:var(--lime-ink)}
.nextup{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:12px 14px;margin:14px 0}
.nextup h3{font-size:13px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:8px}
.nextup .row{display:flex;flex-wrap:wrap;gap:8px}
.nu{display:inline-flex;gap:8px;align-items:center;text-decoration:none;border:1px solid var(--line);border-radius:12px;padding:6px 10px;font-size:13px;background:var(--bg);max-width:100%}
.nu b{color:var(--accent-text)}.nu span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.nu:hover{border-color:var(--ink)}
.ahead{display:flex;flex-wrap:wrap;gap:16px;align-items:center;border-radius:20px;padding:18px 20px;border:1px solid var(--line);box-shadow:var(--shadow)}
.ahead.user{background:var(--lilac-soft)}.ahead.org{background:var(--blue-soft)}.ahead.admin{background:var(--sand-soft)}.ahead.resume{background:var(--lime-soft)}.ahead.timesheets{background:var(--blue-soft)}
.ahead.g-cross{background:var(--card);border-left:6px solid var(--lime)}
.ahead .t{flex:1 1 300px;min-width:0}
.ahead .links{display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;font-size:13px}
.ahead .links a{font-weight:700}
.epic{background:var(--card);border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow);display:flex;flex-direction:column}
.epic.open{border-color:var(--ink)}
.ebtn{all:unset;box-sizing:border-box;cursor:pointer;display:flex;flex-direction:column;gap:9px;padding:16px;border-radius:18px;width:100%}
.ebtn:focus-visible{outline:3px solid var(--focus);outline-offset:-3px}
.ebtn:hover{background:color-mix(in srgb,var(--lime) 8%,transparent)}
.eh{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.eid{font-size:12px;font-weight:800;color:var(--accent-text)}
.ename{font-size:16px;font-weight:800;line-height:1.25;letter-spacing:-.01em}
.egoal{color:var(--muted);font-size:13px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:2.9em}
.estats{display:flex;justify-content:space-between;gap:8px;font-size:12px;color:var(--muted);font-weight:600;flex-wrap:wrap}
.needs{display:flex;flex-wrap:wrap;gap:5px;padding:0 16px 14px;margin-top:-4px;font-size:12px;color:var(--muted);align-items:center}
.dep{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:700;padding:2px 9px;border-radius:99px;border:1px solid var(--line);text-decoration:none;background:var(--bg);color:var(--ink)}
a.dep:hover{border-color:var(--ink)}
.dep i{width:7px;height:7px;border-radius:50%;background:var(--s-none)}
.dep.d-done i{background:var(--s-done)}.dep.d-partial i{background:var(--s-partial)}.dep.d-in_progress i{background:var(--s-prog)}.dep.d-in_review i{background:var(--s-rev)}.dep.d-blocked i{background:var(--s-block)}
.dep.x{border-style:dashed}
.spanrow{grid-column:1/-1}
.stories{background:var(--card);border:1px solid var(--ink);border-radius:18px;overflow:hidden}
.stories .sh{padding:12px 16px;font-size:13px;color:var(--muted);border-bottom:1px solid var(--line);background:var(--bg)}
.story{border-bottom:1px solid var(--line)}.story:last-child{border-bottom:0}
.sbtn{all:unset;box-sizing:border-box;width:100%;cursor:pointer;display:grid;grid-template-columns:64px minmax(0,1fr) auto auto auto;gap:6px 12px;align-items:center;padding:11px 16px}
.sbtn:hover{background:color-mix(in srgb,var(--lime) 8%,transparent)}
.sbtn:focus-visible{outline:3px solid var(--focus);outline-offset:-3px}
.sid{font-weight:800;font-size:12px;color:var(--accent-text)}
.stitle{font-weight:600;font-size:14px;min-width:0;overflow-wrap:anywhere}
.smeta{font-size:12px;color:var(--muted);white-space:nowrap}
.star{color:#E0A100;font-weight:800;font-size:14px}
.sxtra{grid-column:2/-1;display:flex;gap:6px;flex-wrap:wrap;align-items:center;font-size:12px;color:var(--muted)}
.own{font-size:11px;font-weight:700;padding:1px 7px;border-radius:6px;background:var(--bg);border:1px solid var(--line);color:var(--muted)}
.detail{padding:6px 16px 18px 16px;display:grid;gap:14px;background:var(--bg);border-top:1px dashed var(--line)}
.detail h4{font-size:12px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:4px}
.detail ul{margin:0;padding-left:20px}.detail li{margin:3px 0}
.dcols{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))}
.said{font-size:15px;font-weight:600}
.genz{background:var(--lime-soft);border:1px solid color-mix(in srgb,var(--lime) 60%,transparent);border-radius:14px;padding:10px 14px}
.genz h4{color:var(--accent-text)}
.detail code,.tech{font:12.5px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;overflow-wrap:anywhere}
.tech{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px;white-space:pre-wrap}
.depsrow{display:flex;gap:6px;flex-wrap:wrap}
.empty{padding:28px;text-align:center;color:var(--muted);border:1px dashed var(--line);border-radius:16px}
.results .grp{margin:14px 0 6px;font-weight:800}
.res{display:block;text-decoration:none;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:10px 14px;margin-bottom:8px}
.res:hover{border-color:var(--ink)}
.res .l{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.drawer{position:fixed;inset:0 0 0 auto;width:min(440px,100%);background:var(--card);border-left:1px solid var(--line);box-shadow:-10px 0 40px rgba(0,0,0,.25);z-index:20;overflow:auto;padding:20px;transform:translateX(0)}
.drawer[hidden]{display:none}
.drawer table{border-collapse:collapse;width:100%;font-size:13px;margin:8px 0 16px}
.drawer td,.drawer th{border-bottom:1px solid var(--line);padding:6px 4px;text-align:left}
.drawer h2{font-size:18px;margin-bottom:8px}
.bench{background:var(--blue-soft);border:1px solid var(--line);border-radius:14px;padding:10px 14px}
.bench h4{color:var(--s-prog)}
.sec{margin:28px 0 12px}
.sec h2{font-size:22px;font-weight:800;letter-spacing:-.01em;display:flex;flex-wrap:wrap;gap:4px 12px;align-items:baseline}
.sec h2 small{font-size:13px;font-weight:600;color:var(--muted);letter-spacing:0}
.sec p{color:var(--muted);font-size:14px;margin-top:2px;max-width:70ch}
.sec .grid{margin-top:14px}
.refbar{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;margin:16px 0 0;font-size:14px}
.refbar a.btn{text-decoration:none}
.refbar .docs{display:flex;flex-wrap:wrap;gap:6px 14px}
.refbar .docs a{font-weight:700}
.vhead{margin:6px 0 4px;display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center;justify-content:space-between}
.vhead h2{font-size:24px;font-weight:800;letter-spacing:-.01em}
.vhead label{display:flex;gap:8px;align-items:center;font-size:13px;color:var(--muted);font-weight:600}
.vhead select{height:36px;border-radius:10px;border:1px solid var(--line);background:var(--card);padding:0 10px;min-width:0;max-width:100%}
.pgrp{margin-top:22px}
.pgrp .ph{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;margin-bottom:8px;font-size:14px}
.pgrp .ph .bar{flex:1 1 120px;max-width:260px}
.pgrp .ph span.sub2{color:var(--muted);font-weight:600}
.erows{background:var(--card);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);overflow:hidden}
.erow{display:grid;grid-template-columns:54px minmax(0,1fr) 180px 140px 110px;gap:4px 14px;align-items:center;padding:10px 14px;border-bottom:1px solid var(--line);text-decoration:none;color:inherit}
.erow:last-child{border-bottom:0}
a.erow:hover{background:color-mix(in srgb,var(--lime) 8%,transparent)}
.erow.eh2{font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:700;background:var(--bg);padding-top:7px;padding-bottom:7px}
.erow .en{min-width:0}
.erow .en b{display:block;font-size:14px;overflow-wrap:anywhere}
.erow .en span{display:block;font-size:12px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.erow .ea{font-size:12px;font-weight:700;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.erow .ep{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;min-width:0}
.erow .ep .bar{flex:1;min-width:30px}
.erow .ec{font-size:12px;color:var(--muted);white-space:nowrap}
.erow .em{font-size:12px;color:var(--muted);text-align:right;white-space:nowrap}
.foot{margin-top:30px;color:var(--muted);font-size:12px}
noscript{display:block;padding:20px}
@media (max-width:640px){
  .wrap{padding:12px 16px 56px}
  .sbtn{grid-template-columns:54px minmax(0,1fr) auto}
  .sbtn .smeta.size,.sbtn .star{display:none}
  .sxtra{grid-column:1/-1}
  .toolbar{position:static}
  .toolbar select{flex:1 1 40%}
  .top{padding:16px}
  .erow{grid-template-columns:48px minmax(0,1fr);padding:11px 14px}
  .erow.eh2{display:none}
  .erow .en{grid-column:2}
  .erow .ea,.erow .ep,.erow .ec,.erow .em{grid-column:2;text-align:left}
  .erow .en span{white-space:normal}
}
@media print{
  body{background:#fff;color:#000}.toolbar,.btn,.linkbtn,.drawer{display:none!important}
  .epic,.stories,.abox,.ahead,.top{box-shadow:none;break-inside:avoid}
  .fade{animation:none}
}
</style>
</head>
<body>
<div class="wrap">
  <header class="top" id="top"></header>
  <div class="toolbar" id="toolbar" role="search">
    <label class="sr" for="q">Search stories by id or title</label>
    <input id="q" type="search" placeholder="Search stories by id or title" autocomplete="off">
    <label class="sr" for="fs">Status filter</label>
    <select id="fs"><option value="">All statuses</option><option value="done">Done</option><option value="partial">Partial</option><option value="in_review">In review</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="not_started">Not started</option></select>
    <label class="sr" for="fp">Priority filter</label>
    <select id="fp"><option value="">All priorities</option><option>P0</option><option>P1</option><option>P2</option></select>
    <label class="sr" for="fo">Owner filter</label>
    <select id="fo"><option value="">All owners</option></select>
    <button class="btn" id="exp" type="button">Expand all</button>
    <button class="btn" id="col" type="button">Collapse all</button>
  </div>
  <nav class="crumb" id="crumb" aria-label="Breadcrumb"></nav>
  <main id="main" tabindex="-1"></main>
  <p class="foot" id="foot"></p>
</div>
<aside class="drawer" id="drawer" hidden role="dialog" aria-label="Legend and how progress is counted">
  <button class="btn" id="dclose" type="button" style="float:right">Close</button>
  <h2>Legend and how progress is counted</h2>
  <p class="rule">Each story is worth points by size (S = 1, M = 2, L = 3). A story contributes points times its status credit. Epic, area and overall percentages are earned points divided by total points.</p>
  <table><thead><tr><th>Status</th><th>Credit</th></tr></thead><tbody>
    <tr><td><span class="chip st-done">Done</span></td><td>100%</td></tr>
    <tr><td><span class="chip st-in_review">In review</span></td><td>75%</td></tr>
    <tr><td><span class="chip st-partial">Partial</span></td><td>50%</td></tr>
    <tr><td><span class="chip st-in_progress">In progress</span></td><td>25%</td></tr>
    <tr><td><span class="chip st-not_started">Not started</span></td><td>0%</td></tr>
    <tr><td><span class="chip st-blocked">Blocked</span></td><td>0%</td></tr>
  </tbody></table>
  <p class="rule"><span class="pr pr-P0">P0</span> must ship for launch, <span class="pr pr-P1">P1</span> next, <span class="pr pr-P2">P2</span> later. P0 progress counts only stories in P0 epics. <span class="star">&#9733;</span> marks a critical story. <span class="gz">Gen Z</span> marks an epic whose stories explain why younger users will love it. A dashed chip is a dependency that is not in any roadmap file.</p>
  <p class="rule" style="margin-top:10px">"Next up" lists the first not-started stories in P0 epics whose dependencies are all done.</p>
  <p class="rule" style="margin-top:10px">A story's <b>Benchmark</b> says which competitor bar it meets or beats. <b>Relates to</b> and <b>Supersedes</b> link to other stories, in any area. <b>G1, G2...</b> chips open a row of the competitive gaps document. A dashed chip points at an id that no roadmap file defines.</p>
  <p class="rule" style="margin-top:10px">Shortcuts: / focuses search. Links like #/user/U2/U2.3 open a story directly; #/epics opens the flat list of every epic.</p>
</aside>
<noscript>This roadmap needs JavaScript to draw the drill-down.</noscript>
<script>
(function(){
"use strict";
var DATA=/*__DATA__*/null;
var W={S:1,M:2,L:3},CR={done:1,in_review:.75,partial:.5,in_progress:.25,not_started:0,blocked:0};
var SL={done:"Done",partial:"Partial",in_progress:"In progress",in_review:"In review",blocked:"Blocked",not_started:"Not started"};
var $=function(i){return document.getElementById(i)};
function el(tag,cls,text,attrs){var e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;if(attrs)for(var k in attrs){if(attrs[k]!=null)e.setAttribute(k,attrs[k])}return e}
function add(p){for(var i=1;i<arguments.length;i++){if(arguments[i])p.appendChild(arguments[i])}return p}
function pctOf(list){var t=0,d=0;list.forEach(function(s){var w=W[s.size]||2;t+=w;d+=w*(CR[s.status]||0)});return t?d/t:0}
function fmt(x){return Math.round(x*100)}
function plural(n,w){return n+" "+w+(n===1?"":"s")}

var areaByKey={},epicById={},storyById={},revDeps={},allStories=[];
DATA.areas.forEach(function(a){areaByKey[a.key]=a;a.epics.forEach(function(e){
  e.area=a;e.pct=pctOf(e.stories);
  epicById[e.id]={area:a,epic:e};
  e.stories.forEach(function(s){s.area=a;s.epicObj=e;storyById[s.id]={area:a,epic:e,story:s};allStories.push(s)})
})});
allStories.forEach(function(s){s.deps.forEach(function(d){(revDeps[d]=revDeps[d]||[]).push(s.id)})});
var revSup={},prefixArea={},gapsDoc=null,allEpics=[];
DATA.docs.forEach(function(d){if(/GAPS/.test(d.href))gapsDoc=d.href});
DATA.areas.forEach(function(a){if(a.prefix)prefixArea[a.prefix]=a;a.epics.forEach(function(e){allEpics.push(e)})});
allStories.forEach(function(s){s.supersedes.forEach(function(d){(revSup[d]=revSup[d]||[]).push(s.id)})});
DATA.areas.forEach(function(a){
  var all=[],p0=[];a.epics.forEach(function(e){all=all.concat(e.stories);if(e.priority==="P0")p0=p0.concat(e.stories)});
  a.stories=all;a.pct=pctOf(all);a.p0pct=p0.length?pctOf(p0):null;
  a.counts={done:0,flight:0,none:0};
  all.forEach(function(s){if(s.status==="done")a.counts.done++;else if(s.status==="not_started"||s.status==="blocked")a.counts.none++;else a.counts.flight++});
  a.epics.forEach(function(e){
    e.genz=e.stories.some(function(s){return !!s.genz});
    e.crit=e.stories.filter(function(s){return s.critical}).length;
    var need={};
    e.stories.forEach(function(s){s.deps.forEach(function(d){var t=storyById[d]||null,ep=t?t.epic:epicById[d]&&epicById[d].epic;var ar=t?t.area:epicById[d]&&epicById[d].area;if(ep&&ar&&ar!==a)need[ep.id]=ep})});
    e.needs=Object.keys(need).map(function(k){return need[k]});
  });
});
var spotlights=(DATA.spotlights||[]).map(function(sp){
  var eps=sp.epicIds.map(function(id){return epicById[id]&&epicById[id].epic}).filter(Boolean);
  if(!eps.length)return null;
  var st=eps.reduce(function(x,e){return x.concat(e.stories)},[]),c={done:0,flight:0,none:0};
  st.forEach(function(s){if(s.status==="done")c.done++;else if(s.status==="not_started"||s.status==="blocked")c.none++;else c.flight++});
  var pris=[];eps.forEach(function(e){if(pris.indexOf(e.priority)<0)pris.push(e.priority)});
  var o={};for(var k in sp)o[k]=sp[k];
  o.epics=eps;o.stories=st;o.counts=c;o.pct=pctOf(st);o.pris=pris;o.area=epicById[eps[0].id].area;return o;
}).filter(Boolean);
var live=DATA.areas.filter(function(a){return !a.pending});
var overall=pctOf(live.reduce(function(x,a){return x.concat(a.stories)},[]));
var owners={};allStories.forEach(function(s){s.owners.forEach(function(o){owners[o]=1})});
Object.keys(owners).sort().forEach(function(o){var op=el("option",null,o);op.value=o;$("fo").appendChild(op)});

var F={q:"",status:"",pri:"",owner:""};
var openE={},openS={},route={area:"",epic:"",story:""},focusKey=null,noScroll=false;

function ring(p,d,label){
  var r=42,c=2*Math.PI*r,w=el("div","ring",null,{role:"img","aria-label":label||("Progress "+fmt(p)+" percent")});
  w.style.setProperty("--d",d+"px");
  var ns="http://www.w3.org/2000/svg",s=document.createElementNS(ns,"svg");s.setAttribute("viewBox","0 0 100 100");s.setAttribute("aria-hidden","true");
  [["bg",0],["fg",c*(1-p)]].forEach(function(x){var ci=document.createElementNS(ns,"circle");ci.setAttribute("class",x[0]);ci.setAttribute("cx","50");ci.setAttribute("cy","50");ci.setAttribute("r",String(r));ci.setAttribute("fill","none");ci.setAttribute("stroke-width","10");ci.setAttribute("stroke-dasharray",String(c));ci.setAttribute("stroke-dashoffset",String(x[1]));s.appendChild(ci)});
  w.appendChild(s);var b=el("b",null,String(fmt(p)));b.appendChild(el("small",null,"%"));w.appendChild(b);return w;
}
function bar(p,cls){var b=el("div","bar"+(cls?" "+cls:""),null,{"aria-hidden":"true"});var i=el("i");i.style.width=fmt(p)+"%";b.appendChild(i);return b}
function chip(status){return el("span","chip st-"+status,SL[status]||status)}
function prChip(p){return el("span","pr pr-"+p,p)}

function href(area,epic,story){return "#/"+area+(epic?"/"+epic:"")+(story?"/"+story:"")}
function depChip(id){
  var s=storyById[id];
  if(s){var a=el("a","dep d-"+s.story.status,null,{href:href(s.area.key,s.epic.id,s.story.id),title:s.story.title+" ("+SL[s.story.status]+")"});add(a,el("i"),el("span",null,id));return a}
  var e=epicById[id];
  if(e){var a2=el("a","dep",null,{href:href(e.area.key,e.epic.id),title:"Epic: "+e.epic.name});add(a2,el("i"),el("span",null,id+" (epic)"));return a2}
  if(/^G\d+$/.test(id)&&gapsDoc){var g=el("a","dep",null,{href:gapsDoc,target:"_blank",rel:"noopener",title:"Competitive gap row "+id+" (open the gaps document)"});add(g,el("i"),el("span",null,id+" (gap)"));return g}
  var pa=prefixArea[id];
  if(pa&&!pa.pending){var a3=el("a","dep",null,{href:href(pa.key),title:"Area: "+pa.name});add(a3,el("i"),el("span",null,id+" (area)"));return a3}
  var x=el("span","dep x",null,{title:"Not in any roadmap file"});add(x,el("i"),el("span",null,id));return x;
}
function refBlock(title,ids){
  if(!ids.length)return null;
  var p=el("div");p.appendChild(el("h4",null,title));var r=el("div","depsrow");ids.forEach(function(x){r.appendChild(depChip(x))});p.appendChild(r);return p;
}

function matches(s){
  if(F.status&&s.status!==F.status)return false;
  if(F.pri&&s.epicObj.priority!==F.pri)return false;
  if(F.owner&&s.owners.indexOf(F.owner)<0)return false;
  if(F.q){var q=F.q.toLowerCase();if((s.id+" "+s.title).toLowerCase().indexOf(q)<0)return false}
  return true;
}
function filtering(){return !!(F.q||F.status||F.pri||F.owner)}

function renderTop(){
  var t=$("top");t.textContent="";
  var d=el("div","t");
  add(d,el("div","eyebrow","Kiwiply product roadmap"),el("h1",null,"The big app roadmap"),
    el("p","sub",plural(live.length,"area")+" in "+plural(DATA.groups.length,"group")+". Open one to see its feature boxes, open a feature to see its stories, open a story for the details. Or list every feature box in one place."));
  var m=el("div","meta");
  var done=live.reduce(function(n,a){return n+a.counts.done},0),total=live.reduce(function(n,a){return n+a.stories.length},0);
  add(m,el("span",null,done+" of "+total+" stories done"),
    el("span",null,"Data updated "+(DATA.dataUpdated||"n/a")+" | built "+DATA.generated));
  var lb=el("button","linkbtn","Legend and how progress is counted",{type:"button","aria-expanded":"false","aria-controls":"drawer",id:"legendbtn"});
  lb.addEventListener("click",function(){setDrawer(true)});m.appendChild(lb);
  d.appendChild(m);
  d.appendChild(el("p","rule","Progress = story points (S1, M2, L3) x status credit (Done 100%, In review 75%, Partial 50%, In progress 25%, else 0)."));
  d.style.marginRight="0";
  add(t,d,ring(overall,128,"Overall progress "+fmt(overall)+" percent"));
}
function setDrawer(o){var d=$("drawer");d.hidden=!o;$("legendbtn").setAttribute("aria-expanded",String(o));if(o)$("dclose").focus();else $("legendbtn").focus()}

function counts(a){
  var c=el("div","counts");
  add(c,el("span","pill",plural(a.epics.length,"epic")),el("span","pill",plural(a.stories.length,"story").replace("storys","stories")),
    el("span","pill",a.counts.done+" done"),el("span","pill",a.counts.flight+" partial / in flight"),el("span","pill",a.counts.none+" not started"));
  return c;
}
function p0line(a){
  var w=el("div","p0line");
  if(a.p0pct==null){w.appendChild(el("span",null,"No P0 epics"));return w}
  add(w,el("span",null,"P0 "+fmt(a.p0pct)+"%"),bar(a.p0pct,"p0"));return w;
}

function docLinks(list){
  var w=el("span","docs");
  list.forEach(function(d){w.appendChild(el("a",null,d.label,{href:d.href,target:"_blank",rel:"noopener"}))});
  return w;
}
function renderRef(m){
  var r=el("div","refbar fade");
  var b=el("a","btn primary","All epics ("+allEpics.length+")",{href:"#/epics"});
  r.appendChild(b);
  if(DATA.docs.length){r.appendChild(el("span","rule","Market research:"));r.appendChild(docLinks(DATA.docs))}
  m.appendChild(r);
}
function renderAreas(m){
  renderRef(m);
  DATA.groups.forEach(function(gr){
    var list=DATA.areas.filter(function(a){return a.group===gr.key});
    var sps=spotlights.filter(function(x){return x.group===gr.key});
    if(sps.length){
      var sc=el("div","sec"),sh=el("h2",null,gr.title);
      sh.appendChild(el("small",null,plural(sps.length,"add-on")));
      add(sc,sh,el("p",null,gr.blurb));m.appendChild(sc);
      spotlightGrid(m,sps);
    }
    if(!list.length)return;
    var live2=list.filter(function(a){return !a.pending}),st=live2.reduce(function(x,a){return x.concat(a.stories)},[]);
    var sec=el("div","sec"),h=el("h2",null,gr.title);
    h.appendChild(el("small",null,plural(list.length,"area")+" | "+plural(st.length,"story").replace("storys","stories")+" | "+fmt(pctOf(st))+"%"));
    add(sec,h,el("p",null,gr.blurb));
    m.appendChild(sec);
    areaGrid(m,list);
  });
}
function spotlightGrid(m,list){
  var g=el("div","grid areas fade");
  list.forEach(function(sp){
    var b=el("section","abox addon");
    var hd=el("div","hd"),t=el("div",null);t.style.flex="1";t.style.minWidth="0";
    var h=el("h2");add(h,el("span","pfx",sp.badge),document.createTextNode(sp.name));
    t.appendChild(h);hd.appendChild(t);
    hd.appendChild(ring(sp.pct,84,sp.name+" "+fmt(sp.pct)+" percent"));
    b.appendChild(hd);
    b.appendChild(el("p","sum",sp.summary));
    b.appendChild(counts(sp));
    var pl=el("div","p0line");
    sp.pris.forEach(function(p){pl.appendChild(prChip(p))});
    pl.appendChild(el("span",null,"Epic "+sp.epicIds.join(", ")+" | also in "+sp.area.name));
    b.appendChild(pl);
    var open=el("button","btn primary","Open",{type:"button","data-k":"addon-"+sp.key});
    open.addEventListener("click",function(){noScroll=false;go(href(sp.area.key,sp.epics[0].id))});
    open.style.alignSelf="flex-start";b.appendChild(open);
    g.appendChild(b);
  });
  m.appendChild(g);
}
function areaGrid(m,list){
  var g=el("div","grid areas fade");
  list.forEach(function(a){
    var b=el("section","abox "+a.key+" g-"+a.group+(a.pending?" pending":""));
    var hd=el("div","hd");
    var t=el("div",null);t.style.flex="1";t.style.minWidth="0";
    var h=el("h2");add(h,el("span","pfx",a.prefix),document.createTextNode(a.name));
    t.appendChild(h);
    if(a.pending){t.appendChild(el("div","pill","Plan being written"));t.lastChild.style.marginTop="6px"}
    hd.appendChild(t);
    if(!a.pending)hd.appendChild(ring(a.pct,84,a.name+" "+fmt(a.pct)+" percent"));
    b.appendChild(hd);
    b.appendChild(el("p","sum",a.summary));
    if(!a.pending){b.appendChild(counts(a));b.appendChild(p0line(a))}
    if(a.docs&&a.docs.length){var dl=el("div","refbar");dl.style.margin="0";dl.appendChild(docLinks(a.docs));b.appendChild(dl)}
    var open=el("button","btn"+(a.pending?"":" primary"),a.pending?"Plan being written":"Open",{type:"button","data-k":"area-"+a.key});
    if(a.pending)open.disabled=true;else open.addEventListener("click",function(){noScroll=true;go(href(a.key))});
    open.style.alignSelf="flex-start";b.appendChild(open);
    g.appendChild(b);
  });
  m.appendChild(g);
}

function renderNext(a,m){
  var cands=[];
  a.epics.forEach(function(e){if(e.priority!=="P0")return;e.stories.forEach(function(s){
    if(s.status!=="not_started")return;
    var ok=s.deps.every(function(d){var t=storyById[d];return !t||t.story.status==="done"});
    if(ok)cands.push(s)})});
  if(!cands.length)return;
  var n=el("section","nextup");n.setAttribute("aria-label","Next up");
  n.appendChild(el("h3",null,"Next up (P0, dependencies done)"));
  var r=el("div","row");
  cands.slice(0,4).forEach(function(s){var l=el("a","nu",null,{href:href(a.key,s.epic,s.id)});add(l,el("b",null,s.id),el("span",null,s.title));r.appendChild(l)});
  if(cands.length>4)r.appendChild(el("span","rule","+"+(cands.length-4)+" more"));
  n.appendChild(r);m.appendChild(n);
}

function storyNode(s){
  var key="s-"+s.id,isOpen=!!openS[s.id];
  var w=el("div","story");
  var b=el("button","sbtn",null,{type:"button","aria-expanded":String(isOpen),"aria-controls":"d-"+s.id,"data-k":key,id:"story-"+s.id});
  add(b,el("span","sid",s.id),el("span","stitle",s.title),chip(s.status),el("span","smeta size",s.size),el("span","star",s.critical?"\u2605":"",s.critical?{"aria-label":"Critical story",title:"Critical story"}:null));
  var x=el("span","sxtra");
  s.owners.forEach(function(o){x.appendChild(el("span","own",o))});
  if(s.deps.length)x.appendChild(el("span",null,"needs "+s.deps.join(", ")));
  if(s.owners.length||s.deps.length)b.appendChild(x);
  b.addEventListener("click",function(){toggleStory(s)});
  w.appendChild(b);
  if(isOpen)w.appendChild(detailNode(s));
  return w;
}
function listBlock(title,items,code){
  if(!items.length)return null;
  var d=el("div");d.appendChild(el("h4",null,title));
  var u=el("ul");items.forEach(function(x){var li=el("li");if(code)li.appendChild(el("code",null,x));else li.textContent=x;u.appendChild(li)});
  d.appendChild(u);return d;
}
function detailNode(s){
  var d=el("div","detail fade",null,{id:"d-"+s.id,role:"region","aria-label":"Details for "+s.id});
  if(s.story)d.appendChild(el("p","said",s.story));
  if(s.genz){var g=el("div","genz");add(g,el("h4",null,"Why Gen Z/Alpha will love it"),el("p",null,s.genz));d.appendChild(g)}
  if(s.benchmark){var bm=el("div","bench");add(bm,el("h4",null,"Benchmark"),el("p",null,s.benchmark));d.appendChild(bm)}
  var c=el("div","dcols");add(c,listBlock("Acceptance criteria",s.ac),listBlock("Tests",s.tests));if(c.childNodes.length)d.appendChild(c);
  if(s.tech){var t=el("div");add(t,el("h4",null,"Tech notes"),el("div","tech",s.tech));d.appendChild(t)}
  add(d,listBlock("Evidence (files)",s.evidence,true));
  if(s.design){var dd=el("div");dd.appendChild(el("h4",null,"Design doc"));dd.appendChild(el("a",null,s.design.replace(/^\.\.\//,"docs/"),{href:s.design,target:"_blank",rel:"noopener"}));d.appendChild(dd)}
  add(d,refBlock("Depends on",s.deps),refBlock("Relates to",s.relates),refBlock("Supersedes",s.supersedes),refBlock("Superseded by",revSup[s.id]||[]));
  var rv=(revDeps[s.id]||[]).concat(revDeps[s.epic]||[]);
  if(rv.length){var q=el("div");q.appendChild(el("h4",null,"Unblocks"));var r2=el("div","depsrow");rv.forEach(function(x){r2.appendChild(depChip(x))});q.appendChild(r2);d.appendChild(q)}
  var ft=el("div","depsrow");add(ft,chip(s.status),el("span","own","Size "+s.size),el("span","own","Epic "+s.epic+" "+s.epicObj.priority));d.appendChild(ft);
  return d;
}

function epicNodes(a,e,grid){
  var isOpen=!!openE[e.id];
  var visible=e.stories.filter(matches);
  var c=el("article","epic"+(isOpen?" open":""));
  var b=el("button","ebtn",null,{type:"button","aria-expanded":String(isOpen),"aria-controls":"es-"+e.id,"data-k":"e-"+e.id,id:"epic-"+e.id});
  var eh=el("div","eh");add(eh,el("span","eid",e.id),prChip(e.priority),chip(e.pct>=.999?"done":e.pct>0?"in_progress":"not_started"));
  eh.lastChild.textContent=e.pct>=.999?"Complete":e.pct>0?"In flight":"Not started";
  if(e.genz)eh.appendChild(el("span","gz","Gen Z"));
  add(b,eh,el("h3","ename",e.name),el("p","egoal",e.goal||"No summary yet."),bar(e.pct));
  var doneN=e.stories.filter(function(s){return s.status==="done"}).length;
  var st=el("div","estats");add(st,el("span",null,fmt(e.pct)+"% | "+doneN+" of "+e.stories.length+" stories done"),el("span",null,e.crit?e.crit+" critical \u2605":""));
  b.appendChild(st);
  b.addEventListener("click",function(){toggleEpic(a,e)});
  c.appendChild(b);
  if(e.needs.length){
    var n=el("div","needs");n.appendChild(el("span",null,"needs"));
    e.needs.slice(0,4).forEach(function(x){var l=el("a","dep",null,{href:href(epicById[x.id].area.key,x.id),title:x.name});add(l,el("i"),el("span",null,x.id));n.appendChild(l)});
    if(e.needs.length>4)n.appendChild(el("span",null,"+"+(e.needs.length-4)));
    c.appendChild(n);
  }
  grid.appendChild(c);
  if(isOpen){
    var sp=el("div","spanrow fade",null,{id:"es-"+e.id,role:"region","aria-label":e.id+" stories"});
    var box=el("div","stories");
    box.appendChild(el("div","sh",e.id+" "+e.name+" | "+(filtering()?visible.length+" of "+e.stories.length+" stories match filters":plural(e.stories.length,"story").replace("storys","stories"))));
    if(!visible.length)box.appendChild(el("div","empty","No stories match the current filters."));
    visible.forEach(function(s){box.appendChild(storyNode(s))});
    sp.appendChild(box);grid.appendChild(sp);
  }
}

function renderArea(a,m){
  var h=el("section","ahead "+a.key+" g-"+a.group);
  var t=el("div","t");
  var hh=el("h2");hh.style.fontSize="24px";add(hh,el("span","pfx",a.prefix),document.createTextNode(a.name));
  add(t,hh,a.fullName?el("p","rule",a.fullName+(a.kind?" ("+a.kind+")":"")):null,el("p","sub",a.summary),counts(a),p0line(a));
  var lk=el("div","links");
  if(a.planHref)lk.appendChild(el("a",null,"Plan",{href:a.planHref,target:"_blank",rel:"noopener"}));
  if(a.audit)lk.appendChild(el("a",null,"Audit",{href:a.audit,target:"_blank",rel:"noopener"}));
  (a.docs||[]).forEach(function(d){lk.appendChild(el("a",null,d.label,{href:d.href,target:"_blank",rel:"noopener"}))});
  DATA.docs.forEach(function(d){lk.appendChild(el("a",null,d.label,{href:d.href,target:"_blank",rel:"noopener"}))});
  if(lk.childNodes.length)t.appendChild(lk);
  add(h,t,ring(a.pct,100,a.name+" "+fmt(a.pct)+" percent"));
  m.appendChild(h);
  renderNext(a,m);
  var eps=a.epics.filter(function(e){return !filtering()||e.stories.some(matches)});
  var hidden=a.epics.length-eps.length;
  var g=el("div","grid fade");g.style.marginTop="14px";
  eps.forEach(function(e){epicNodes(a,e,g)});
  m.appendChild(g);
  if(!eps.length)m.appendChild(el("div","empty","No epics have stories matching the filters."));
  else if(hidden)m.appendChild(el("p","rule","\u00a0"+plural(hidden,"epic")+" hidden by filters."));
}

var sortMode="area";
var PRI={P0:"Must ship for launch",P1:"Next",P2:"Later"};
var SORTS=[["area","Area order"],["prog-asc","Least done first"],["prog-desc","Most done first"],["stories","Most stories first"],["name","Name A to Z"]];
function renderEpics(m){
  var vh=el("div","vhead fade");
  var h=el("h2",null,"All epics");
  var lab=el("label",null,"Sort within priority ");
  var sel=el("select",null,null,{"data-k":"sort"});
  SORTS.forEach(function(o){var op=el("option",null,o[1]);op.value=o[0];if(o[0]===sortMode)op.selected=true;sel.appendChild(op)});
  sel.addEventListener("change",function(){sortMode=sel.value;focusKey="sort";render()});
  lab.appendChild(sel);add(vh,h,lab);m.appendChild(vh);
  var rows=[];
  allEpics.forEach(function(e,i){
    var vis=e.stories.filter(matches);
    if(filtering()&&!vis.length)return;
    rows.push({e:e,i:i,vis:vis});
  });
  m.appendChild(el("p","rule","Every feature box across "+plural(live.length,"area")+", grouped by priority. "+(filtering()?rows.length+" of "+allEpics.length+" epics match the filters. ":"")+"Open a row to jump to that epic in its area."));
  if(!rows.length){m.appendChild(el("div","empty","No epics have stories matching the filters."));return}
  var cmp={
    "area":function(a,b){return a.i-b.i},
    "prog-asc":function(a,b){return a.e.pct-b.e.pct||a.i-b.i},
    "prog-desc":function(a,b){return b.e.pct-a.e.pct||a.i-b.i},
    "stories":function(a,b){return b.e.stories.length-a.e.stories.length||a.i-b.i},
    "name":function(a,b){return a.e.name.localeCompare(b.e.name)||a.i-b.i}
  }[sortMode];
  var pris=["P0","P1","P2"];
  rows.forEach(function(r){if(pris.indexOf(r.e.priority)<0)pris.push(r.e.priority)});
  pris.forEach(function(p){
    var g=rows.filter(function(r){return r.e.priority===p});
    if(!g.length)return;
    g.sort(cmp);
    var all=g.reduce(function(x,r){return x.concat(r.e.stories)},[]);
    var grp=el("section","pgrp fade");
    var ph=el("div","ph");
    add(ph,prChip(p),el("b",null,PRI[p]||"Other"),el("span","sub2",plural(g.length,"epic")+" | "+plural(all.length,"story").replace("storys","stories")+" | "+fmt(pctOf(all))+"%"),bar(pctOf(all),p==="P0"?"p0":""));
    grp.appendChild(ph);
    var box=el("div","erows");
    var hd=el("div","erow eh2",null,{"aria-hidden":"true"});
    add(hd,el("span",null,"Epic"),el("span",null,"Name and goal"),el("span",null,"Area"),el("span",null,"Progress"),el("span","em","Stories"));
    box.appendChild(hd);
    g.forEach(function(r){
      var e=r.e,a=e.area;
      var doneN=e.stories.filter(function(s){return s.status==="done"}).length;
      var row=el("a","erow",null,{href:href(a.key,e.id),title:a.name+" | "+e.id+" "+e.name});
      var en=el("div","en");add(en,el("b",null,e.name),el("span",null,e.goal||"No summary yet."));
      var ar=el("span","ea");add(ar,el("span","pfx",a.prefix),document.createTextNode(a.name));
      var ep=el("div","ep");add(ep,bar(e.pct,e.priority==="P0"?"p0":""),el("span",null,fmt(e.pct)+"%"));
      var cnt=filtering()?r.vis.length+" of "+e.stories.length:String(e.stories.length);
      add(row,el("span","eid",e.id),en,ar,ep,el("span","em",cnt+" | "+doneN+" done"));
      box.appendChild(row);
    });
    grp.appendChild(box);m.appendChild(grp);
  });
}

function renderResults(m){
  var any=false,w=el("div","results fade");
  DATA.areas.forEach(function(a){
    var hits=a.stories.filter(matches);if(!hits.length)return;any=true;
    w.appendChild(el("h3","grp",a.name+" ("+hits.length+")"));
    hits.forEach(function(s){
      var l=el("a","res",null,{href:href(a.key,s.epic,s.id)});
      var r=el("div","l");add(r,el("span","sid",s.id),chip(s.status),prChip(s.epicObj.priority),el("span","smeta",s.epicObj.name));
      add(l,r,el("div","stitle",s.title));w.appendChild(l);
    });
  });
  if(!any)w.appendChild(el("div","empty","Nothing matches. Try a different search or clear the filters."));
  m.appendChild(w);
}

function renderCrumb(){
  var c=$("crumb");c.textContent="";
  var parts=[];
  parts.push({t:"All areas",h:"#/"});
  if(route.view==="epics")parts.push({t:"All epics",h:"#/epics"});
  if(route.area&&areaByKey[route.area])parts.push({t:areaByKey[route.area].name,h:href(route.area)});
  if(route.epic&&epicById[route.epic])parts.push({t:route.epic+" "+epicById[route.epic].epic.name,h:href(route.area,route.epic)});
  if(route.story&&storyById[route.story])parts.push({t:route.story,h:href(route.area,route.epic,route.story)});
  parts.forEach(function(p,i){
    if(i)c.appendChild(el("span",null,"\u203a",{"aria-hidden":"true"}));
    if(i===parts.length-1)c.appendChild(el("span",null,p.t,{"aria-current":"page"}));
    else{var a=el("a",null,p.t,{href:p.h});c.appendChild(a)}
  });
}

function render(){
  var m=$("main");m.textContent="";
  renderCrumb();
  var a=route.area&&areaByKey[route.area];
  var inArea=a&&!a.pending;
  $("exp").hidden=$("col").hidden=!inArea;
  var isEpics=route.view==="epics";
  if(isEpics&&!F.q)renderEpics(m);
  else if(filtering()&&!(inArea&&!F.q))renderResults(m);
  else if(inArea)renderArea(a,m);
  else renderAreas(m);
  if(focusKey){var f=m.querySelector('[data-k="'+focusKey+'"]');if(f)f.focus({preventScroll:true});focusKey=null}
}

function parse(){
  var p=(location.hash||"").replace(/^#\/?/,"").split("/").filter(Boolean).map(decodeURIComponent);
  var r={area:"",epic:"",story:"",view:""};
  if(p[0]==="epics")r.view="epics";
  else if(p[0]&&areaByKey[p[0]]){r.area=p[0];
    if(p[1]&&epicById[p[1]]&&epicById[p[1]].area.key===p[0]){r.epic=p[1];
      if(p[2]&&storyById[p[2]]&&storyById[p[2]].epic.id===p[1])r.story=p[2]}}
  return r;
}
function onRoute(){
  route=parse();
  if(route.epic)openE[route.epic]=true;
  if(route.story)openS[route.story]=true;
  render();
  var target=route.story?"story-"+route.story:route.epic?"epic-"+route.epic:null;
  if(target&&!noScroll){var t=$(target);if(t){var rm=window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;t.scrollIntoView({block:route.story?"center":"start",behavior:rm?"auto":"smooth"})}}
  else if(!noScroll&&!target)window.scrollTo(0,0);
  noScroll=false;
}
function go(h){if(location.hash===h)onRoute();else location.hash=h}
function replace(h){try{history.replaceState(null,"",h)}catch(e){location.hash=h}route=parse()}
function toggleEpic(a,e){
  focusKey="e-"+e.id;
  if(openE[e.id]){delete openE[e.id];e.stories.forEach(function(s){delete openS[s.id]});replace(href(a.key));render()}
  else{noScroll=true;go(href(a.key,e.id))}
}
function toggleStory(s){
  focusKey="s-"+s.id;
  if(openS[s.id]){delete openS[s.id];replace(href(s.area.key,s.epic));render()}
  else{noScroll=true;go(href(s.area.key,s.epic,s.id))}
}
function setAll(open){
  var a=areaByKey[route.area];if(!a)return;
  a.epics.forEach(function(e){if(open)openE[e.id]=true;else delete openE[e.id];e.stories.forEach(function(s){if(open)openS[s.id]=true;else delete openS[s.id]})});
  if(!open)replace(href(a.key));
  render();
}
$("exp").addEventListener("click",function(){setAll(true)});
$("col").addEventListener("click",function(){setAll(false)});
$("dclose").addEventListener("click",function(){setDrawer(false)});
document.addEventListener("keydown",function(ev){
  if(ev.key==="Escape"&&!$("drawer").hidden)setDrawer(false);
  else if(ev.key==="/"&&!/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)){ev.preventDefault();$("q").focus()}
});
var tm;
$("q").addEventListener("input",function(){clearTimeout(tm);tm=setTimeout(function(){F.q=$("q").value.trim();render()},120)});
[["fs","status"],["fp","pri"],["fo","owner"]].forEach(function(x){$(x[0]).addEventListener("change",function(){F[x[1]]=$(x[0]).value;render()})});
window.addEventListener("hashchange",onRoute);
window.addEventListener("beforeprint",function(){var a=areaByKey[route.area];if(a&&!a.pending)setAll(true)});
$("foot").textContent="Generated by docs/roadmap/build-master-roadmap.mjs from the area plan files. Do not edit by hand."+(DATA.warnings.dangling.length?" "+plural(DATA.warnings.dangling.length,"referenced id")+" match no story or epic (dashed chips); run the generator with --list to see them.":"");
renderTop();onRoute();
})();
</script>
</body>
</html>
`;

// ---- main (after TEMPLATE is initialised)
const args = process.argv.slice(2);
const sets = []; let doList = false;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--set') sets.push(...str(args[++i]).split(',').filter(Boolean));
  else if (a.startsWith('--set=')) sets.push(...a.slice(6).split(',').filter(Boolean));
  else if (a === '--list') doList = true;
  else if (a === '-h' || a === '--help') { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 6).join('\n')); process.exit(0); }
  else { console.error('Unknown argument: ' + a); process.exit(1); }
}
if (sets.length && !setStatuses(sets)) process.exitCode = 1;
const areas = loadAll();
if (doList) list(areas);
else build(areas);

