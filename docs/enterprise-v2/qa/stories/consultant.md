# CON: Consultant workspace use-case stories (`/w/consultant/**`)

> Written 2026-10-14 against branch `ent-integration-all`. Sources read: `docs/enterprise-v2/consultant-workspace-merge-notes.md`, `consultant-job-source-flow.md`, `page-consultant-*.md`, `docs/HANDOFF-ENT-CONSULTANT-WORKSPACE.md`, `59-job-phase1-extension-flow.md`, the components under `web/src/components/ent/consultant-ws/**`, the demo seeders under `api/.../service/ent/consultantws/`, and `web/e2e/journeys/consultant-*.spec.ts`.
> Status vocabulary is the one in `00-README.md` section 6. **Every story marked AUTOMATED has a spec written in `web/e2e/stories/consultant/` that has not been run yet** (the coordinator runs the stack). Treat AUTOMATED as "spec exists, first green run pending", and downgrade to BLOCKED if the run proves otherwise.

## Story-fix log 2026-10-16 (branch ent-story-fixes)

Fixed in the specs, none weakened: **CON-01 and CON-30** (D12: Home and My Marketer no longer show Sample messages or a "Responsive" badge; the card says "No messages yet" and Send Message / Schedule Call / View Calendar are disabled with the reason), **CON-20** (the marketer's quick info exists only on jobs the marketer wrote it for, so the story opens one of those), **CON-42** (the toast, the card and the drawer all say "Negotiation requested"), **CON-44** (the story pinned "the first unchecked item", which stops matching once ticked: it now pins the item by id, so it is repeatable), **CON-47 and CON-57** (dropdowns re-open until the option is up), **CON-51** (the task list pages 8 at a time, ordered by due date: the story removes its own leftovers first and finds the new task by searching its name, so earlier runs cannot break it), **CON-56** (the security link goes to `/me#security`, the one basic My profile page).

## 1. Area overview

**Who:** the consultant (a staffing consultancy's placed or placeable contractor). Roles: `CONSULTANT`. Demo people: **Anika Rao** (available, 8 years, marketer Sarah Chen) and **Ben Okafor** (on a project, 7 years, marketer Omar Haddad). Sam Whitfield (suspended) and Nina Vogel (invited) cannot sign in.

**What the role does in the product:** the consultant sees only their own data (every endpoint is scoped to the signed-in member's `consultant_profile`; no endpoint takes a consultant id). They keep a career profile and resumes, look at the jobs their marketer loaded or matched to them, open the marketer's **source link**, apply on the job site **with their own Kiwiply extension** (Kiwiply never submits and has no auto-apply), approve or decline what the marketer prepared, follow applications, interviews and offers, and manage tasks, availability, notifications and privacy. The marketer prepares and the consultant submits (E1).

**Access rule (applies to every story):** the API gate is `ConsultantHomeService.requireSelf`: an ACTIVE member with permission `opportunities.respond`, linked to a consultant profile. Anyone else, another tenant, or flags off gets a generic **404** (never 403). In the UI that is "This page isn't part of your role".

**Pages that exist (20, sidebar order of the boards; Inbox was added by ent-inbox):** Home `/w/consultant`, My Career Profile `profile`, My Resumes `resumes`, My Marketer `marketer`, Job Discovery `job-discovery`, Job Matches `matches`, Assigned Opportunities `opportunities` (+ `opportunities/{id}`), My Applications `applications`, Submissions & Approvals `submissions`, Interviews `interviews`, Interview Prep `interview-prep`, Offers `offers`, My Placement `placements`, Availability `availability`, Tasks & Follow-ups `tasks`, Activity Timeline `activity-timeline`, Inbox `inbox`, My Features `features`, Notifications `notifications`, Settings `settings`. BFF/API for each: `/api/orgs/{orgId}/me-workspace/<home|profile|resumes|marketer|job-discovery/...|matches|opportunities|applications|submissions|interviews|interview-prep|offers|placements|availability|tasks|activity-timeline|features|notifications|settings>`.

**Not built / stand-ins (be honest in demos):** the marketer's side of the relationship does not exist yet, so the following are **seeded stand-ins marked `Sample` on screen**: marketer messages, shared action plan, collaboration notes and the "Responsive" badge; the source link, source name and quick info on jobs (`cws_job_source`, `https://jobs.example.com/demo-acme/<requirementId>`); the marketer-created submissions and client updates; offers and their timeline; placement project, manager, meetings and milestones; APPROVED/PENDING on vacation entries; My Features allowances. Send Message / Schedule Call open an honest "not connected" dialog. There is **no** in-app Apply (removed), no in-app job search beyond the marketer-loaded jobs, no AI-scored practice, no connected tools, no password/2FA on Settings, no placement documents. The extension step that turns "applied via the link" into an application is **not part of this branch** (documented gap in `consultant-job-source-flow.md`).

**Rules the stories prove (non-negotiables):** no auto-submit, no submit/apply button anywhere; no sensitive PII accepted (SSN-like text is refused with an alert, no photo, no DOB, no phone, no bank data); money on Offers and Placement is a record only and the consultant never sees a bill rate; nothing is sent by e-mail, SMS or push; tenant isolation (another host cannot read Acme's data).

## 2. Seeded data the stories depend on (the coordinator must verify on the live stack)

| Assumption | Source | Used by |
|---|---|---|
| Anika has a pipeline: about 8 matches (scores 94..74), 3 ASSIGNED opportunities, 6 applications (Prepared, Submitted, Under Review x2, Interview Scheduled, Rejected), exactly 3 upcoming interviews, 5 tasks ("Complete interview preparation", "Respond to marketer message", "Update resume with latest project", "Follow up on pending application", "Set availability for next month") | `ConsultantWsDemoSeeder.pipeline()` (one-time guard: runs only when the consultant has no tasks) | CON-01, 20-27, 32, 36, 50 |
| Anika: 3 certifications (AWS, Oracle Java SE 11, CSM), preferred roles incl. "Senior Java Developer", locations incl. "Remote", career goals text, work authorization | `ConsultantWsProfileDemoSeeder` | CON-10 |
| Anika: at least 5 resumes, exactly one primary, activity events | `ConsultantWsResumesDemoSeeder` | CON-13, 14 |
| Marketers: Anika -> Sarah Chen, Ben -> Omar Haddad; next steps on open applications | `TalentDemoSeeder.seedAssignments`, `ConsultantWsMarketerDemoSeeder` | CON-30, 31 |
| Every OPEN demo job has a source link `https://jobs.example.com/demo-acme/<id>`, a source name and a note, Sample-marked | `ConsultantWsJobSourceDemoSeeder` | CON-21, 25, 27, 28 |
| Anika: 3 pending submissions + 6 past (submitted, interview, not selected, approved, submitted, declined) | `ConsultantWsSubmissionsDemoSeeder` | CON-33, 34, 35 (34 and 35 each consume one pending row, so only three runs per database) |
| Anika: 5 offers (2 pending review, 1 negotiation, 1 declined, 1 accepted) | `ConsultantWsOffersDemoSeeder` | CON-40, 41, 42 (42 consumes a pending offer) |
| Ben: ACTIVE placement "Digital Platform Programme", manager "Alex Morgan", 7 checklist items, milestones, 4 meetings (2 with links), 3 activity rows; Anika has no active placement | `ConsultantWsPlacementDemoSeeder`; `TalentDemoSeeder` (Anika AVAILABLE, Ben ON_PROJECT) | CON-43, 44, 45 |
| Anika: 3 completed interviews, feedback on the two newest, one still pending feedback; join details on upcoming ones | `ConsultantWsInterviewsDemoSeeder` | CON-36 (records feedback once) |
| Availability: 4 calendar entries, work preferences, history | `ConsultantWsAvailabilityDemoSeeder` | CON-46, 47, 48 |
| Stories that write use unique names (`Date.now()`-based) and put the data back where possible (summary, skills, roles, certification, resume name/primary, availability status, privacy, calendar entry, task). Not reversible: interview feedback, interview details, practice sessions, a posted placement status note, an approved/declined submission, a negotiation request, a declined-then-reopened opportunity (reopen restores the status), "Need more info" question, express interest. | | |

## 3. Story index

| ID | Title | Persona | Spec file / test | Status |
|---|---|---|---|---|
| CON-01 | Home dashboard at a glance | Anika | `home-and-access.story.ts` CON-01 | AUTOMATED |
| CON-02 | Jump into work from Home | Anika | `home-and-access.story.ts` CON-02 | AUTOMATED |
| CON-03 | Walk the 20-item sidebar | Anika | `home-and-access.story.ts` CON-03 | AUTOMATED |
| CON-04 | Org Admin is told "not part of your role"; API 404 | Sarah | `home-and-access.story.ts` CON-04 | AUTOMATED |
| CON-05 | Another tenant's host cannot read Acme's data | Anika / beta host | `home-and-access.story.ts` CON-05 | AUTOMATED |
| CON-06 | Phone width: no sideways scroll | Anika | `home-and-access.story.ts` CON-06 | AUTOMATED |
| CON-10 | Review career profile | Anika | `profile-and-resumes.story.ts` CON-10 | AUTOMATED |
| CON-11 | Edit summary, add/remove skill, PII refused | Anika | `profile-and-resumes.story.ts` CON-11 | AUTOMATED |
| CON-12 | Add/remove preferred role and certification | Anika | `profile-and-resumes.story.ts` CON-12 | AUTOMATED |
| CON-13 | Review and preview resumes | Anika | `profile-and-resumes.story.ts` CON-13 | AUTOMATED |
| CON-14 | Rename, re-visibility, switch primary resume | Anika | `profile-and-resumes.story.ts` CON-14 | AUTOMATED |
| CON-20 | Search, filter, sort Job Discovery; open job details | Anika | `jobs-and-job-link.story.ts` CON-20 | AUTOMATED |
| CON-21 | Open the marketer's job link from Job Discovery | Anika | `jobs-and-job-link.story.ts` CON-21 | AUTOMATED (link click stubbed, no internet) |
| CON-22 | Bookmark a job, save/run/delete a search | Anika | `jobs-and-job-link.story.ts` CON-22 | AUTOMATED |
| CON-23 | Review Job Matches, insight, compare, save | Anika | `jobs-and-job-link.story.ts` CON-23 | AUTOMATED |
| CON-24 | Express interest in a match | Anika | `jobs-and-job-link.story.ts` CON-24 | AUTOMATED (consumes a match once) |
| CON-25 | Work Assigned Opportunities; drawer; Open job link | Anika | `jobs-and-job-link.story.ts` CON-25 | AUTOMATED |
| CON-26 | Need more info, decline with reason, reopen | Anika | `jobs-and-job-link.story.ts` CON-26 | AUTOMATED |
| CON-27 | Phase 1 job-link flow, consultant side | Anika | `jobs-and-job-link.story.ts` CON-27 | AUTOMATED up to "Open job link"; extension step BLOCKED (see CON-60) |
| CON-28 | Job without a link: disabled button with tooltip | Anika | `jobs-and-job-link.story.ts` CON-28 | BLOCKED: every seeded job has a link, so the spec only asserts the enabled state and notes it; state covered by unit tests |
| CON-30 | My Marketer: who, focus, follow-ups, messaging not connected | Anika | `pipeline.story.ts` CON-30 | AUTOMATED |
| CON-31 | Ben's marketer is Omar | Ben | `pipeline.story.ts` CON-31 | AUTOMATED |
| CON-32 | Follow applications; filter, sort, timeline | Anika | `pipeline.story.ts` CON-32 | AUTOMATED |
| CON-33 | Submissions & Approvals overview and review | Anika | `pipeline.story.ts` CON-33 | AUTOMATED |
| CON-34 | Approve a submission | Anika | `pipeline.story.ts` CON-34 | AUTOMATED (consumes a pending row) |
| CON-35 | Decline a submission with a reason | Anika | `pipeline.story.ts` CON-35 | AUTOMATED (consumes a pending row) |
| CON-36 | Interviews: calendar, join details, feedback | Anika | `pipeline.story.ts` CON-36 | AUTOMATED |
| CON-37 | Interview Prep: checklist, practice session, history | Anika | `pipeline.story.ts` CON-37 | AUTOMATED |
| CON-38 | Ben's pipeline is his own | Ben | `pipeline.story.ts` CON-38 | AUTOMATED |
| CON-40 | Offers overview, compare, timeline | Anika | `career.story.ts` CON-40 | AUTOMATED |
| CON-41 | Accept dialog explained, cancel (no write) | Anika | `career.story.ts` CON-41 | AUTOMATED |
| CON-42 | Ask to negotiate | Anika | `career.story.ts` CON-42 | AUTOMATED (consumes a pending offer) |
| CON-43 | Active placement, no rate shown | Ben | `career.story.ts` CON-43 | AUTOMATED |
| CON-44 | Onboarding checklist, status update, client details | Ben | `career.story.ts` CON-44 | AUTOMATED |
| CON-45 | No active placement state | Anika | `career.story.ts` CON-45 | AUTOMATED |
| CON-46 | Availability overview | Anika | `career.story.ts` CON-46 | AUTOMATED |
| CON-47 | Add and delete a personal day off | Anika | `career.story.ts` CON-47 | AUTOMATED |
| CON-48 | Change availability status, restore | Anika | `career.story.ts` CON-48 | AUTOMATED |
| CON-50 | Tasks overview, search, filters | Anika | `workday.story.ts` CON-50 | AUTOMATED |
| CON-51 | Create, complete, edit, delete a task | Anika | `workday.story.ts` CON-51 | AUTOMATED |
| CON-52 | Task with an ID number is refused | Anika | `workday.story.ts` CON-52 | AUTOMATED |
| CON-53 | Activity Timeline filters, export | Anika | `workday.story.ts` CON-53 | AUTOMATED |
| CON-54 | My Features | Anika | `workday.story.ts` CON-54 | AUTOMATED |
| CON-55 | Notifications triage and preferences | Anika | `workday.story.ts` CON-55 | AUTOMATED |
| CON-56 | Settings overview, honest security/tools | Anika | `workday.story.ts` CON-56 | AUTOMATED |
| CON-57 | Privacy and analytics choices | Anika | `workday.story.ts` CON-57 | AUTOMATED |
| CON-70 | Guided connect of her own Gmail; wrong or blocked code gets a calm sentence | Anika | `inbox.story.ts` CON-70 | AUTOMATED |
| CON-71 | Connect: live Gmail check passes, mailbox read, password never shown again | Anika | `inbox.story.ts` CON-71 | AUTOMATED |
| CON-72 | Mail moves her applications and offers new ones, "from your inbox"; add at Interview; dismiss | Anika | `inbox.story.ts` CON-72 | AUTOMATED (consumes the Harbor Cloud suggestion once) |
| CON-73 | Disconnect forgets the password and every message | Anika | `inbox.story.ts` CON-73 | AUTOMATED |
| CON-74 | The organization sees none of it (Org Admin and marketer: 404, no mail in their pages) | Sarah, Omar, Anika | `inbox.story.ts` CON-74 | AUTOMATED |
| CON-75 | Taking the add-on off stops the inbox and says why; putting it back resumes it | Anika | `inbox.story.ts` CON-75 | AUTOMATED (needs docker + the QA MySQL container; skips itself otherwise) |
| CON-76 | A license without the add-on: locked state, API 402 | Ben | `inbox.story.ts` CON-76 | AUTOMATED |
| CON-77 | One consultant's mailbox is invisible to another | Anika, Ben | `inbox.story.ts` CON-77 | AUTOMATED |
| CON-80 | Create a resume in the builder inside the workspace (four sources) | Anika | (spec pending) | VERIFIED IN BROWSER 2026-10-16 (manual walk, no suite yet) |
| CON-81 | Edit in the builder: autosave, no share/delete/AI | Anika | (spec pending) | VERIFIED IN BROWSER 2026-10-16 (autosave, menu, no share/delete/AI text) |
| CON-82 | The organization license caps resumes | Anika | (spec pending) | BLOCKED (not run: needs the per-organization cap lowered) |
| CON-83 | A sensitive value in an upload never gets in | Anika | (spec pending) | BLOCKED (not run in a browser; clean PDF and DOCX uploads verified in CON-80) |
| CON-84 | Approve or send back a resume the marketer made | Anika, Sarah | (spec pending) | BLOCKED (cannot run on Acme: no org accounts; needs Gamma + GAMMA_DEMO_PASSWORD) |
| CON-85 | A marketer edit sends the resume back to waiting for approval | Anika, Sarah | (spec pending) | BLOCKED (cannot run on Acme; needs Gamma + GAMMA_DEMO_PASSWORD) |
| CON-88 | Prepare selected openings: one tab per job, filled with her own profile, she reviews and submits | Anika | none | STORY-ONLY (extension half built and unit-tested; needs the extension on live ATS pages, the web half on `ent-prepare-batch`, and the `*.kiwiply.com` manifest build) |
| CON-89 | A prepared tab that needs her (sign-in, CAPTCHA, empty required fields) waits and says why; Stop batch | Anika | none | STORY-ONLY (same preconditions as CON-88) |
| CON-60 | Apply on the source site with the extension; application appears in My Applications | Anika | none | BLOCKED: needs the extension loaded on a live ATS page, and tracked-application-to-job matching is not built (`pipeline_application_link`, doc 59 section 5) |
| CON-61 | Marketer enters the job source link and quick info | Omar | none | NOT-BUILT: no marketer write for `cws_job_source` (Marketing workspace; `consultant-job-source-flow.md` "What the marketer role must later write") |
| CON-62 | Marketer captures a job with the extension and assigns it | Omar, Anika | none | NOT-BUILT: doc 59/60, stories X9.x |
| CON-63 | Messaging and calls with the marketer | Anika, Omar | none | NOT-BUILT: marketing-workspace messaging |
| CON-64 | Accepting an offer starts a placement | Anika, employer/ops | none | NOT-BUILT: employer/ops side; the Offers page says accepting does not start a placement |
| CON-65 | Marketer approves vacation; marketer moves a submission to "submitted to client" | Omar, Anika | none | NOT-BUILT: marketer approval and submission-write steps |
| CON-66 | Full in-app job search and apply | Anika | none | NOT-BUILT: later phase; in-app Apply was removed on purpose |
| CON-67 | AI-scored practice, AI resume review, create resume from scratch | Anika | none | NOT-BUILT: "coming soon" / self-scored only |
| CON-68 | Connected tools, password and 2FA from Settings; placement documents | Anika, Ben | none | NOT-BUILT: shown as disabled / managed on the Kiwiply account / HR workspace |

---

## 4. Stories

### CON-01 Anika opens her Home and sees her own pipeline at a glance
- **Persona / role:** Anika Rao, CONSULTANT. **Goal:** one screen that answers "what needs me today?".
- **Preconditions / seed:** Anika pipeline seed (3 upcoming interviews, 5 tasks, matches, assigned jobs, applications).
- **Steps:** 1. Sign in via Demo accounts; she lands on `/w/consultant`. 2. Read the six tiles (Job Matches, Assigned Opportunities, Active Applications, Upcoming Interviews, Submissions Pending, Active Placement). 3. Scan the cards: Recommended Matches, Assigned Opportunities, My Applications, Upcoming Interviews, Resume Strength, Tasks & Follow-ups, Today's Focus, Quick Actions, Marketer Messages, help card.
- **Expected:** every tile shows a number; Upcoming Interviews = 3 and three interview rows; at least one task and one match row; Marketer Messages carries the Sample mark.
- **Negative / variants:** Ben sees his own Home (CON-38). Org Admin: CON-04. A failed load shows a retry state, never zeros.
- **Pages / APIs:** `/w/consultant`; `GET /api/orgs/{orgId}/me-workspace/home`.
- **Automation:** `web/e2e/stories/consultant/home-and-access.story.ts` "CON-01 Anika opens her consultant Home and sees her own pipeline at a glance".

### CON-02 Anika jumps from Home into her work
- **Goal:** Home is a launch pad. **Steps:** 1. Tick the first Today's Focus item. 2. Quick Action "Practice Interview" -> Interview Prep. 3. Back; "View All" on My Applications -> Applications. 4. Quick Action "Update Resume" -> My Resumes.
- **Expected:** each link lands on the matching page with its data loaded; the focus checkbox is local (not saved).
- **Pages:** Home, Interview Prep, Applications, Resumes. **Automation:** `home-and-access.story.ts` "CON-02 ...". **Status:** AUTOMATED.

### CON-03 Anika walks the 20-item sidebar
- **Goal:** the menu is complete and honest. **Steps:** open Home, read the sidebar, click every item.
- **Expected:** exactly 20 items in board order (Home, My Career Profile, My Resumes, My Marketer, Job Discovery, Job Matches, Assigned Opportunities, My Applications, Submissions & Approvals, Interviews, Interview Prep, Offers, My Placement, Availability, Tasks & Follow-ups, Activity Timeline, Inbox, My Features, Notifications, Settings); each opens its page with `data-status=ready` (none shows "on the way").
- **Automation:** `home-and-access.story.ts` "CON-03 ...". **Status:** AUTOMATED.

### CON-04 Sarah (Org Admin, not a consultant) is told "not part of your role"; the consultant API answers 404
- **Persona:** Sarah Chen (ORG_ADMIN + MARKETING_MANAGER, no consultant profile). **Steps:** open `/w/consultant` and `/w/consultant/placements`; call five `me-workspace` endpoints from the page.
- **Expected:** "This isn't part of your role" (shell state) or the page's own denied state; no `[data-consultant-*]` root; every API call returns 404, never 403.
- **Pages / APIs:** all consultant pages; `GET /api/orgs/{orgId}/me-workspace/{home,profile,resumes,applications,offers}`.
- **Automation:** `home-and-access.story.ts` "CON-04 ...". **Status:** AUTOMATED. (Unverified: whether Sarah's menu lists the Consultant workspace; the spec accepts either denied state.)

### CON-05 Another tenant's host cannot read Acme's consultant workspace
- **Persona:** Anika, then Beta's host. **Steps:** note Acme's org id; open `http://beta.localhost:<port>/api/orgs/<id>/me-workspace/home` and `/w/consultant`.
- **Expected:** API 401/403/404; no consultant root on Beta; Beta asks for its own sign-in (sessions are host-only).
- **Automation:** `home-and-access.story.ts` "CON-05 ...". **Status:** AUTOMATED. (Unverified: the exact redirect to `/login`.)

### CON-06 On a phone the consultant pages fit the screen
- **Steps:** set 390x844; open Home, Job Discovery, Matches, Applications, Tasks, Availability. **Expected:** `scrollWidth - clientWidth <= 1`.
- **Automation:** `home-and-access.story.ts` "CON-06 ...". **Status:** AUTOMATED.

### CON-10 Anika reviews her career profile
- **Goal:** a complete profile drives matching. **Preconditions:** profile seed.
- **Steps:** open My Career Profile; read the header (name, experience, location, availability), certifications, roles, locations, work authorization, career goals, Profile Strength, Missing Details.
- **Expected:** header shows "Anika Rao" and "years" of experience; exactly 3 certifications (AWS Certified Solutions Architect first); "Senior Java Developer" and "Remote" present; the avatar is an initials circle (no photos are stored); Missing Details card present.
- **Negative:** there is no field for DOB, SSN, phone or visa number anywhere (work authorization is a status choice).
- **Pages / APIs:** `/w/consultant/profile`; `GET .../me-workspace/profile`. **Automation:** `profile-and-resumes.story.ts` "CON-10 ...". **Status:** AUTOMATED.

### CON-11 Anika edits her summary, adds and removes a skill; the PII guard refuses an ID number
- **Steps:** 1. Edit professional summary. 2. Type "My SSN is 123-45-6789 ..." and Save: refused with an alert. 3. Replace with clean text plus a unique marker; Save ("Summary saved"). 4. Put the original text back. 5. Under Primary Skills click Add Skills, add a unique letters-only skill ("Skill added"), Done, Edit skills, Remove it ("Skill removed").
- **Expected:** step 2 shows an alert and nothing is saved; the other writes confirm in the status line and the card; the original is restored.
- **Pages / APIs:** `PUT/POST .../me-workspace/profile/summary`, `/skills` (and DELETE). **Automation:** `profile-and-resumes.story.ts` "CON-11 ...". **Status:** AUTOMATED.

### CON-12 Anika adds and removes a preferred role and a certification
- **Steps:** Preferred Roles -> Add Role -> unique text -> Add ("Role added") -> Done -> Edit -> Remove. Certifications -> Add Certification -> name + issuer -> "Add certification" -> row appears -> Edit certifications -> Remove.
- **Expected:** each add/remove confirmed in the status line; cards return to seeded content. **Automation:** `profile-and-resumes.story.ts` "CON-12 ...". **Status:** AUTOMATED.

### CON-13 Anika reviews and previews her resumes
- **Steps:** open My Resumes; read tiles, table, Resume Strength, Recent Activity; preview the first resume; click Create New Resume.
- **Expected:** at least 5 resumes, exactly one `data-primary=true`; the preview shows a resume paper; "Create New Resume" says "Creating a resume from scratch is coming soon" (no fake form).
- **Negative:** Download/Print/Share produce a generated document in the browser and record activity (not asserted: browser-dependent). **Pages / APIs:** `/w/consultant/resumes`; `GET .../me-workspace/resumes`, `GET .../resumes/{id}/preview`. **Automation:** `profile-and-resumes.story.ts` "CON-13 ...". **Status:** AUTOMATED.

### CON-14 Anika renames a resume, switches her primary and restores everything
- **Steps:** Edit a non-primary resume, rename, Save changes ("Resume updated"); row menu -> Set as primary ("Primary resume changed"); restore the original primary; rename back.
- **Expected:** exactly one primary at every point; the renamed row exists; end state equals start state. Duplicate/visibility edits exist on the same sheet (not exercised). **Automation:** `profile-and-resumes.story.ts` "CON-14 ...". **Status:** AUTOMATED.

### CON-20 Anika searches Job Discovery, filters, sorts and opens a job's details
- **Goal:** find among the jobs the marketer loaded. **Preconditions:** OPEN demo jobs.
- **Steps:** open Job Discovery; read "Showing N opportunities" and the helper line; search a keyword from the first job; choose a Job Type; Sort by Newest; Clear All; View the first job.
- **Expected:** helper reads "Apply on the source site with the Kiwiply extension..."; results re-render each time; the drawer shows the job, "Marketer's quick info" and the "not the full posting" note.
- **Negative:** a filter combination with no results shows "No jobs match these filters" (not asserted). **Pages / APIs:** `/w/consultant/job-discovery`; `GET .../job-discovery/{overview,search,jobs/{id}}`. **Automation:** `jobs-and-job-link.story.ts` "CON-20 ...". **Status:** AUTOMATED.

### CON-21 Anika opens the marketer's job link from Job Discovery
- **Goal (Phase 1):** the consultant reaches the source posting in one click. **Preconditions:** job source seed.
- **Steps:** find a card with Open job link; read the quick info (label, source name, Sample mark); click Open job link.
- **Expected:** the anchor is `target=_blank`, `rel` contains `noopener`, href `https://jobs.example.com/demo-acme/<id>`; a new tab opens on the source site (the spec answers it with a local stub page so nothing leaves the machine); the Kiwiply tab is unchanged.
- **Negative:** non-https, credentialed or malformed links are never rendered as anchors (unit-tested `safeHttpsUrl`; not reachable from seed). **Pages / APIs:** `JobLinkButton`, `GET .../job-discovery/search`. **Automation:** `jobs-and-job-link.story.ts` "CON-21 ...". **Status:** AUTOMATED.

### CON-22 Anika bookmarks a job, saves a search, runs it and deletes it
- **Steps:** toggle Save on the first job (and restore); search "engineer"; More Filters -> name -> Save search ("Search saved."); Saved Searches tab shows it with "N new results"; Run; Delete.
- **Expected:** `aria-pressed` flips; the saved search appears, runs, and disappears. **Negative:** an unnamed or empty-filter search cannot be saved (Save search disabled); PII in the name is rejected 422 (API IT). **Pages / APIs:** `POST/DELETE .../job-discovery/saved/{id}`, `POST .../saved-searches`. **Automation:** `jobs-and-job-link.story.ts` "CON-22 ...". **Status:** AUTOMATED.

### CON-23 Anika reviews her Job Matches
- **Steps:** open Job Matches; read tiles; the best match is selected (score, skill alignment, "what to improve"); open the second match; save it and filter "Saved only"; compare two matches; clear.
- **Expected:** at least 3 matches ranked by score; the detail follows the selection; compare sheet appears and clears. **Pages / APIs:** `/w/consultant/matches`; `GET .../matches`, `GET .../matches/{id}`. **Automation:** `jobs-and-job-link.story.ts` "CON-23 ...". **Status:** AUTOMATED.

### CON-24 Anika expresses interest in a match
- **Steps:** click Express Interest on a match without it. **Expected:** the row shows "Interest sent"; there is no Apply/Submit button; nothing is applied. **Negative:** when every match already shows "Interest sent" the spec asserts that state. **Pages / APIs:** `POST .../matches/{id}/interest`. **Automation:** `jobs-and-job-link.story.ts` "CON-24 ...". **Status:** AUTOMATED.

### CON-25 Anika works her Assigned Opportunities and opens the job link
- **Steps:** open Assigned Opportunities; read tiles; View the first; read quick info; click Open job link in the drawer.
- **Expected:** drawer title is the job; quick info and apply helper shown; Open job link opens the source (stubbed) in a new tab; the drawer stays. **Pages / APIs:** `/w/consultant/opportunities`, `.../opportunities/{id}`; `GET .../opportunities[/{id}]`. **Automation:** `jobs-and-job-link.story.ts` "CON-25 ...". **Status:** AUTOMATED.

### CON-26 Anika asks for more info, declines with a reason and reopens
- **Steps:** row menu -> Need More Info -> (Send disabled until text) -> send ("Question sent to your marketer"); row menu -> Decline Opportunity -> reason -> Decline ("Opportunity declined", status Declined); row menu -> Reopen ("Opportunity reopened").
- **Expected:** statuses change as described; the demo row ends reopened. **Negative:** declined rows disable Express Interest / Need More Info (menu items disabled). **Pages / APIs:** `POST .../opportunities/{id}/{need-info,decline,reopen}`. **Automation:** `jobs-and-job-link.story.ts` "CON-26 ...". **Status:** AUTOMATED.

### CON-27 Phase 1 job-link flow, consultant side
- **Goal:** the full Phase 1 promise: assigned job with source link and quick info -> Open job link -> apply on the site with the consultant's own extension -> progress tracked.
- **Preconditions:** job source seed (stands in for the marketer's entry). **Steps:** 1. Assigned Opportunities, open a job with a link. 2. Read the marketer's quick info. 3. Open job link (new tab on the source). 4. [Apply with the extension on the source site: not automatable here.] 5. My Applications shows the application and its status.
- **Expected (automated part):** steps 1-3 as in CON-25; My Applications is read-only with no Submit/Apply button.
- **Not covered:** step 4 and "the new application appears automatically": see CON-60 (BLOCKED). **Automation:** `jobs-and-job-link.story.ts` "CON-27 Phase 1 job-link flow ...". **Status:** AUTOMATED up to step 3; the rest BLOCKED.

### CON-28 A job without a source link shows a disabled "Open job link" with a tooltip
- **Expected (design):** `data-job-link-missing` span with title "Your marketer hasn't added the link yet" and a disabled button. **Reality:** every seeded OPEN job has a row, so the spec notes the state is unreachable and asserts the enabled link instead. Covered by unit tests of `JobLinkButton`. **Automation:** `jobs-and-job-link.story.ts` "CON-28 ...". **Status:** BLOCKED (needs a job with no `cws_job_source` row, which only a marketer-side write or a manual insert can produce).

### CON-30 Anika sees who her marketer is and what they are doing
- **Steps:** open My Marketer; read the marketer card, focus opportunities, follow-ups; click Send Message.
- **Expected:** marketer "Sarah Chen"; response badge marked Sample; at least one focus opportunity and one follow-up (from next steps on her applications); Send Message opens "Messaging arrives with the marketing workspace" with "Send Message is not connected yet. Nothing was sent or scheduled."; "Got it" closes; View on a focus opportunity goes to Assigned Opportunities.
- **Negative:** a consultant with no marketer sees "No marketer assigned yet" and disabled quick actions (Sam; he cannot sign in, so unit-tested only). **Pages / APIs:** `GET .../me-workspace/marketer`. **Automation:** `pipeline.story.ts` "CON-30 ...". **Status:** AUTOMATED.

### CON-31 Ben's marketer is Omar
- **Expected:** `[data-marketer-name]` = "Omar Haddad": consultants see only their own marketer. **Automation:** `pipeline.story.ts` "CON-31 ...". **Status:** AUTOMATED.

### CON-32 Anika follows her applications
- **Steps:** open My Applications; read tiles and Pipeline Summary; filter "Under Review"; reset; sort by Company; open an application; read the stage timeline.
- **Expected:** at least 4 rows; the filtered rows show "Under Review"; the drawer shows Application ID, stage, timeline (seeded "Prepared" event) and the sentence "Applications are submitted by you, outside Kiwiply"; no Submit/Apply buttons.
- **Negative:** the page offers no way to change a status (read-only). **Pages / APIs:** `GET .../applications?status&sort&page`, `GET .../applications/{id}`. **Automation:** `pipeline.story.ts` "CON-32 ...". **Status:** AUTOMATED.

### CON-33 Anika reviews Submissions & Approvals
- **Steps:** open the page; read tiles; Review the first pending submission; read Marketer note, Resume, Submission checklist; look at Past Submissions.
- **Expected:** four tiles; pending rows show a due time; the review drawer has the three sections; at least three past rows. **Negative:** when nothing is pending the page says so (spec tolerates it). **Pages / APIs:** `GET .../submissions`, `GET .../submissions/{id}`. **Automation:** `pipeline.story.ts` "CON-33 ...". **Status:** AUTOMATED.

### CON-34 Anika approves a submission
- **Steps:** Approve on the first pending row; read the dialog; "Yes, approve". **Expected:** toast "Submission approved" with "Nothing was sent to the client by Kiwiply"; Pending Approvals tile drops by one. **Negative:** approving an already-decided submission answers 409 and the page reloads with a notice. **Pages / APIs:** `POST .../submissions/{id}/approve`. **Automation:** `pipeline.story.ts` "CON-34 ...". **Status:** AUTOMATED (one-way write).

### CON-35 Anika declines a submission with a reason
- **Steps:** Decline -> "Decline submission" with empty reason (refused, alert) -> type a reason -> Decline submission. **Expected:** toast "Submission declined"; pending tile drops by one. **Negative:** PII in the reason is refused. **Pages / APIs:** `POST .../submissions/{id}/decline`. **Automation:** `pipeline.story.ts` "CON-35 ...". **Status:** AUTOMATED (one-way write).

### CON-36 Anika manages her Interviews
- **Steps:** open Interviews; read tiles and the calendar; open the first interview; set Mode = Video, a unique `https://meet.example.org/qa-...` link and a private prep note; Save details; look for the Join link; add feedback on the completed interview that still waits for it (Positive + summary).
- **Expected:** three upcoming interviews; "Interview details saved"; the Join anchor carries the link; "Feedback saved" (or the spec notes there is no pending feedback). **Negative:** non-https meeting links are refused; cancelled interviews cannot be edited. **Pages / APIs:** `GET .../interviews`, `PUT .../interviews/{id}/details`, `POST .../interviews/{id}/feedback`. **Automation:** `pipeline.story.ts` "CON-36 ...". **Status:** AUTOMATED.

### CON-37 Anika prepares for interviews
- **Steps:** open Interview Prep; tick a checklist item and Undo; Start Practice on Technical Topics; score five answers with the sliders; add a note; Save session; review the new session.
- **Expected:** four modules; checklist toggles and undoes; practice score shown ("Your score: n%"); the new session appears in Practice Session History with question-level scores; the sheet says it is self-assessment (AI scoring later).
- **Pages / APIs:** `GET .../interview-prep`, `POST .../interview-prep/sessions`, checklist PUT. **Automation:** `pipeline.story.ts` "CON-37 ...". **Status:** AUTOMATED (adds one session per run).

### CON-38 Ben's pipeline is his own
- **Steps:** sign in as Ben; open Applications and Interviews. **Expected:** both have rows of Ben's own. **Automation:** `pipeline.story.ts` "CON-38 ...". **Status:** AUTOMATED.

### CON-40 Anika reviews her Offers
- **Steps:** open Offers; read tiles; see ACCEPTED and DECLINED rows; tick two offers and Compare; open one offer.
- **Expected:** at least 5 offers; side-by-side shows Base Salary, Total Compensation, Start Date, Offer Deadline, Status; the drawer has Benefits and Timeline and states "accepting does not start a placement"; stand-in rows carry the Sample note. **Negative:** an expired offer cannot be answered ("Ask your marketer"). **Pages / APIs:** `GET .../offers`, `GET .../offers/{id}`. **Automation:** `career.story.ts` "CON-40 ...". **Status:** AUTOMATED.

### CON-41 Anika opens "Accept offer" and cancels
- **Steps:** open a pending offer; Accept Offer; read the dialog; Cancel. **Expected:** the copy says nothing is signed or sent to the client by Kiwiply; the offer stays PENDING_REVIEW. **Variant not automated:** confirming "Yes, accept offer" (one-way; records the answer only, no placement). **Automation:** `career.story.ts` "CON-41 ...". **Status:** AUTOMATED.

### CON-42 Anika asks to negotiate
- **Steps:** open a pending offer; Negotiate; Send request with no note (refused); type a note; Send request. **Expected:** toast "Negotiation requested"; the offer becomes NEGOTIATION. **Pages / APIs:** `POST .../offers/{id}/negotiate`. **Automation:** `career.story.ts` "CON-42 ...". **Status:** AUTOMATED (consumes a pending offer).

### CON-43 Ben sees his active placement with no rate anywhere
- **Steps:** open My Placement as Ben. **Expected:** Active Placement tile = 1; Overview names "Digital Platform Programme" and manager "Alex Morgan"; milestones and meetings listed; meeting links open in new tabs with `noopener`; the page text contains no `$` amount, "per hour", "/hr" or "bill rate". **Pages / APIs:** `GET .../placements`. **Automation:** `career.story.ts` "CON-43 ...". **Status:** AUTOMATED.

### CON-44 Ben works his onboarding checklist and posts a status update
- **Steps:** tick a checklist item, Undo; View Client Details; Update Status -> note -> Post update; Download Documents.
- **Expected:** the checklist toggles and restores; the client dialog shows non-sensitive details; "Update posted" and a new activity row; Download Documents says "Documents arrive with the HR workspace. Nothing is available to download yet." **Automation:** `career.story.ts` "CON-44 ...". **Status:** AUTOMATED (the status note is permanent).

### CON-45 Anika sees the honest "no active placement" state
- **Expected:** "No active placement yet" with a link to offers; Update Status disabled ("You need an active placement for this."). **Automation:** `career.story.ts` "CON-45 ...". **Status:** AUTOMATED.

### CON-46 Anika reviews her Availability
- **Steps:** open Availability; read tiles (Available From, Open Opportunities, Preferred Work Mode, Notice Period, Vacation Days); step the calendar a month forward and back; read preferences, upcoming entries, history.
- **Expected:** all tiles and the calendar present; at least one entry and one history row; vacation approval is marked Sample. **Automation:** `career.story.ts` "CON-46 ...". **Status:** AUTOMATED.

### CON-47 Anika adds and deletes a personal day off
- **Steps:** Add Blocked Dates -> Type Personal -> a past date (refused) -> a date 150+ days ahead with a unique reason -> Add entry -> find it (View all if collapsed) -> row menu Delete -> "Delete entry".
- **Expected:** past dates are refused with an alert; the entry appears then "Entry removed". **Negative:** overlapping entries are refused (not exercised). **Pages / APIs:** `POST/DELETE .../availability/blocks`. **Automation:** `career.story.ts` "CON-47 ...". **Status:** AUTOMATED.

### CON-48 Anika changes her availability status and it shows on her profile; she restores it
- **Steps:** Availability -> Update Availability -> Status "On notice" -> Save availability ("Availability updated"); My Career Profile availability pill reads "On notice"; set it back. **Expected:** the two pages agree; history gains rows. **Automation:** `career.story.ts` "CON-48 ...". **Status:** AUTOMATED.

### CON-50 Anika reads her Tasks & Follow-ups
- **Steps:** open Tasks; read tiles and tabs (All Tasks (n)); search "resume"; filter Priority = High; open the Completed tab.
- **Expected:** at least five tasks, the seeded titles present; search narrows; tabs carry counts. **Automation:** `workday.story.ts` "CON-50 ...". **Status:** AUTOMATED.

### CON-51 Anika creates, completes, edits and deletes her own task
- **Steps:** New Task (name, due date, High, Communication) -> Add task; tick Complete (status DONE); untick (NOT_STARTED); row menu Edit task -> rename -> Save changes; Delete task (6-second Undo window); wait, reload.
- **Expected:** toasts "Task added", "Task completed", "Task updated", "Task deleted"; the row is gone after the reload. **Pages / APIs:** `POST/PUT/DELETE .../tasks`. **Automation:** `workday.story.ts` "CON-51 ...". **Status:** AUTOMATED.

### CON-52 A task name with an ID number is refused
- **Steps:** New Task -> "Send my SSN 123-45-6789 to the recruiter" -> Add task. **Expected:** alert in the dialog, dialog stays, nothing is saved. **Automation:** `workday.story.ts` "CON-52 ...". **Status:** AUTOMATED.

### CON-53 Anika follows her Activity Timeline
- **Steps:** open the page; read tiles; widen to Last 90 Days; filter type Applications; read Recent Milestones; Export.
- **Expected:** rows grouped by day, "Showing n of m"; export downloads `activity-timeline.csv`. **Pages / APIs:** `GET .../activity-timeline`. **Automation:** `workday.story.ts` "CON-53 ...". **Status:** AUTOMATED.

### CON-54 Anika reviews My Features
- **Steps:** open My Features; read tiles; filter Premium; use Quick Action "View Job Matches". **Expected:** at least one feature row; a Sample mark says entitlements are stand-ins (unverified: `entitlementsSample` is true on the live API); Quick Action lands on Matches. **Automation:** `workday.story.ts` "CON-54 ...". **Status:** AUTOMATED.

### CON-55 Anika triages Notifications
- **Steps:** open Notifications; read tiles and tabs; flip a notification's read state from its menu; switch the Reminders category off and on in Notification Preferences; open Reminders channels.
- **Expected:** tiles present; the switch flips and restores; the SMS checkbox is disabled (SMS not available); nothing is emailed or texted. **Negative:** an empty feed says "You're all caught up". **Pages / APIs:** `GET .../notifications`, preferences PUT. **Automation:** `workday.story.ts` "CON-55 ...". **Status:** AUTOMATED.

### CON-56 Anika reviews Settings
- **Steps:** open Settings; read tiles and Account Information; Security; Connected Tools; Documents & Permissions.
- **Expected:** no password input anywhere; security rows say they are managed on the Kiwiply account; link to `/settings`; tools say "Not available yet" with disabled Connect buttons; "Supporting Documents: Not collected". **Automation:** `workday.story.ts` "CON-56 ...". **Status:** AUTOMATED.

### CON-57 Anika changes her privacy choices and puts them back
- **Steps:** Profile Visibility -> Private (hint "hidden from everyone but you..."); toggle Allow Analytics Usage; Recent Account Activity shows a privacy entry; restore both.
- **Expected:** values flip and restore; activity gains an entry. **Pages / APIs:** `PUT .../settings/privacy`. **Automation:** `workday.story.ts` "CON-57 ...". **Status:** AUTOMATED.

---

### CON-70 Anika connects her own Gmail the guided way
- **Setup:** the demo stack's sample mailbox (`DemoImapGateway`): the one address in `api/src/main/resources/demo/inbox-demo.json`, any 16 letters connect, a code starting `zzzz` is a wrong password, `yyyy` is "Gmail wants an app password". All test values, no real Gmail is contacted. Anika's license carries the add-on `inbox.monitoring` (seeded by `ConsultantInboxDemoSeeder`).
- **Steps:** open Inbox from the menu; read the privacy panel ("Only you see your mail"); see the three guided steps and the demo's sample address; submit a wrong code, then a real-looking Google password, then the "needs an app password" code.
- **Expected:** each refusal is its own calm sentence (Gmail did not accept / paste the 16-letter app password / Gmail wants an app password); the typed code never appears on the page; nothing is stored (API says not connected). **Pages / APIs:** `/w/consultant/inbox`, `POST .../me-workspace/inbox`. **Automation:** `inbox.story.ts` "CON-70 ...". **Status:** AUTOMATED.

### CON-71 Anika connects and the password is never shown again
- **Steps:** paste the sample address and `abcd efgh ijkl mnop` (spaces allowed) and press Check and connect.
- **Expected:** the connected card shows the address, "Connected", last-checked; neither page nor API ever carries the code, `passwordEnc` or a `v1:` ciphertext. **Automation:** `inbox.story.ts` "CON-71 ...". **Status:** AUTOMATED.

### CON-72 Mail moves her applications and offers new ones
- **Steps:** after connecting, reload until the first read finishes; read "Applications your mail is tracking" and "Found in your mail"; add the Harbor Cloud interview invite to the board; dismiss the Lumen Health confirmation.
- **Expected:** Orbit Freight (her tracked application) stands at **Interview** after the invite and Cedar Analytics at **Rejected**, each row labelled "from your inbox" (the stage is the application's current one, so it also reads right on a repeat connect); Lumen Health and Harbor Cloud are offered, not added behind her back; "Add to my board as Interview" puts Harbor Cloud on her board at Interview and lists it with the others; Dismiss removes a suggestion. **Not covered here:** the organization's mirror of the stage (needs a linked opportunity with FULL consent): covered by `PipelineApplicationLinkerTest` and `LinkedApplicationProjectionInboxTest`. **Automation:** `inbox.story.ts` "CON-72 ...". **Status:** AUTOMATED; the Harbor step consumes a seeded suggestion (re-seed to repeat; the spec handles a repeat run).

### CON-73 Disconnect forgets everything
- **Steps:** Disconnect this inbox, read the sentence about what it deletes, confirm.
- **Expected:** the guided form returns; the API says not connected and returns no address, suggestions or updates. **Automation:** `inbox.story.ts` "CON-73 ...". **Status:** AUTOMATED.

### CON-74 The organization sees none of it
- **Steps:** with Anika connected and her mail read, Sarah (Org Admin) and Omar (marketer) call every inbox route and fetch the organization's consultant, application, interview, member, audit and marketing lists.
- **Expected:** every inbox route (read, connect, disconnect) is the generic 404 for them and Inbox is not in their menu; none of their responses contains the address, a sender, a subject or a line of a message. **Automation:** `inbox.story.ts` "CON-74 ...". **Status:** AUTOMATED. The exhaustive version (every readable organization route, the audit trail, a structural ArchUnit rule) is `ConsultantInboxResourceIT` and `TechnicalStructureTest`.

### CON-75 Taking the add-on off stops the inbox
- **Steps:** with Anika connected, set her `inbox.monitoring` license feature to not live (SQL on the QA MySQL container), reload; set it back.
- **Expected:** the page says "Your organization no longer includes inbox tracking", the badge reads Stopped, no suggestions are offered, the API reports `status=NO_ENTITLEMENT` and `entitled=false`; she can still disconnect; with the add-on back the connection is Connected again. The poller itself (it must not read) is `InboxPollerReconcileTest` and `ConsultantInboxResourceIT`. **Automation:** `inbox.story.ts` "CON-75 ...". **Status:** AUTOMATED where docker and the QA container are reachable.

### CON-76 A license without the add-on
- **Steps:** Ben opens Inbox.
- **Expected:** "Inbox tracking isn't part of your license", no form; `POST` answers 402 `FEATURE_NOT_LICENSED`; nothing is stored. **Automation:** `inbox.story.ts` "CON-76 ...". **Status:** AUTOMATED.

### CON-77 Mailboxes are personal
- **Steps:** Anika connects; Ben reads his own Inbox page.
- **Expected:** Ben sees no connection, address, suggestion or update of hers. **Automation:** `inbox.story.ts` "CON-77 ...". **Status:** AUTOMATED.

### CON-80 Anika creates a resume in the Resume Builder inside her workspace (from scratch, from her profile, from an upload, from a copy)
- **Persona:** Anika. **Goal:** "Create New Resume" is real: the SAME new-resume chooser the personal app has, on the organization's URL with the organization's logo, colours and menu around it.
- **Steps:** open My Resumes; press **Create New Resume** (or a Quick Action: Create = from scratch, Import = upload); pick a source (Use my profile / Upload a resume / Copy an existing resume / Start from scratch); name it; **Create resume**.
- **Expected:** a new resume is created under her own account and the editor opens at `/w/consultant/resumes/{id}` (the address bar stays on the organization's host, the sidebar and top bar are the organization's, no Kiwiply logo link, no "Resume Builder" hop to kiwiply.com). The resume is in her list at once (no manual linking), approved by definition (she wrote it), and the assigned marketer sees it on the Resumes board. Duplicate of a built resume opens a real, editable copy.
- **Pages / APIs:** `/w/consultant/resumes`, `/w/consultant/resumes/{id}`; `POST me-workspace/resumes/built`, then the ordinary `/api/resumes/**` BFF (tenant-aware). **Automation:** none yet (Java: `OrgResumeBuilderIT`; web: `ResumesPage.test.tsx`, `NewResumeSheet.org.test.tsx`). **Status: VERIFIED IN BROWSER 2026-10-16** (Anika, 1440 px: from profile, upload PDF, upload DOCX, copy, scratch each opened the editor at `/w/consultant/resumes/{id}` inside the Acme shell; list shows the new rows).

### CON-81 Anika edits her resume in the builder: autosave, no Save button, no share links, no delete, no AI
- **Steps:** from My Resumes press **Edit** on a built resume; change the headline and a bullet; open the "More actions" menu and Resume settings.
- **Expected:** "Saved" appears by itself (autosave, no Save button); the directory row's name, headline, summary and version follow; the menu offers Rename, Duplicate, Save version, Version history and Download original but **no** Set as primary, Archive, Delete or Tailor; there is no Visibility or Shared-with-Recruiters chip and Resume settings has no Sharing or Danger sections; no AI rewrite buttons and no "upgrade" prompt (the organization license, not a Kiwiply plan, decides). The API refuses the same things if asked directly: share link 404, delete/archive/primary 409 `MANAGED_BY_ORGANIZATION`, AI 402 `FEATURE_NOT_LICENSED`. **Status: VERIFIED IN BROWSER 2026-10-16** (edit shows "Saved", the info line reads "<date> · just now by you"; the More-actions menu offered exactly Rename, Duplicate, Save version, Version history, Resume settings; the page text has no Share, Delete, Rewrite, Tailor, Upgrade or Visibility).

### CON-82 The organization license caps Anika's resumes
- **Steps:** with the cap set low (admin setting `org.license.resumes_max`, per-organization override), create resumes until the cap.
- **Expected:** at the cap the chooser does not open; a dialog says "You've used N of N resumes" and to ask the organization admin (no plans link); a stale count is still caught by the server's 402 `RESUME_LIMIT` (plan `ORGANIZATION`). The personal Free/Pro caps never apply here and the organization cap never applies to a personal account. **Status: BLOCKED (not run in a browser: needs the per-organization cap lowered).**

### CON-83 A resume with a sensitive value never gets in
- **Steps:** upload a resume whose text carries an SSN, a bank and routing number, a tax id, a passport number and a date of birth.
- **Expected:** the text is scrubbed in the browser before it is parsed ("We removed N sensitive values"); nothing sensitive is in the request that creates the resume; if one still reached the API it answers 422 `SENSITIVE_CONTENT` and nothing is created or linked. **Automation:** web `NewResumeSheet.org.test.tsx`, Java `OrgResumeBuilderIT`. **Status: BLOCKED (not run with a sensitive file in a browser; clean PDF and DOCX uploads were verified, see CON-80).**

### CON-84 Anika approves, or sends back, a resume her marketer made
- **Steps:** after MKT-47 Sarah's resume for Anika shows "Made for you, waiting for your approval" in My Resumes; press **Approve**; for another one press **Send back** and write a note.
- **Expected:** Approve makes it approved (she can then make it primary); until then **Set as primary** is off for it and the organization admin's Approve on the Resumes board answers 409 `CONSULTANT_APPROVAL_REQUIRED` (only the consultant attests). Send back makes it read "Needs update" on Sarah's board with the note in the change log. Nobody else (another consultant, the marketer) can approve it: generic 404. **Status: BLOCKED (cannot run on Acme, which has no organization accounts; needs Gamma + `GAMMA_DEMO_PASSWORD`).**

### CON-85 Anika sees a resume Sarah edited: it goes back to "waiting for approval"
- **Steps:** Sarah edits an approved resume of Anika's in act-for mode (MKT-48); Anika opens My Resumes.
- **Expected:** that resume is "Made for you, waiting for your approval" again (what a marketer wrote never counts until she approves it); her own edits to her own resumes never change approval. **Status: BLOCKED (cannot run on Acme; needs Gamma + `GAMMA_DEMO_PASSWORD`).**


### CON-88 Anika prepares several assigned openings and submits each one herself
- **Persona:** anika (consultant, extension connected to her Acme enterprise account). **Goal:** open her chosen openings and have the forms ready to review, without giving up control of Submit.
- **Steps:** 1. On Assigned Openings Anika ticks 3 openings (Greenhouse, Lever, Ashby) and presses **Prepare selected**. 2. The extension answers in under 3 seconds and three background tabs open one after another (not all at once). 3. In each tab the Kiwiply review panel lists her own profile values; she presses **Fill selected**. 4. A bottom-left banner reads "Prepared by Kiwiply: review every field. Nothing is submitted for you." and lists the required fields still empty. 5. She completes them, ticks the "I certify" box herself, and presses the site's own **Submit** in each tab. 6. She opens the Kiwiply drawer.
- **Expected:** nothing was submitted, ticked or clicked for her; each tab reports OPENED, then PREFILLED (or NEEDS_INPUT while required fields remain), then SUBMIT_DETECTED when she submits; the drawer's batch card counts "3 jobs: waiting / filled / need input / submitted"; the application rows and the opportunities moving to Applied come from the server linker, not from the extension. More than 5 selected openings: only 5 tabs are open at once, the next opens when one is submitted or closed, or on **Open next**.
- **Pages / APIs:** web Assigned Openings (`ent-prepare-batch`), extension message `KIWIPLY_PREPARE_BATCH` / `KIWIPLY_PREPARE_ACK`, `POST /api/orgs/{orgId}/con/prepare/{sessionId}/events`. **Automation:** extension unit tests `prepare_batch.test.js`, `prepare_batch_page.test.js`, `no_submit.test.js`; no browser suite. **Status: STORY-ONLY** (real ATS pages unverified; see `job-autofill/ARCHITECTURE.md` "Prepare batch").

### CON-89 A prepared tab that needs Anika waits and says why
- **Persona:** anika. **Goal:** a tab that cannot be prepared automatically never gets worked around.
- **Steps:** 1. Anika prepares an opening whose site asks her to sign in. 2. Another shows a "verify you are human" page. 3. A third is a company site outside the extension's supported hosts. 4. She presses **Stop batch** while two more are still queued.
- **Expected:** the first two tabs stay open untouched, the drawer lists them as "Needs input" with "Sign-in required" and "Verification (CAPTCHA) needs you" and what to do; after she signs in and the page reloads the tab goes back to waiting; the third says "Click the Kiwiply icon on this tab to fill it yourself"; the extension never signs in, never solves a CAPTCHA and never retries more than 3 times per tab; Stop batch drops the queued jobs, leaves every open tab as it is, and nothing more is reported.
- **Pages / APIs:** as CON-88. **Automation:** extension unit tests as CON-88. **Status: STORY-ONLY**

---

## 5. Stories that cannot run end to end today

### CON-60 Anika applies on the source site with the extension and the application shows up in My Applications (BLOCKED)
- **Goal (Phase 1):** consultant clicks Open job link, applies on the job site with her own extension (autofill, her own review and submit), and Kiwiply tracks it.
- **Why blocked:** the story kit does not load the browser extension and a real ATS page; the extension already detects submits and reports through `TrackingProvider`, but matching a tracked application to the assigned job (`pipeline_application_link`, source URL host/path vs `cws_job_source.source_url`, or a job id carried in the link) is not implemented (documented gap in `consultant-job-source-flow.md`; doc 59 section 5).
- **Manual check when unblocked:** load the extension, open the job link, fill and submit on a test ATS, expect a new row in My Applications with the right job and status, the opportunity moving to Applied, and a notification.

### CON-61 Marketer enters the job source link and quick info (NOT-BUILT)
- **Persona:** Omar. **Intended:** the marketer adds a job with an https source link, source name and a short note (PII-scanned), validated with `ConsultantWsJobSourceReader.safeUrl`; a missing link is visible in the marketer UI. **Today:** only the demo seeder writes `cws_job_source`. **Re-classify when** the marketer write ships.

### CON-62 Marketer captures a job with the extension and assigns it to a consultant (NOT-BUILT)
- Doc 59/60 (X9 stories): "Save for consultant" in the marketer's extension session creates the opportunity and notifies the consultant. Not built; the consultant pages work from seeded assignments.

### CON-63 Messaging and calls with the marketer (NOT-BUILT)
- Send Message, Schedule Call, View Calendar, Message Marketer, Request Resume Update (from My Marketer) all open the honest dialog from CON-30. Real messaging waits for the marketing workspace. (Request Resume Update from Assigned Opportunities does record a note: CON-26 variant.)

### CON-64 Accepting an offer starts a placement (NOT-BUILT)
- The Offers page states that accepting records the consultant's answer only and does not start a placement; employer/ops placement start is not built.

### CON-65 Marketer approves vacation; marketer moves a submission to "submitted to client" (NOT-BUILT)
- Vacation entries are saved PENDING (or APPROVED for personal/holiday) with a Sample status; no marketer step exists. Likewise nothing moves a submission row to "submitted to client" yet.

### CON-66 Full in-app job search and apply (NOT-BUILT)
- Later phase. The in-app Apply endpoint, dialog and follow-up task were removed; Job Discovery works from marketer-loaded jobs plus the source link.

### CON-67 AI-scored practice, AI resume review (NOT-BUILT)
- Practice is self-scored with an explicit notice; "Run AI Resume Review" on My Features leads to My Resumes. (Creating a resume now works: the Resume Builder runs inside the workspace, see CON-80..85.)

### CON-68 Connected tools, password/2FA, placement documents (NOT-BUILT)
- Settings shows these as disabled or "managed on your Kiwiply account"; Placement "Download Documents" says documents arrive with the HR workspace. Asserted as honest empty states in CON-44 and CON-56.

## 6. Running the specs

```
cd web
E2E_REAL_PORT=3200 PW_CHANNEL=chrome npx playwright test -c playwright.stories.config.ts e2e/stories/consultant
```
Needs the real stack with `DEMO_ALLOW_WRITES=true`. The job-link stories answer `https://jobs.example.com/**` locally (`stubJobSite`), so they make no outside requests. Run order does not matter, but CON-34, 35, 42 and 24 consume seeded rows; reset the demo database (or re-seed) to run them again.
