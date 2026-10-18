# 54 — Frontend design: three views, one job, one details experience (DESIGN, proposal)

> Implements ADR-024 D-15. Theme: the **ACME enterprise dashboard theme** (tenant tokens: `bg-accent`, `text-accent-deep`, `bg-accent-soft`, `border-line`, `bg-paper`, `text-ink`, `bg-v2-*-soft`; no hex literals — ESLint enforces), never the Kiwiply consumer theme. Mascot: enterprise bee only (`EnterpriseMascot`, one per view). Icons from `@kiwiply/ui`; new shared visual → `packages/ui` first.

## 1. What exists (V) and what is reused
- Marketer pages, registry pattern, `parts.tsx` (`KpiTile`, `Head`, `HelpBannerCard`, `Empty`, `CardSkeleton`) — `web/src/components/ent/marketer-ws/**`.
- Drawers: `JobSheet` (`marketer-ws/jobs/JobsParts.tsx`, SideSheet overlay 500 px, **no narrow handling**), `ReviewDrawer` (`matches/MatchParts.tsx:154-220`, `useNarrow()` → fullscreen, ErrorState + skeleton — the best template), `ProfileDrawer`, `ResumeDrawer`, `DetailDialog`.
- Primitives: `SideSheet` modes `push|overlay|fullscreen` (`packages/ui/src/primitives/SideSheet.tsx`), `useNarrow()` = `(max-width: 767px)` (`packages/ui/src/enterprise/sheets.tsx:30-34`), `BottomSheet`, `useBottomBar`, `ReasonSheet`, `HistoryDrawer`, `TimelineFeed`, `ConsentChip`, `ReadinessRing`, `JobFitReport` (presentational, reusable), `FunnelChart`, `DonutChart`.
- Gaps (V): no consultant page/lib/BFF; `JobSheet` not mobile-ready; no shared cross-workspace job component (everything imports `../parts` inside `marketer-ws`).

## 2. Information architecture (consultant workspace `/w/consultant/**`)
Nav already defined in `workspaces.json` (13 items). This design covers **Matches** (`/w/consultant/matches`), **Assigned Opportunities** (`/w/consultant/opportunities`) and adds **Job Discovery** (`/w/consultant/jobs`, new nav item `jobs`, `needs: opportunities.respond | applications.manage`; add to `workspaces.json` + doc 16 §5.3 in the same change, WorkspaceDocSyncTest). Detail routes: `/w/consultant/jobs/[id]` (compact screens). Registry: `web/src/components/ent/consultant-ws/registry.tsx` (mirror of `marketer-ws`) and one branch in the catch-all page (`workspace === "consultant"`), as done for marketing.

