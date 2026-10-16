# QA stories: Marketing workspace (area key MKT)

Specs: `web/e2e/stories/marketing/*.story.ts` (helpers in `_mkt.ts`). Personas: **omar** (Omar Haddad, Marketing Specialist, scope ASSIGNED: his own book, which includes Ben Okafor), **sarah** (Sarah Chen, Org Admin + Marketing Manager, primary marketer of Anika Rao), **anika** and **ben** (Consultants). Tenant: Acme Staffing (`acme.localhost`). Run order does not matter; every writing story makes its own rows with `Date.now()` in the name and never touches the seeded roster.

## Story-fix log 2026-10-16 (branch ent-story-fixes)

The 19 stories that failed after the marketing pages became the shared organization pages were rewritten against the current DOM and kept their ids: Resumes, Applications and Interviews are the shared pages (tiles `[data-kpi=...]`, rows `tr[data-row-id]`, drawers `#ent-resume-sheet` / `#ent-application-sheet`), and the consultant side of the pipeline is the live Assigned Opportunities page (`[data-consultant-opportunities] [data-opp]`). Two facts about the seed shaped the stories: **Ben is ON_PROJECT, so his marketing is paused** and nothing can be assigned to him (the API answers CONSULTANT_PAUSED), so the pipeline stories first make him AVAILABLE through the Consultants API as Sarah and put him back afterwards (`keepMarketed`); and **Sarah's Marketing Manager workspace is not built**, so she never opens a marketing page (she only supplies jobs and ids). Statuses below: AUTOMATED unless marked; **BLOCKED** stories keep their steps in the spec under `test.fixme` with the reason, so they run the day the gap is closed. Product defects found are listed in `videos-index.md` (Findings): one was fixed (Add opportunity answered 404 for the row it created), one is queued (the two consultant Assigned Opportunities implementations that do not share a record).

## Area overview

**What the role does.** The Marketing Specialist prepares work for the consultants assigned to them: keeps profiles and resumes ready, finds and matches openings, assigns them to consultants as opportunities, prepares submission packages, tracks applications and interviews, and chases follow-ups. **E1 is absolute:** a marketer prepares, requests and records; the **consultant submits**. Nothing in this workspace applies, submits, signs in as a consultant or sets a consultant's own answer. Kiwiply never submits.

**Release-1 job pipeline** (`60-job-phase1-contract.md`, `61-job-data-collection-and-audit.md`): the marketer, on a job page in the browser extension, presses *Save for consultant*. The extension trims the job (no description) and calls `POST /api/orgs/{orgId}/mkt/opportunities/from-extension`. The API stores the job (`capture_source=EXTENSION`, `detail_level=MINIMAL`), assigns it to each chosen consultant, and the consultant sees it at `/w/consultant/opportunities`, opens the posting on the source site, and responds (Interested, Ask a question, Decline, or "I applied"). The marketer sees the response on the Opportunities board.

**Pages that exist** (`/w/marketing/...`): Home (`/`), My Assigned Talent (`talent`), Resumes, Job Discovery (`jobs`), Job Matches (`matches`), Opportunities, Job Streams (`streams`), Submissions, Applications, Interviews, Follow-ups (`followups`), Tasks, Activities (`activity`), Performance. All 14 are real pages backed by `/api/orgs/{orgId}/mkt/**`. The consultant side of the pipeline is `/w/consultant/opportunities[/{id}]`.

**Resume Builder in act-for mode (MKT-47, MKT-48) was added by ent-resume and is BLOCKED: it cannot be shown on Acme (shared accounts, no organization accounts: the picker says so) and needs the Gamma organization plus `GAMMA_DEMO_PASSWORD` to run in a browser.** **Not built / not in a browser-drivable form:** the extension itself (Save-for-consultant drawer, consultant "Assigned by" chip, submit-detect auto-link), a marketer UI to create a job by hand (Job Discovery has no "Add job"; Sarah can use `/w/admin/jobs`), a marketer UI to withdraw an assignment, org-level job-data audit page (belongs to the ADM area). See MKT-40..46.

**How the extension call is automated.** Playwright cannot drive the extension, so `captureJob()` performs the same HTTP call as the signed-in marketer: first against the web origin (no BFF route exists today, so it answers 404), then directly against the API with the marketer's own access token (read from the session cookie) and the tenant-host headers. Needs `E2E_API_URL` (default `http://localhost:18183`) and `DOSSIER_TENANT_HOST_SECRET` (same value as the API and `next start`). The marketer's answer to a consultant question (`POST .../mkt/opportunities/{matchId}/answer-info`) has no BFF route either and is called the same way.

