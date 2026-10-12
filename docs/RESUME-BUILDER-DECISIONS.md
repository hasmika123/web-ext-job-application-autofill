# Resume Builder — decisions v2 (board vs v1 conflicts, and the defaults you may veto)

One page. Written 2026-10-12 for `docs/RESUME-BUILDER-DESIGN.md` v2. Each row is what the design
assumes; **"needs user OK"** rows are the conflicts between the v3 boards (or the 2026-10-12
requirements) and the v1 decisions, resolved the way the design proposes. Everything else is a default
that stands unless vetoed. The 2026-10-11 answers (Chromium sidecar, local-first storage, no Free AI
taste, share links deferred) are kept except where the boards forced a change (rows 2, 4, 13).

## A. Board / requirement vs v1 — resolutions (needs user OK)

| # | Conflict | Resolution in DESIGN v2 | Status |
|---|---|---|---|
| 1 | Board toolbar B / I / U / • / 1. / 🔗 vs v1 #9 "no rich text" | **Constrained inline marks** (b, i, u, link; summary/bullet lists) stored as offset ranges beside plain text (§3.3); rendered only when the template's capability allows; always stripped from the ATS text export and the `StructuredResume` projection; **no rich-text editor dependency** (two-layer `MarkedTextarea`) | needs user OK |
| 2 | Board shows five templates vs v1 #10 "three" → **user clarified: boards are layout only; templates come later** | **Open registry + capability model** (§6): every template declares `ats`, photo, marks, lists, graphics, theme controls, max pages, sections, custom sections, headings, date styles; ATS templates declare `ATS_STRICT` and must pass the parse-check gate; the editor constrains its controls per capability; switching is lossless with a hidden-content notice. Only Modern exists; a second template is R7.1 when designs arrive | **decided by the user (2026-10-11)** — confirm the capability list |
| 3 | Customize Template = accent · font · Spacing · Page Length vs v1 sliders | Theme v2 (`spacing` preset, `fit.target` = Page Length; `size/density/margin` derived; the fit ladder becomes deltas on the preset and reproduces v1 exactly for "Normal") (§4) | needs user OK |
| 4 | Board header photo vs v1 #14 "photos in R7" | Photo now (R7.4, after the editor and save pipeline): upload → square crop (no dependency) → EXIF-stripped JPEG via `FileStorage`; shown only by templates with `photo: true`; **off by default** on every template; region note (US/CA/GB/AU/IE/NZ discouraged); admin switch `feature.resume_photo.enabled` (§5) | needs user OK |
| 5 | Swap Section drag of sections **and items** | `@dnd-kit` sortable trees with keyboard sensor + ↑ ↓ buttons; items never leave their section; **Personal Information is listed with a disabled handle** (always first) (§10.3.3) | needs user OK (the pinned header row) |
| 6 | Add Section incl. Custom Section + Interests | New `INTERESTS` kind; Custom Section = CUSTOM with a title; rows react to the template's capability (disabled "Not in this ATS template" / "Limit reached (ATS)") (§10.3.1) | needs user OK |
| 7 | Insights / Resume Score (Free, deterministic) vs v1 writing lint + Pro ATS badge | One TypeScript engine (`score.ts`, §11) runs live in the editor and in the BFF on save (Spring stores the number, never evaluates); ruleset `v1` with five board checklist lines (+ an ATS group on ATS templates); weights/thresholds/copy are settings; the Java `AtsChecks` stays for uploaded resumes | needs user OK (TS, not Java) |
| 8 | AI Suggestions tab (count badge, carousel, Apply / Preview) + Rewrite with AI | New `SUGGEST` task producing up to 5 checked suggestion cards per document hash (manual refresh by default), `REWRITE` per section/bullet; all Pro/Autopilot; suggest → diff → accept; truth checks drop violations silently (§13) | needs user OK (auto-refresh off by default) |
| 9 | Job Match BETA + Tailor to Job | Deterministic Free engine (dictionary skills, title/years, industry, education; §12) with an explainability record; **tailoring creates a new tailored version linked to the job**, never mutates the base; AI tailor runs only on a tailored copy; Pro adds keyword *placements* (evidence in the user's own text) and never invents skills; legal posture: not an AEDT (§12.8) | needs user OK |
| 10 | ↑ ↓ on section headers appear only on two of the four boards; item controls differ per board | Section headers always show ↑ ↓ · ⋮ · 🗑; item rows always `✎ · ⋮ · 🗑`, with a drag grip while the Swap Section panel is open; ↑ ↓ for items live in ⋮ (§10.16) | needs user OK |
| 11 | Board centre = the resume edited inline (no separate preview) vs v1 form + live preview | **Document canvas** in the board's editor skin (template-independent; follows accent/font when allowed); the template render is seen in **Print layout / PDF view** (right side-nav) and the picker thumbnails. Rejected: contentEditable over the template render (fragile, fights undo) (§10.5) | needs user OK |
| 12 | Download ▾ with DOCX | Proposed new dependency **`docx`** (npm, MIT, server-only) generating a single-column DOCX from the document (R7.3); menu item disabled "Coming soon" and `feature.resume_docx.enabled=false` until approved (§14) | **needs user approval (dependency)** |
| 13 | "Saved 2 minutes ago" copy vs R0's "Saved · 2 min ago" | Copy changed to the board's: "Saved just now" / "Saved N minutes ago" / "Saved N hours ago"; suffix "· PDF updating…" while the stored PDF is behind (§10.2, §8.5) | default |
| 14 | PDF view renderer | Browser-native PDF viewer in an `<iframe>` from a blob URL (no new dependency); fallback "Open PDF / Download" when the browser can't inline PDFs. Alternative pdf.js on the web = new web dependency → not proposed (§10.8) | default; say if you want pdf.js |
| 15 | Name of a resume: `resume.label` vs `doc.meta.title` (R0.3 synced label ← title) | **`resume.label` is the truth** (rename in the header bar / Resume settings); the server writes `meta.title`/`meta.target` mirrors on every doc write; works for uploaded resumes too (§8.6) | needs user OK (flips R0.3's direction) |
| 16 | Where metadata/sharing lives in the UI | The **resume header bar** board (`editor-metadata-header.webp`) is the quick layer; **Resume settings** right sheet (from the header ⋮) is the full layer; no extra gear button in the top bar (§10.12, §10.16) | default |
| 17 | Save / Save & Download vs the board's top bar (Download ▾ only) | Autosave stays; a **Save** button (secondary, left of Download ▾) = explicit checkpoint (version `MANUAL`) + immediate PDF; **Download ▾** = Save & Download PDF / TXT / DOCX + Print layout / PDF view (§10.15) — one added control on the board's top bar | needs user OK |
| 18 | New resume: template choice in the chooser? | **No template step**: the chooser (Use my profile · Upload a resume · Copy an existing resume) names the resume and opens the editor with the default template; the picker is one click away (§10.14) | needs user OK |
| 19 | Version compare in v1? | **Yes** — word diff of that version's ATS text vs the current one (reuses `DiffText` + `renderText`; no dependency) (§10.16) | default |
| 20 | "Shared with Recruiters" meaning | **Revocable share links for people without a Kiwiply account** (expiry, view count, optional PDF download). Not a public listing or "visible to employers" directory (none exists; nothing public by default); not the org marketer (that is Visibility › My organization under the member's FULL consent) (§10.16) | needs user OK |
| 21 | "Master Resume ▾" | `role = MASTER \| TAILORED`; the selector navigates within the family (master ↔ tailored children) and offers "Tailor for a job…"; a tailored resume can "Pull changes from master" (diff) or "Make this a master" (detach); the role never flips in place (§8.9) | needs user OK |
| 22 | Who renders the async PDF | The **web** process (it owns the Chromium client): a leased queue on `resume_doc` rows polled by `web/src/lib/pdf-jobs.ts`; settle 15 s after the last save, immediate on checkpoints/template switch/leave; no PDF history (§8.5). Alternative: a separate worker container — rejected on the shared box for now | needs user OK |
| 23 | Score/match persisted values | Computed in the BFF (Node, same TS code) and stored by Spring as opaque JSON — never trusted from the browser, never evaluated in Java | default |
| 24 | Specific-people sharing | Only existing Kiwiply accounts (by email → login), role VIEW (EDIT reserved in the schema, not grantable: 422); "They need a Kiwiply account — send them a link instead" | default |

## B. Platform seams the resume stories build themselves (so Sonnet is never blocked)

| Not-yet-built platform story | What the R story builds instead (named so the platform story adopts it) |
|---|---|
| A5.1 / A5.7 / A5.9 settings, feature registry, config endpoint | `ResumeBuilderSettings` + `ResumeBuilderSettingKeys` (typed, bounded, over `app_setting`) + `GET /api/profile/resume-builder/config` (R2.0) |
| B1.2 entitlements v2 | `ResumeEntitlements.builderAiAllowed(login)` over `EntitlementService.isPro` (R4.1); caps stay the R0.3 constants until B1.6 |
| I0.3 AiGateway, I0.6 daily caps, I0.10 copy kit | `ResumeAiService.callModel()` over `AiBudgetService` + `AiMeteringService` + `AiProvider`; local daily-cap count; local refusal strings (R4.1) |
| I2.1 PromptRegistry, I2.2/I2.3 evals | prompts as `Prompt` records in `ResumePrompts`; golden sets in the I2.2 path; `ResumeAiEvalTest` (R4.1, R4.7) |
| I3.2 AiTruthChecks | **R4.1 creates `service/ai/guard/AiTruthChecks.java`** in the I3.2 shape by extracting the 13.4 checks |
| T1.1 SensitivePatterns | **R1.1 creates the shared library** (`service/privacy/SensitivePatterns.java` + `packages/ui/src/sensitive-patterns.ts` + fixture corpus) |
| T3.2 AiDisclosure | added to `@kiwiply/ui` by R4.2 if T3.2 has not landed |
| I4.6 embeddings synonyms | optional stage behind `resume.jobmatch.embeddings.enabled=false` |

## C. New dependencies (each needs your approval before the story that adds it starts)

| Package | Where | Story | Why | Status |
|---|---|---|---|---|
| `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` | web | R2.2 | sections/items drag with pointer, touch **and keyboard** sensors | pre-approved (v1 #12) |
| `docx` | web (server route only) | R7.3 | DOCX export generated from the document | **needs approval** |
| (none) for photo cropping, marks, PDF view, compare | — | — | hand-rolled per DESIGN (no `react-easy-crop`, no TipTap/Lexical, no pdf.js on the web) | — |
| `@axe-core/playwright` (dev) | web | R6.5 | a11y CI gate (also the trust program's choice) | needs approval (dev dep) |

## E. Added 2026-10-12 (dashboard boards)

| # | Conflict | Resolution in DESIGN v2 | Status |
|---|---|---|---|
| 25 | Org board reads like an employer ATS (Candidates, Interview Pipeline, Post a Job, "Shortlisted") | `/org/resumes` is a **consent-scoped consumer** of the member's sharing: documents only for FULL-paired marketers/coaches with "Include this resume" on; OWNER/ADMIN see readiness only; "Shortlisted" = the marketer's own marks (optionally per opportunity); "assign" = assign to an org opportunity (`job_assignment`, O10.5) or a marketer pairing; the nav keeps the org-v2 items. **Anything beyond this — ranking candidates, exposing resumes to client companies, employer-side scoring, posting jobs to external applicants — is a user decision, not designed** (§10.18) | needs user OK |
| 26 | Card thumbnails on "My Resumes" | Server PNG taken by the same Chromium render that makes the PDF (one screenshot per PDF job, cached by render hash through `FileStorage`); uploaded resumes get a placeholder; rejected: client-scaled previews (the list would carry every document) (§8.10) | default |
| 27 | "Active / Drafts / Archived" with Primary on the board | Lifecycle is derived: Archived · Draft (never checkpointed and no PDF) · Active; Primary is a flag chip (§8.10) | needs user OK |
| 28 | Popular Templates names on the board | Driven by the registry ∩ `resume.templates.enabled`, ordered by `resume.templates.popular`; "View all" = `/resume-builder/templates` gallery → the start chooser with the template preselected (§10.17) | default |
| 29 | Org "Archived" tab | The marketer's own "hide from my list" mark; a member's archived or draft resumes are never shown to an org (§10.18) | default |

## D. Remaining defaults (unchanged from v1 unless listed above)
Profile wrap-not-migrate · no profile variants · `resume_doc` beside `resume` with the projection on
every save · templates as code · Chromium sidecar PDF via `playwright-core` · page-fit ladder · all
builder AI Pro/Autopilot (no Free taste; no BYO on the web) · suggest → diff → accept, no streaming ·
built + uploaded share the cap · versions coalesced ≥ 10 min, keep 30 auto + named · onboarding three
paths · local-first `FileStorage` (S3 by config) · `/r/<token>` share pages carry `noindex`.