## 3. Shared building blocks (new, role-neutral) — `web/src/components/ent/jobs/`
| Component | Responsibility | Used by |
|---|---|---|
| `JobCard` / `JobRow` | title, client, location+workMode chips, rate label, source badge (logo via `SourceLogo`), posted, skills chips, state chips (`saved`, `match 94%`, `assigned: New`) | all three lists, marketer Discovery |
| `JobFilters` | keyword, skills, location, work mode, contract type, pay range, experience, posted date, source (the brief's list) | Discovery, Matches (subset) |
| `MatchScoreBadge` | score chip green ≥ high-confidence, amber else; "Rule-ranked" vs "AI" label (`AiDisclosure`) | Matches, Assigned, Discovery |
| `WhyYouMatch` + `SkillGaps` | ticks, gaps, availability fit, resume need (from `components`/`explanation`) | detail (match/assignment) |
| `AssignmentPanel` | assigned by, date, priority, due, marketer note, next action, allowedActions buttons | detail (assignment) |
| `SubmissionPanel` | pinned resume (id/version/stale), approval state, authorize/reject/revoke, status | detail (submission/assignment) |
| `JobDetailsView` | the shared body (sections below), driven by `context` and the server DTO | drawer + screen |
| `JobDetailsDrawer` | right-side `SideSheet` wrapper (≥ 1024 px) | lists |
| `JobDetailsScreen` | full page with back action (< 1024 px) | route `/w/consultant/jobs/[id]` |
| `useCompact()` | `(max-width: 1023px)` hook (new in `packages/ui/src/enterprise/sheets.tsx`, sibling of `useNarrow`) | wrapper selector |

## 4. Responsive behaviour (the user's rule)
- **Desktop/web (≥ 1024 px):** right-side slide-over `SideSheet mode="overlay"` width **520 px** (`ReviewDrawer` width), closes on scrim/Esc, URL gets `?job=<id>` so a refresh/restoring keeps it; focus trap + return focus (existing SideSheet behaviour). Lists keep their layout behind it.
- **Tablet and mobile (< 1024 px):** **dedicated details screen** reached by navigation (`router.push('/w/consultant/jobs/<id>?from=matches')`), sticky top bar with a clear **Back** that returns to the originating list with its scroll/filter state preserved (query string, not component state), sticky bottom action bar (`useBottomBar` pattern, 44 px targets, one primary action). Tablet decision: 768–1023 px uses the same screen as phones (a 520 px overlay on a 768 px viewport leaves an unusable list; a two-pane layout is deferred). Evaluate in the usability test (doc 57): if tablets ≥ 900 px prefer a split view, raise the breakpoint constant in one place.
- Lists: table ≥ 1024 px; cards < 1024 px (no horizontal page scroll at 390 px, tables scroll inside their card — existing rule).
- Today's `useNarrow` (767 px) stays for dialogs/sheets that already depend on it; `useCompact` is only for the job-details choice.

## 5. Sections of `JobDetailsView` (contextual, server-driven)
Always: **Header & company** (title, client — maybe masked, location, work mode, posted, source badge) · **Employment details** (type, duration, experience, positions) · **Compensation** (only if the DTO has it) · **Role description** (sanitised text, clamp + "Show more") · **Skills & requirements** (required/preferred chips, work-authorization text) · **Source & posting details** (source, posted/first seen, "View original posting" only when `url` present).
`context ≥ match`: **Match score** + **Why you match** + **Skills gaps** + **Availability fit** + **Preferred resume**.
`context = assignment`: **Assigned by / date / priority / due** + **Marketer notes** (the note addressed to me) + **Next action** + response actions (**Interested / Decline / Request details / Request resume change**) + **Timeline** (`TimelineFeed`).
`context = submission`: **Submission / application status** + **Resume selection** (pinned version, stale warning) + **Approve submission** (authorize, with explicit client + version copy, E1 wording "Kiwiply never submits for you").
A consultant opening an assigned job from Discovery sees the assignment sections too *only because the server DTO says the job is assigned to them* (entry point never grants data; `context=assignment` for an unassigned job is a 404).

## 6. Actions and states per entry point
| Entry | Actions (rendered from `allowedActions[]`) |
|---|---|
| Discovery | View details · Save/Unsave · Express interest (creates a self-suggested match + marketer task) · Find similar (filters) · Apply (opens the *original* posting in a new tab if `url`, then offers "I applied" recording) |
| Matches | View match · Save · Express interest · Apply · Ask marketer · Not for me |
| Assigned | View details · Interested · Decline · Request details · Request resume change · Authorize submission (when `submission.approvalState = AWAITING_APPROVAL`) |
Every write: optimistic UI with rollback, one toast, `Idempotency-Key`, disabled-while-pending, 409 `VERSION_CONFLICT` → reload prompt. Feature-disabled states: the server omits actions and returns `licenseNote` (e.g. AI scoring not licensed) → the page shows the rule score with "Rule-ranked" and an informational (not nagging) line; no feature is hidden by the client alone.

## 7. Empty / loading / error
Skeletons per card; honest empty copy per page (doc 16 §5.3: "Nothing assigned yet", "Run a match to see suggestions", "Pick a skill to search"); `ErrorState` with retry; mascot once per view (`ClaimsMascot`); 404/denied → "This page isn't part of your role".

## 8. Cache/leak safeguards (frontend)
Client caches (if SWR/React Query is introduced) key by `[orgId, role, path, params]`; the tenant host is part of the key (`orgId` comes from the session, not from the URL alone); on host/tenant switch all caches are cleared. Detail drawers never render data from a previous org's response (reset on `orgId` change). The details DTO has no field a marketer-only section could populate.

## 9. Accessibility and tests
Drawer: role="dialog", labelled, focus trap, Esc, return focus; screen: heading + back landmark; chips have text, not colour alone; bottom bar `aria-live` for action results. Component tests: sections per context, narrow vs wide wrapper, allowedActions rendering, 404 handling; Playwright: tablet 820×1180 and phone 390×844 journeys (doc 57).

## 10. Marketer-side reuse
`JobSheet` is replaced by `JobDetailsView` with `context=marketer` (adds best-matches-among-my-consultants, Assign, adopt/merge actions, occurrences list). One component, three roles' DTOs.