**Seeded data these stories rely on** (verify on the live stack): Omar's book contains Ben Okafor and is not empty; Sarah's book contains Anika Rao; Anika is *not* in Omar's scope; the seeded Opportunities board has at least one `No Response` row for Omar; Acme has open jobs, resumes, applications and streams from the talent/mkt demo seeders; Ben and Anika are ACTIVE with ACTIVE marketing status. Writes need the API run with `DEMO_ALLOW_WRITES=true`.

---

## Home and talent

### MKT-01 Omar starts his day on the Talent Marketing Dashboard
- **Persona / role:** omar, Marketing Specialist. **Goal:** see the state of his book at a glance.
- **Preconditions:** seeded book (assigned consultants > 0).
- **Steps:** 1. Open `/w/marketing`. 2. Read the six tiles (Assigned Consultants, Profiles Ready, New Job Matches, Pending Submissions, Upcoming Interviews, Overdue Follow-ups). 3. Scroll through the seven cards.
- **Expected:** heading "Talent Marketing Dashboard"; page `data-status=ready`; Assigned Consultants is a number > 0; cards My Assigned Talent (max 5 rows), Job Stream Monitor, Top Openings, Submission Pipeline, Today's Follow-ups & Tasks, Upcoming Interviews, Recent Activity and the help card are present.
- **Negative / denied:** see MKT-05.
- **Pages / APIs:** `/w/marketing`, `GET /api/orgs/{id}/mkt/home`.
- **Automated by:** `home-talent.story.ts` "MKT-01 Omar starts his day on the Talent Marketing Dashboard". **Status: AUTOMATED**

### MKT-02 Omar tours every Marketing page from the sidebar
- **Persona:** omar. **Goal:** every menu entry leads to a real page (no "on the way", no "not part of your role").
- **Steps:** click, in order: My Assigned Talent, Resumes, Job Discovery, Job Matches, Opportunities, Job Streams, Submissions, Applications, Interviews, Follow-ups, Tasks, Activities, Performance.
- **Expected:** URL ends with the page slug; each page's root reaches `data-status=ready`; its heading is shown; neither "This page is on the way" nor "This isn't part of your role" appears.
- **Pages / APIs:** all 13 pages above plus their `mkt/*` list endpoints.
- **Automated by:** `home-talent.story.ts` "MKT-02 Omar tours every Marketing page from the sidebar". **Status: AUTOMATED**

### MKT-03 Sarah (marketing manager) opens the same workspace with her own book
- **Persona:** sarah (Org Admin + Marketing Manager). **Goal:** a manager works in the Marketing workspace too.
- **Steps:** open `/w/marketing`; read Assigned Consultants; open `/w/marketing/talent`; search "Anika".
- **Expected:** dashboard renders; Assigned Consultants > 0; exactly one row "Anika Rao".
- **Open question for the coordinator:** if Sarah's workspace switcher does not list Marketing on the live stack the first assertion fails and this story documents a real gap (the runbook once said the Marketing module was deferred).
- **Automated by:** `home-talent.story.ts` "MKT-03 ...". **Status: BLOCKED: the Marketing Manager workspace (`/w/marketing-mgmt`) is a placeholder and `/w/marketing` is refused to Sarah** (the steps stay in the spec under `test.fixme`). **MKT-03b** (AUTOMATED) pins today's honest behaviour: "This isn't part of your role" on `/w/marketing`, "on the way" on `/w/marketing-mgmt`.

### MKT-04 Omar finds a consultant, filters by status and opens the profile drawer
- **Persona:** omar. **Goal:** work his assigned talent.
- **Steps:** 1. Open `/w/marketing/talent`. 2. Check the five tiles. 3. Search "Ben" -> one row "Ben Okafor". 4. Clear, choose the "Available Now" chip (`aria-pressed=true`, list never grows), return to "All". 5. Search Ben, press **View Profile**.
- **Expected:** drawer `[data-talent-drawer]` shows Ben, the text "Summary only. Contact details stay with the consultant." and sections Skills, Resumes, Active applications, Upcoming interviews, Assigned jobs.
- **Pages / APIs:** `/w/marketing/talent`, `GET mkt/talent`, `GET mkt/talent/{consultantId}`.
- **Automated by:** `home-talent.story.ts` "MKT-04 ...". **Status: AUTOMATED**

