# Resume Builder — decisions you may want to veto

One page. Each line is what `docs/RESUME-BUILDER-DESIGN.md` assumes; the default stands unless you say
otherwise. Written 2026-10-11, branch `resume-builder`.

| # | Decision | Recommended default | The alternative, and why it lost |
|---|---|---|---|
| 1 | **Profile: wrap, not migrate** | Keep `bio.payload` as is; new `profile_item` table for experience/education/skills/etc.; lazy seed from the default resume | A new `profile` table would force an extension release and re-key the 10.3 suggestions for no gain |
| 2 | **No profile variants** | One profile; a target (SWE vs PM) is a built resume with a `target` label | Variants double the extension's sync surface and duplicate identity data |
| 3 | **Resume document = JSON beside `resume`** (`resume_doc`, 1:1) with `parsed_json` re-derived on every save | Projection keeps the extension, matcher, tailor and ATS score working unchanged | Columns on `resume` would push a 100 KB doc through every extension pull |
| 4 | **Templates are code in `@kiwiply/ui`**, not DB rows; switching = change one string | Lossless by construction; adding a template is one file + a snapshot test | A template table would only mirror the registry |
| 5 | **PDF = Chromium printing the same HTML** via a `chromium` Compose sidecar + `playwright-core` | Preview and PDF are byte-identical; the PDF is stored through the existing `/api/resumes/{id}/file` so the extension can attach it | `@react-pdf/renderer` = a second render tree that drifts; Java PDF libs cannot render the React template. **Open:** sidecar vs Chromium inside the web image (§11.1) |
| 6 | **Page-fit is a deterministic 7-step ladder** stored in the theme | Output equals preview; AI "shorten" only when the ladder ends | Pure AI fitting is unpredictable and costs budget |
| 7 | **All builder AI is Pro/Autopilot**; Free gets the full builder, 3 templates, PDF/TXT, deterministic lint | Matches the locked "no server AI on Free except parse" rule | A free monthly taste of "Stronger bullets" (§11.2) — your call |
| 8 | **Suggest → diff → accept, no streaming** | Proposals are checked on the server before anyone sees them (13.4 pattern generalised) | Streaming would show unchecked text |
| 9 | **No rich text in bullets** (B/I/U dropped from the board's toolbar; replaced by writing lint) | ATS parsers strip formatting; plain text is what gets matched | Keeping the toolbar would promise formatting that never survives |
| 10 | **Three templates at launch** (Modern, Classic, Compact — Compact flagged "caution") | Enough to show lossless switching; Minimal + Creative in R7 | Five at launch (§11.3) |
| 11 | **Built + uploaded resumes share the cap** (3 / 25 / 50); exports and versions never count | Consistent with "downgrade never deletes" | Separate caps complicate the 402 copy |
| 12 | **New dependencies**: `@dnd-kit` (web), `playwright-core` (web, server), `vitest` + Testing Library (dev), `chromium` sidecar (ops) | Each has one job; none enters the extension engine | zustand / zod / a rich-text editor were rejected |
| 13 | **Versions**: auto every ≥ 10 min of change + on every switch/apply/import, keep 30 + named | Cheap history without a flood of rows | Per-keystroke versions |
| 14 | **DOCX, share links, photos are R7** (growth), not v1 | Keeps the skeleton small; PDF + TXT cover ATS and recruiters | — (§11.4 asks about share links) |
| 15 | **Profile onboarding has three paths** (Upload / Paste / Start fresh) into one card-by-card review | Confirm-not-type; no LinkedIn API (paste only) | A single "upload" path leaves phone-first users stuck |

## Answers recorded 2026-10-11 (user said "go with the recommendations")
- **§11.1 PDF engine:** `chromium` sidecar in Compose (recommended default stands).
- **§11.2 Free AI:** all builder AI stays Pro/Autopilot; no free taste.
- **§11.3 Launch templates:** three (Modern, Classic, Compact); Minimal + Creative in R7.
- **§11.4 Share links:** out of v1 (R7 only).
- **Storage (new, user decision):** stay **local for now**. All file bytes (built-resume PDFs, uploaded resumes) go through one `FileStorage` seam with a **local-filesystem driver** as the default in dev/prod-for-now; the **S3 driver is wired in later** by configuration only. R0.6 must not call S3 directly. Existing S3 resume upload code stays behind the same seam.
