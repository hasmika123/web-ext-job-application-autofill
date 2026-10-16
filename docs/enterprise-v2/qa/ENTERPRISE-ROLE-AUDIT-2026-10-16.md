# Enterprise role audit — version2 9b3f1034, local real stack (2026-10-16)

Method: Playwright (real Chrome), one fresh context per person, every nav page at 1440x900 and 390x844, dialogs/tabs/drawers and key journeys. Evidence in this folder: shots/ (327 screenshots, `<person>-<page>-1440.png|-390.png`), `<person>-crawl.json`, `explore-*.json`, `journal-*.json`.

## Counts (Acme)
| Role | Pages | WORKS | PARTIAL | BROKEN | EMPTY | SAMPLE | SOON | MISSING |
|---|---|---|---|---|---|---|---|---|
| Sarah, admin | 26 | 13 | 3 | 0 | 0 | 0 | 7 | 3 |
| Sarah, marketing-mgmt | 8 | 0 | 0 | 0 | 0 | 0 | 0 | 8 |
| Omar, marketer | 14 | 12 | 1 | 1 | 0 | 0 | 0 | 0 |
| Anika, consultant | 20 | 7 | 6 | 1 | 1 | 4 | 1 | 0 |

All pages HTTP 200; WORKS pages show real seeded data; tab titles carry the org name. Acme org-admin writes are refused for demo accounts (403 "demo account"); consultant/marketer writes are not. Gamma (not a demo org) accepts all writes.

## Defects
- **D1 P0** Resume Builder crashes in the tenant shell (`/w/consultant/resumes/[id]`, also act-for `/w/[workspace]/resumes/[orgResumeId]`): "Error in the Server Components render". Suspected: server page passes `env={consultantEnv(orgId)}` / `actForEditorEnv` containing a function (`editorHref`) to the client `BuilderEnvProvider` — functions can't cross the server/client boundary. Seeded resumes' Edit only opens a details sheet, so the builder is unreachable.
- **D2 P0** "New resume for <consultant>" dead: Acme — all 34 consultants "No sign-in yet" (strict rule: Acme accounts are personal/SHARED). Gamma — newly added consultant Cora shows greyed; `consultant_profile.member_id` NULL; `ConsultantWriteService.create` (~143) never links an existing member and no UI links a consultant row to an account. Marketer-made-resume approval unreachable.
- **D3 P0** Gamma consultant (Dana) lands on "This page isn't part of your role"; `/api/orgs/4/me-workspace/{home,resumes,profile}` 404 — no consultant profile linked to her member.
- **D4 P0** Marketing Manager workspace: all 8 pages "This page is on the way" (no marketing-mgmt registry). Admin › Marketing Assignments is the only working equivalent.
- **D5 P1** Marketer Job Discovery shows "on the way": static `w/[workspace]/jobs/page.tsx` shadows the catch-all and returns ComingSoon when workspace ≠ admin; `marketer-ws/jobs/JobDiscoveryPage.tsx` never mounted.
- **D6 P1** Avatar menu: My profile / Notifications / Security → `/me` 404 with Kiwiply title (all roles). Connect extension shows "Extension not connected" toast without the extension (success path unverified).
- **D7 P1** Branding live preview blank (X-Frame-Options DENY) — FIXED on ent-demo-fixes / version2 56ff963f.
- **D8 P1** Acme demo can't show admin write journeys (403); inconsistent error copy (share-links toggle "Not saved…", branding swatch only logs 403).
- **D9 P1** Reports, Domains, Audit Logs placeholders; sidebar inconsistent: only 5 items carry "(soon)"; HR, Finance, Reports, Domains, Audit look live but are placeholders.
- **D10 P1** Consultant new-resume dialog contradicts the page: "Your profile is empty" and "no resume to copy" while profile is full and 5 resumes listed; new resume shows visibility "Team", not primary, though API says defaultResume:true.
- **D12 P1** Consultant workspace mostly SAMPLE / "not connected": SAMPLE on Home, My Marketer, Job Discovery, Assigned Opportunities, Submissions, Offers, Availability, Tasks, Activity Timeline, My Features; My Marketer actions "not connected yet"; Inbox disabled; "Ask a question" assistant off; banners say "until the marketing workspace is connected" though it's live.
- **D13 P1** Mobile 390: Marketing Home Job Stream Monitor table overflows (scrollWidth 466); Interviews auto-opens a bottom sheet covering the list; at 1440 marketer Home talent table clipped, Talent cards truncate.
- **D14 P1** Global search only matches page names ("Omar" → "No page matches").
- **D15 P1** Kiwiply branding leaks on tenant hosts: unknown tenant paths show Kiwiply 404 + title; system actor "by Kiwiply"; two icon links in head (platform favicon first — favicon rewrite FIXED in 56ff963f, recheck).
- **P2** dashboard donut legend overlap; Active Employees 13 vs 15; Invitations sparkline overlap; role descriptions leak "school or bootcamp (existing flow)"; missing resume 404 says "workspace isn't available"; Employees drawer clips search/Joined; Interviews table clipping; marketer Pending Approval stale drawer and "943 KB" beside "No file is stored"; raw "(on_site)"; opportunity "New" with "Interest sent"; Profile Strength 54% vs "All set"; Consultant Settings prefetch 404 `/settings`; future-dated Marketing Activities.

## Module status
domains (live flag, no page/API), roles (built), marketing (built; marketing-mgmt not built); billing, hrFinance, integrations, analytics, extensionWorkspaces — DEFERRED, not built (placeholders only).

## Test residue
Acme: Anika resume "QA Audit Resume" (1504), 1 submission approved, interest sent on 1 opportunity, "Project Manager" declined; Omar logged "QA audit activity". Gamma: team "QA Audit Team", dept "QA Audit Dept", invite qa.invitee@gamma.example.com, consultant Cora Lindahl (profile 200), marketer Marco Bellini with 1 assignment, share links switched on.