### MKT-05 A consultant is refused the Marketing workspace; its API answers 404
- **Persona:** anika (Consultant). **Goal:** role isolation.
- **Steps:** open `/w/marketing`; then request `mkt/home|talent|opportunities|tasks` through the web BFF and `mkt/home` directly on the API.
- **Expected:** "This isn't part of your role"; no dashboard; every API call is the generic 404 (never 403).
- **Automated by:** `home-talent.story.ts` "MKT-05 ...". **Status: AUTOMATED**

### MKT-06 A consultant outside Omar's book cannot be opened by id
- **Persona:** omar (and sarah to learn Anika's id). **Goal:** scope isolation inside the marketing team.
- **Steps:** Sarah's options list gives Anika's id; Omar requests `mkt/talent/{anikaId}`; Omar searches "Anika" on his talent page.
- **Expected:** 404; zero rows.
- **Assumption:** Anika is not assigned to Omar (primary or backup).
- **Automated by:** `home-talent.story.ts` "MKT-06 ...". **Status: AUTOMATED**

---

## Resumes, discovery, matches, opportunities board, streams

### MKT-10 Omar reviews his consultants' resumes and previews one
- **Steps:** open Resumes; four tiles (Total Resumes, Profiles Ready, Resumes Need Updates, Approvals Pending); rows show an approval chip; search a nonsense title -> zero rows; clear; **View** on the first row.
- **Expected:** `[data-resume-drawer]` with an "Resume preview" article and Summary/Skills sections. Read-only (Edit is not clicked: saving creates a new version needing admin approval).
- **Pages / APIs:** `/w/marketing/resumes`, `GET mkt/resumes`, `GET mkt/resumes/{id}`.
- **Automated by:** `discovery-opportunities.story.ts` "MKT-10 ...". **Status: AUTOMATED**

### MKT-11 Omar searches Job Discovery and opens a job's details
- **Steps:** open Job Discovery; five tiles (New Openings Today, High-Match Openings, Jobs Assigned, saved-search count, Saved Searches); search "react" -> first row mentions react; search a nonsense string -> "No openings match these filters."; **Clear all**; **View** on the first row.
- **Expected:** `[data-job-sheet]` shows Client, Location, Rate, Source.
- **Pages / APIs:** `/w/marketing/jobs`, `GET mkt/jobs`, `GET mkt/jobs/{jobId}`.
- **Automated by:** `discovery-opportunities.story.ts` "MKT-11 ...". **Status: AUTOMATED**

### MKT-12 Omar assigns a job to Ben from Job Discovery and Ben receives it
- **Personas:** sarah (set-up), omar, ben. **Goal:** assign an existing org job to a consultant in my book; the consultant, not Kiwiply, applies.
- **Preconditions:** `from-extension` available (job captured by Sarah for Anika is the open job; extension-captured jobs waive the approved-resume gate).
- **Steps:** Sarah captures a job for Anika (HTTP). Omar searches its title in Job Discovery, presses **Assign**, sees "It does not apply to the job: the consultant submits the application themselves.", picks Ben Okafor, confirms. Ben opens `/w/consultant/opportunities`.
- **Expected:** notice "Assigned Ben Okafor ..."; Ben's list has the row, "Omar Haddad" as marketer.
- **Pages / APIs:** `POST mkt/jobs/{jobId}/assign` (BFF exists), `GET con/opportunities`.
- **Automated by:** `discovery-opportunities.story.ts` "MKT-12 ...". **Status: AUTOMATED**

### MKT-13 Omar reads Job Matches and opens the explanation for one
- **Steps:** open Job Matches; four tiles; if no rows, the honest empty text ("Run a match to see suggestions"); else select the first row.
- **Expected:** Match Explanation card with "Why this is a great match" ticks, Match Insights card.
- **Automated by:** `discovery-opportunities.story.ts` "MKT-13 ...". **Status: AUTOMATED** (branches on whether the seed has matches).

### MKT-14 Omar reads the Opportunities board and filters it
- **Steps:** open Opportunities; four tiles (Open Opportunities, Ready to Assign, Awaiting Consultant Review, Stale Opportunities); filter "Interest Status = No Response" -> every row has `data-opp-interest=NO_RESPONSE`; search nonsense -> "No opportunities match these filters."; quick actions Bulk Assign, Send Opportunity Notifications, Export are present.
- **Assumption:** at least one seeded No Response row. **Automated by:** `discovery-opportunities.story.ts` "MKT-14 ...". **Status: AUTOMATED**

### MKT-15 Omar adds an opportunity and assigns it; the consultant's answer stays the consultant's
- **Personas:** sarah (set-up), omar.
- **Steps:** a job exists (Sarah captured it for Anika). Omar: **Add Opportunity**, consultant Ben, that job, "Add opportunity". Search the title on the board. If the row's button is **Assign**, press it.
- **Expected:** row exists with interest **No Response**; after Assign the interest is still No Response (assigning asks, never answers). Either a success or a refusal toast is acceptable (approved-resume gate).
- **Automated by:** `discovery-opportunities.story.ts` "MKT-15 ...". **Status: AUTOMATED**

### MKT-16 Omar adds a job stream, pauses it and resumes it
- **Steps:** open Job Streams; four tiles; **Add Job Stream** (name unique, keywords); row appears; **Pause** -> "Paused"; **Resume** -> "Active".
- **Expected:** the dialog states connectors are not switched on yet ("Openings start to appear once the connector for this source is switched on.") (honest: no openings are fabricated).
- **Automated by:** `discovery-opportunities.story.ts` "MKT-16 ...". **Status: AUTOMATED**

---

## Release-1 job pipeline (marketer to consultant and back)

### MKT-20 Omar saves a job from the extension for Ben and sees it on his Opportunities board
- **Personas:** omar. **Goal:** capture a trimmed job and put it in front of a consultant.
- **Preconditions:** Ben in Omar's scope; flags `consultant_jobs` and marketing on for Acme.
- **Steps:** 1. Omar's page learns Ben's consultant id from `GET mkt/opportunities/options`. 2. `POST .../mkt/opportunities/from-extension` with a unique title/company/url, `Idempotency-Key`, no description. 3. Open Opportunities, search the title. 4. Open Job Discovery, search the stamp.
- **Expected:** 200, `existingJob:false`, one result `{consultantId: Ben, existing:false, opportunityId>0}` with no `reason`; the board row shows Ben, the company and **No Response**; Job Discovery lists the job with its company.
- **Negative:** MKT-26.
- **Pages / APIs:** `POST mkt/opportunities/from-extension`, `GET mkt/opportunities`, `GET mkt/jobs`.
- **Automated by:** `job-pipeline.story.ts` "MKT-20 ...". **Status: AUTOMATED** (the extension click itself: MKT-42)

### MKT-21 Ben sees Omar's job, opens the posting and says he is interested; Omar sees it
- **Personas:** omar, ben (second session). **Goal:** consultant receives and responds; marketer sees the response.
- **Steps:** Omar captures for Ben. Ben opens `/w/consultant/opportunities`; the row shows state **New**, company, "Omar Haddad". Ben opens the job: sections Note (marketer's text), Pay ("$70 - $80 / hr"), Source (the link), and the "Why Dossier never applies for you" box. **Open job posting** opens the source site in a new tab (stubbed locally). State becomes **Viewed**. Ben presses **Interested**; state **Interested**; tab "Interested" lists the row. Omar reloads the board.
- **Expected:** Omar's row shows `data-opp-interest=INTERESTED`; Recent Opportunity Activity contains "is interested". The consultant detail never shows a job description.
- **Pages / APIs:** `GET con/opportunities`, `POST con/opportunities/{id}/viewed|interest`, `GET mkt/opportunities`.
- **Now (live consultant page):** Ben opens the row (marketer name, apply helper), Open job link, Express Interest; his row reads Interested. **Automated by:** `job-pipeline.story.ts` "MKT-21". **Status: AUTOMATED** for the consultant side. Two parts are **BLOCKED (product gap)**: a job saved from the extension has no `cws_job_source` row, so Open job link is disabled (annotated BLOCKED in the run), and **MKT-21b** (Omar's board reads Interested) is `test.fixme`: the live page's Express Interest does not reach the marketer's board (stays No response).

### MKT-22 Ben asks a question, Omar answers it, Ben reads the answer
- **Steps:** Ben opens the job by its deep link `/w/consultant/opportunities/{id}`, **Ask a question**, sends. State **Needs info**; "Waiting for Omar Haddad to answer". Omar's board activity shows "asked a question"; the Review dialog timeline too. Omar answers (API `answer-info`, keyed by the board row's match id). Ben reloads.
- **Expected:** Ben sees the answer text and "Omar Haddad answered"; state stays **Needs info** until Ben acts (only the consultant moves it on); Ben then presses Interested -> **Interested**.
- **Note:** the marketer-side answer box is the Review dialog of the board (MKT-41, built; story MKT-52); this story answers over HTTP.
- **Pages / APIs:** `POST con/opportunities/{id}/request-info`, `POST mkt/opportunities/{matchId}/answer-info`.
- **Now:** Ben sends the question from the row menu (Need More Info) and is told it was sent. **Status: AUTOMATED** for that. **MKT-22b** (Omar sees the question, answers, Ben reads the answer) is **BLOCKED (product gap)**: the question does not reach the marketer (answer-info answers 409 NO_OPEN_INFO_REQUEST) and the live page shows no answer.

### MKT-23 Ben declines with a reason and Omar sees Not Interested
- **Steps:** Ben opens the job, **Decline**, picks "Pay doesn't work", writes a note, **Decline job**. Tab Declined lists it. Omar's board.
- **Expected:** Omar's row `NOT_INTERESTED` (button becomes **Compare**); the detail timeline contains "declined". The decline is final for the marketer (no marketer action reverses it).
- **Now:** Ben declines from the row menu with a reason; his row reads Declined and the sheet keeps his reason. **Status: AUTOMATED** for that. **MKT-23b** (Omar's board shows Not Interested) is **BLOCKED (product gap)**: the board stays No response.

### MKT-24 Ben presses "I applied"; the marketer sees that he says he applied
- **Steps:** Ben opens the job; the helper copy says the extension tracks supported sites and otherwise "press I applied after you submit". He presses **I applied**: state **Applied**, button gone, tab Applied lists it. Omar opens the opportunity's details.
- **Expected:** timeline shows "says they applied"; none of Omar's row-menu entries mentions applying or submitting (no marketer path to APPLIED).
- **Automated by:** `job-pipeline.story.ts` "MKT-24 ...". **Status: BLOCKED: the live Assigned Opportunities page has no "I applied" action** (only the shadowed registry page had it). **MKT-24b** (AUTOMATED) keeps the E1 guarantee: Ben's page offers no Apply, Submit or I applied and Omar's board menu has no way to mark it applied or submit.

### MKT-25 Sarah saves a job for Anika only: Anika sees it, Ben does not
- **Personas:** sarah, anika, ben. **Goal:** per-consultant isolation of the pipeline.
- **Expected:** Anika's list has the row "Sarah Chen"; Ben's list does not; Ben opening `/w/consultant/opportunities/{anikaOppId}` shows the "not found" panel (`[data-con-detail-missing]`) and never the title.
- **Now:** Ben's by-id check is the API (`GET me-workspace/opportunities/{id}` answers the generic 404). **Automated by:** `job-pipeline.story.ts` "MKT-25 ...". **Status: AUTOMATED**

### MKT-26 The from-extension call refuses bad input and stays idempotent
- **Persona:** omar (+ sarah for Anika's id, ben for the forbidden call). **Goal:** the contract guard rails.
- **Cases and expected results:**
  - no `Idempotency-Key` -> 400 `IDEMPOTENCY_KEY_MISSING`;
  - body with `jobDescription`, `state` or `appliedAt` -> 400 naming the field (never stored);
  - `http://` link -> 400; note containing an SSN-shaped value -> 422 `SENSITIVE_CONTENT`;
  - Anika (outside Omar's scope) -> 200 with result `reason: NOT_IN_SCOPE` (reported, not a 404 for the call);
  - same key twice -> same `jobId` and `opportunityId`; new key with the same link -> `existingJob:true`, result `existing:true`;
  - a consultant (Ben) calling it -> generic 404.
- **Automated by:** `job-pipeline.story.ts` "MKT-26 ...". **Status: AUTOMATED**

---

## Records: submissions, applications, interviews, follow-ups, tasks, activity, performance

### MKT-30 Omar prepares a draft submission package and nothing is sent to a client
- **Steps:** open Submissions; four tiles; **New Submission** (dialog says "nothing is sent to the client"); first consultant, first job, a note; **Create draft**. Open the row actions.
- **Expected:** "Draft prepared for ..." notice; row count does not shrink; menu entries contain no "submit/send to client/apply". (Per E1 a submission is a record; the consultant approves, then records what happens.)
- **Pages / APIs:** `POST mkt/submissions`, `GET mkt/submissions`.
- **Automated by:** `tracking-and-work.story.ts` "MKT-30 ...". **Status: AUTOMATED**

### MKT-31 Omar filters the Applications tracker by stage and records a note
- **Steps:** four tiles; stage tabs (more than one, with counts); choose the second tab (`aria-selected`); search nonsense -> "No applications match these filters."; back to All; on a row with FULL consent open the menu -> **Add a note** -> **Add note**.
- **Expected:** dialog closes after saving. If no seeded row has FULL consent, the story records an annotation and ends (consent-driven absence of the action is correct behaviour, not a failure).
- **Automated by:** `tracking-and-work.story.ts` "MKT-31 ...". **Status: AUTOMATED**

### MKT-32 Omar checks the interview schedule, switches to the calendar and sees what needs feedback
- **Steps:** four tiles; five cards (Interview Schedule, Upcoming, Pending Feedback, Preparation Checklist, Reminders); **Calendar** then **List** (`aria-pressed`).
- **Not automated here:** Propose a reschedule and Record feedback dialogs (seed-dependent). **Status: AUTOMATED** (read-only path); write dialogs NOT automated.
- **Automated by:** `tracking-and-work.story.ts` "MKT-32 ...".

### MKT-33 Omar logs a call against today's follow-ups
- **Steps:** four tiles and three cards (Today / Overdue / Upcoming). **Log Call** with nothing selected -> "Select at least one follow-up first." Tick the first Today row, **Log Call**, notes + "Waiting for a reply", **Save call**.
- **Expected:** dialog "(1 selected)", then closes with an ok notice. If Today is empty, "You're all caught up." is asserted and the story ends.
- **Automated by:** `tracking-and-work.story.ts` "MKT-33 ...". **Status: AUTOMATED**

### MKT-34 Omar adds a task, finds it under My Tasks, completes it and finds it under Completed
- **Steps:** four tiles, six tabs; **Add Task** (dialog: "Saving it only records it: nothing is emailed and nothing is submitted for a consultant."); tab My Tasks; row menu -> **Mark complete**; tab Completed.
- **Automated by:** `tracking-and-work.story.ts` "MKT-34 ...". **Status: AUTOMATED**

### MKT-35 Omar logs an activity for Ben and sees it in the feed
- **Steps:** five tiles, filters, feed; **Log Activity** (dialog says nothing is sent or submitted); consultant Ben Okafor, title; **Log activity**.
- **Expected:** notice "Activity logged. Nothing was sent to anyone."; the feed contains the title.
- **Automated by:** `tracking-and-work.story.ts` "MKT-35 ...". **Status: AUTOMATED**

### MKT-36 Omar checks Performance; Sarah opens the same page
- **Steps:** six tile titles (Assigned Consultants, Active Submissions, Interview Rate, Offer Rate, Placements This Month, Follow-up Completion); cards Submissions by Week, Interviews vs Offers, Placement Funnel, Consultant Readiness; Sarah's session shows the funnel card.
- **Expected:** Assigned Consultants > 0. Empty chart cards say "no numbers yet" rather than faking data.
- **Automated by:** `tracking-and-work.story.ts` "MKT-36 ..." (Omar). **Status: AUTOMATED**. **MKT-36b** (Sarah opens the same page for her own book) is **BLOCKED**: her Marketing Manager workspace is not built (`test.fixme`).

### MKT-47 Sarah starts "New resume for Anika" (an assigned consultant) in the Resume Builder
- **Persona:** sarah (assigned to Anika) and omar (not assigned). **Goal:** a marketer prepares a resume for a consultant in the one Resume Builder, in act-for mode.
- **Steps:** open `/w/marketing/resumes`; press **New resume for…**; the picker lists only Sarah's assigned consultants (one with no sign-in is listed but cannot be chosen: "could not approve a resume made for them"); choose Anika; the new-resume chooser opens speaking about her ("Start Anika's resume from"; her profile counts, her resumes to copy); pick a source (profile, upload, copy, scratch); **Create resume**.
- **Expected:** a toast "Resume created for Anika Rao: it is saved under their account and waits for their approval" with **Edit it**. The resume belongs to Anika's account (not Sarah's), its author is Sarah on every record, it starts **PENDING** and Anika approves it (CON-84); the Resumes board shows it as Pending with "the consultant approves it". Omar (not assigned) cannot see Anika in the picker and the create answers a generic 404. The consultant's resume cap applies (402 `RESUME_LIMIT`). A parsed upload with a sensitive value is refused (422) and nothing is created. Nothing is submitted for Anika and no share link is created.
- **Pages / APIs:** `/w/marketing/resumes`; `GET mkt/resumes/consultants`, `GET mkt/resumes/consultants/{id}/sources`, `POST mkt/resumes/consultants/{id}/built`. **Automation:** none yet (Java `OrgResumeBuilderIT`; web `NewResumeForConsultant.test.tsx`). **Status: BLOCKED (checked in a browser on Acme 2026-10-16: Omar's picker lists his assigned consultants, none has an organization account, and the dialog now says so plainly; the create flow itself needs Gamma + `GAMMA_DEMO_PASSWORD`).**

### MKT-48 Sarah edits Anika's resume in the same editor (act-for) and sees "Pending consultant approval"
- **Steps:** from the Resumes board open the resume's drawer and press **Edit in the resume builder**, or **Edit it** from MKT-47; change the headline; try the menu.
- **Expected:** the editor opens at `/w/marketing/resumes/{row}` inside the organization's shell with **Pending consultant approval** next to the save state; edits autosave into Anika's document with Sarah as the author of every version; the resume returns to PENDING if it was approved. The editor offers no sharing, no Set as primary, no Delete or Archive, no Rename, Duplicate, Save version or Restore, no AI and no settings; the API refuses each of those with the generic 404 (and the org admin's metadata Edit on a builder resume answers 409 `EDIT_IN_BUILDER`). An unassigned marketer, another consultant, or a request without the organization host gets a generic 404. **Status: BLOCKED (needs Gamma + `GAMMA_DEMO_PASSWORD`; not run in a browser).**

---

## Not automated: blocked or not built

### MKT-40 A marketer creates a job by hand in the Marketing workspace
- **Status: NOT-BUILT** (Job Discovery has no "Add job"; the extension is the capture path; Sarah can create jobs on `/w/admin/jobs`, covered by the ADM area). Roadmap: doc 54 (job frontend design).

### MKT-41 A marketer answers a consultant's question from the Opportunities board
- **Status: BUILT (demo day, branch `demo-marketer-gaps`); browser story MKT-52.** The Review dialog shows the question and an answer box; the BFF route `answer-info` was added.

### MKT-42 The marketer presses "Save for consultant" in the browser extension drawer
- **Status: BLOCKED: Playwright cannot drive the real extension.** Covered at API level by MKT-20/26; the extension has its own unit tests (trim, board rule for LinkedIn/Indeed/Dice company blanking, no-submit).

### MKT-43 Ben's extension links his submit to the opportunity automatically (APPLIED via submit-detect / server linker)
- **Status: BLOCKED: needs the extension and a real ATS submit.** Manual "I applied" is MKT-24. The server linker (consent >= SUMMARY, job match by ATS id or url key, `LINK_SUGGESTED` for company+title) is covered by API integration tests, not browser stories.

### MKT-44 A marketer withdraws an assignment (state CLOSED, reason WITHDRAWN) and re-assigns a declined one
- **Status: NOT-BUILT (UI).** `OpportunityAssignmentService.withdraw` exists; the board has no Withdraw or Re-assign-declined entry.

### MKT-45 Bulk Assign, Send Opportunity Notifications and Export on the Opportunities board
- **Status: BLOCKED: seed-dependent, not yet automated.** Needs SUGGESTED rows with updated resumes (Bulk) and assigned rows with no answer (Notify). The dialogs exist; the buttons are only asserted present in MKT-14.

### MKT-46 Admin audit of captured job data (who captured which job, when, with which extension version)
- **Status: BLOCKED to ADM area.** `GET /api/orgs/{orgId}/audit/job-data` exists (doc 61 section 11); its page belongs to the admin stories.

## Summary

| Status | Count |
|---|---|
| AUTOMATED | 27 (MKT-01..06, 10..16, 20..26, 30..36) |
| BLOCKED | 6 (MKT-42, 43, 45, 46, 47, 48: the last two need Gamma + `GAMMA_DEMO_PASSWORD` and cannot run on Acme) |
| NOT-BUILT | 2 (MKT-40, 44) |

## Invitation creates the organization account (S9, decision O4; described only, no spec yet)

### MKT-49 A newly invited marketer accepts the invitation: the account is created with the password they choose
- **Persona:** Mina (new Marketing Specialist, address not yet in Acme). **Goal:** join Acme from the emailed link.
- **Preconditions:** Acme is a SEPARATE organization with `enterprise.separate_accounts` on; an Org Admin invited Mina with the Marketing Specialist role; the invitation link is `https://acme.localhost/join/t/{token}`.
- **Steps:** 1. Open the link signed out. 2. Read the card: Acme's logo, "{inviter} invited you to join Acme Staffing", role, and the note that a new Acme account is created, separate from any personal Kiwiply account. 3. Continue, choose a password (a 3-character one and mismatched ones are refused inline), Continue. 4. Choose what Acme can see (default "Only that I joined"), press "Create my account and join". 5. Land on the Marketing home.
- **Expected:** there is no "sign in with your existing account" step; the response carries Acme's tenant session (cookies written by the web, never shown); the member row is ACTIVE with the invited role; Mina can sign out and back in with her email and the chosen password; an expired or revoked link shows one generic message. If Mina also has a personal Kiwiply account with the same address, it is unchanged (still signs in on kiwiply.com with its own password).
- **Pages / APIs:** `/join/t/{token}`, `GET /api/join/{token}` (createsAccount true), `POST /api/join/{token}/accept` via `/api/join/{token}/accept` (BFF).
- **Status: STORY-ONLY (S10 automates and runs it on the QA stack)**

## Demo-day gaps closed on the Talent Marketer workspace (described only, no spec yet)

### MKT-50 Sarah opens an assigned consultant on My Assigned Talent and sees everything she needs to market them
- **Persona:** sarah (Marketing Specialist, ASSIGNED scope). **Goal:** read one consultant's profile without leaving the page.
- **Steps:** 1. Open `/w/marketing/talent`. 2. Press **View Profile** on an assigned consultant (for example Anika Rao). 3. Read the drawer: Contact (work e-mail, location, work mode, the work authorization label only if one is stored), Current placement (role, client, since), Skills, Resumes (name, version, primary, Approved or Pending approval), Applications (total and open, a chip per stage, the five latest each with "Updated 2h ago by <name> <ROLE>"), Upcoming interviews, Assigned jobs. 4. Open **Resumes** from the footer links. 5. Try a consultant who is not hers (the id in the API URL).
- **Expected:** every section above is filled from the organization's own rows; no phone, time zone, date of birth, identity or bank number and no money amount appears anywhere (the API does not store a phone or a time zone for a consultant); a consultant who is not assigned to Sarah, another organization's id and a non-marketer all answer the same generic 404 and the drawer says "This consultant isn't one of yours".
- **Pages / APIs:** `/w/marketing/talent`; `GET mkt/talent/{consultantId}/overview` (one call, behind the single `MarketerAccess.allows(caller, consultant, AREA)` seam: today true for assigned consultants, O5; decision O6 will only change that method). **Automation:** none yet (Java `MktTalentIT`, `MarketerAccessTest`; web `TalentPage.test.tsx`). **Status: STORY-ONLY**

### MKT-51 Sarah saves a job for Anika from Job Discovery
- **Persona:** sarah, anika. **Goal:** put a job on a consultant's own list without applying for her.
- **Steps:** 1. Open `/w/marketing/jobs`, press **View** on a job, press **Save for a consultant**. 2. Pick Anika (a consultant without an organization account cannot be saved for), press **Save job**. 3. Press it again for the same job. 4. Anika opens her applications.
- **Expected:** a notice "Saved for Anika Rao - <job>. It is on their job list; the consultant applies themselves." The second time: "Already saved:". Anika sees the job in her own list with status **Saved**, source organization, and "Updated by Sarah Lee on behalf of you" in its history; Sarah's own list is unchanged. Nothing is applied, filled or submitted. An unassigned consultant, a consultant account (calling the route), a member without the permission and another organization's marketer all get the generic 404 and nothing is written. More than 30 saves a minute answer 429.
- **Pages / APIs:** `POST /api/orgs/{orgId}/consultants/{memberId}/applications/save` (BFF `consultants/**`), `GET mkt/jobs/{id}/candidates` (now carries the seat id). **Automation:** none yet (Java `SaveForConsultantResourceIT`; web `JobDiscoveryPage.test.tsx`). **Status: STORY-ONLY**

### MKT-52 Sarah answers Ben's question from the Review dialog
- **Persona:** sarah, ben. **Goal:** answer a consultant's question without leaving the board (completes MKT-41).
- **Steps:** 1. Ben asks a question on an assigned job (MKT-22). 2. Sarah opens `/w/marketing/opportunities`, presses **Review** on that row. 3. Read "Question from the consultant", type an answer, press **Send answer**. 4. Ben reloads his job.
- **Expected:** Sarah's answer appears under the question ("Your answer: ..."); the timeline shows the answer was sent without copying its text; Ben sees it and the state stays **Needs info** until he acts. Once Ben has moved on the thread stays readable but the box is gone. Free text with a Social Security or bank number is refused (422, nothing saved).
- **Pages / APIs:** `/w/marketing/opportunities`; `GET mkt/opportunities/{id}` (now `info`), `POST mkt/opportunities/{id}/answer-info`. **Automation:** none yet (Java `MktOpportunitiesAnswerInfoTest`; web `OpportunitiesPage.test.tsx`). **Status: STORY-ONLY**
