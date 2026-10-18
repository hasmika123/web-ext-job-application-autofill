# Page: Consultant My Marketer (`/w/consultant/marketer`)

Board: `design/enterprise-consultant/marketer.webp`. Branch `ent-talent-consultant`. This page is the consultant's side of a two-role relationship: the consultant's own data is real, the marketer's half is clearly marked SAMPLE until the role branches merge.

## Endpoint
`GET /api/orgs/{orgId}/me-workspace/marketer` (BFF: `web/src/app/api/orgs/[orgId]/me-workspace/marketer/route.ts`, GET only). One call draws the page. The page is **read-only**: no writes, no new endpoints, no free text is accepted (so no PII scanner is needed).
- **Gate:** `ConsultantHomeService.requireSelf(me)`: roles flag on, ACTIVE member holding `opportunities.respond`, linked to a `consultant_profile` by `member_id`. Anyone else (owner, admin, marketer, other tenant, unknown org/login, consultant seat with no profile, flags off): the same generic **404**.
- **Scope:** every query takes `orgId` first plus the caller's own `consultant_id`. No id comes from the client.
- Code: `api/.../web/rest/ent/consultantws/ConsultantMarketerResource`, `service/ent/consultantws/ConsultantMarketerService` + `ConsultantMarketerDTO`; web `components/ent/consultant-ws/MarketerPage.tsx`, `lib/ent/consultant-ws/marketer.ts`; route `web/src/app/(tenant)/%5Ft/w/consultant/marketer/page.tsx` (the sibling `layout.tsx` wraps it in the shell).

## Real vs sample
| Block | Source | State |
|---|---|---|
| Your Marketer card (name, title, initials circle) | `marketer_assignment` (ACTIVE, own consultant) -> `org_member` (must be ACTIVE) -> `user` first/last name (else the seat's display label) ; title = `marketer_capacity.title_label` | real. No photo, email or phone is sent. No assignment: honest "No marketer assigned yet" state, contact buttons removed, Quick Actions disabled |
| Current Focus Opportunities | own `requirement_match` ASSIGNED (newest first) + own open applications not already listed; client and job from `client_requirement`/`client_account`; stage = application stage, or `MARKETING` when there is no application; next step = `talent_application.next_action` + `next_action_due` | real. **Priority is derived** from the match score (85+ High, 70+ Medium, else Low; no match row = Medium) because no per-opportunity priority column exists |
| Upcoming Follow-ups | own open `talent_application` next actions (with due date, not CLOSED) + own open `cws_task` rows with a due date, by date, 5 rows; status Overdue / Due today / Upcoming for applications, the task status for tasks | real. Time is always "All Day" (no time column exists) |
| Marketer's Focus for You | derived from own matches and skills: open match count, top 3 `consultant_skill`, assigned count, matches scoring 85+ | real (derived, no invented activity). Items with a zero count are not drawn |
| **Responsive / typically replies within 2 hours** badge | nothing measures it | **SAMPLE** (`responseBadge.sample = true`, `SampleMark`) |
| **Recent Messages** | cross-role (needs the marketer module) | **SAMPLE** (`messages.sample`, 4 generic messages using the real first names; empty when no marketer is assigned) |
| **Shared Action Plan** | cross-role | **SAMPLE** (`actionPlan.sample`, 4 generic items; empty when no marketer) |
| **Collaboration Notes** | cross-role | **SAMPLE** (`notes.sample`, 3 generic notes; empty when no marketer) |
| **Send Message / Schedule Call / View Calendar** and Quick Actions **Message Marketer / Request Resume Update / Ask About Opportunity / Schedule Call** | no messaging or calendar exists | open a small dialog "Messaging arrives with the marketing workspace ... Nothing was sent or scheduled." No pretend success. Quick Actions are disabled (with a tooltip) when there is no marketer |

When the roles merge: replace the four sample blocks in `ConsultantMarketerService` (`sampleMessages`, `samplePlan`, `sampleNotes`, the `Badge`) with the shared messaging / plan / notes tables and a measured reply time; drop the dialog in `MarketerPage.tsx`.

## Components
`MarketerPage` (client): `YourMarketer`, `ActionPlan`, `FocusOpportunities`, `RecentMessages`, `Followups`, `CollaborationNotes`, right rail `BeeCard` (help, "Ask a question" opens the help panel), `QuickActions`, `MarketerFocus`, `SoonDialog`. Shared pieces from `parts.tsx` (`Card`, `Pill`, `SampleMark`, `Empty`, table pieces, `useWorkspaceData`). `PageHeader`, `ClaimsMascot`, `ClaimsHelpCard` from the shell context (one bee per view). Layout: the Home grid (left two thirds in two columns on very wide screens, right rail one third); below `xl` everything stacks; tables scroll inside their card, so the page itself never scrolls sideways at 390px.

## New tables / migration
None. (Migration timestamp `20261103040000` was reserved but is not used.)

## Demo data
`ConsultantWsMarketerDemoSeeder.seed()` (not called from the bootstrap; the integrator wires it after `ConsultantWsDemoSeeder`). It only sets `next_action` / `next_action_due` (five stock steps, due in 2 to 15 days) on the open applications of consultants who are real seats (member_id != null: Anika, Ben, Sam) that have no next action yet. Idempotent: it never overwrites an existing next action. Marketer assignments already come from `TalentDemoSeeder` (Anika -> Sarah Chen, Ben -> Omar Haddad; **Sam has none**, which exercises the "No marketer assigned yet" state).

## Shared-file edits the integrator makes
- `OrgIsolationIT.COVERAGE`: add the route row `GET /api/orgs/{orgId}/me-workspace/marketer` (same kind as the Home row: consultant-only, own record, generic 404 for other tenants and non-consultants).
- `EnterpriseDemoBootstrap`: call `ConsultantWsMarketerDemoSeeder.seed()` after `ConsultantWsDemoSeeder`.
- `workspaces.json` / nav: the CONSULTANT menu needs a "My Marketer" entry linking to `/w/consultant/marketer` (Home already links there).
- `progress-tracker.md`.
- No `master.xml` include (no migration).

## Tests
- API `ConsultantMarketerResourceIT` (6 tests, real chain): own marketer name/title, focus rows (assigned newest first, CLOSED and unassigned left out, stage/priority/next step), follow-ups (own application next action + own open tasks by date), derived focus summary, sample flags; a second consultant's data and marketer never leak; no marketer = null + empty lists; inactive assignment not shown; other org / unknown login / owner / admin / marketer / profile-less consultant / flags off = generic 404. There are no write cases because the page has no writes.
- Web: `marketer.test.ts` (parser, labels, date block, relative time, fetch), `MarketerPage.test.tsx` (draws real data, Sample markers, honest dialog, empty state, 404 and failure).

## Known gaps
No Playwright journey and no pixel comparison against the board yet (no running dev server was used). The marketer shows initials, never a photo. The reply-time badge, messages, plan and notes are samples. "Priority" is derived from the match score. Follow-up times are not stored, so rows say "All Day".
