# Competitive gaps — recommended stories for the reconciliation pass

Written 2026-10-11 on `product-roadmap`, derived from `COMPETITIVE-LANDSCAPE.md`. **This file edits no
area JSON.** It is the input for the later reconciliation pass: each row says which area owns it, how
urgent it is, who sets the bar, a one-line acceptance criterion, and whether an existing story already
covers it (cite) or only partly covers it (cite + what is missing).

Area tags: **U** user · **O** org · **A** admin · **R** resume · **E** ext · **M** mkt · **P** plat ·
**I** ai · **N** mob · **B** pay · **T** trust · **S** sup. The eight cross-cutting areas (E M P I N B T S)
have no stories yet (HANDOFF-ROADMAP §0.1), so rows tagged with them are *candidate stories for those
designers*, not additions to U/O/A/R.

Priority: **P0** = a week-one test the audience will run or a trust line we are being compared on;
**P1** = parity the paid tier needs; **P2** = differentiation or later-phase.

Hard constraints every row respects: no auto-submit, no cloud auto-apply, no CAPTCHA bypass, no
scraping, Gmail-IMAP inbox only, Free/Pro/Autopilot at locked prices, ≥80 % margin floor, "nothing is
unlimited", consent-scoped orgs, Marketer never submits.

---

## A. Extension & fill quality (the week-one test)

| # | Gap story | Area | Pri | Bar set by | Acceptance criterion (one line) | Existing coverage |
|---|---|---|---|---|---|---|
| G1 | **ATS adapter expansion**: iCIMS, SmartRecruiters, Workable, Taleo/Oracle, SuccessFactors, BambooHR, Jobvite, plus LinkedIn Easy Apply and Indeed Apply | E | P0 | Simplify, Huntr, Jobright | Each adapter ships with a captured real-DOM fixture, ≥90 % of required fields filled on the fixture, and a per-ATS kill switch (A5.5) | **Partial** — hosts already declared in `wxt.config.ts`; adapters exist for Workday/Greenhouse/Lever/Ashby/generic only; ROADMAP 19.5 mentions "6 adapters"; no story for the rest |
| G2 | **DOM-fixture harness + published fill-accuracy per ATS** (fields filled / required, measured in CI, shown on `/help` and the listing) | E, M | P0 | Simplify's weakest point (Workday ~70 %) | CI runs every adapter against ≥3 real captured fixtures; a public table shows the measured % per ATS and the date | **Not covered** — `ext` area scope mentions the harness; no story. Honest-claims register (M scope) is the publishing side |
| G3 | **Fill report after every fill**: which fields were filled, skipped, or need a look, with one-tap fix and "why" | E | P1 | none (differentiator; Simplify fills silently) | Overlay lists filled/skipped/uncertain fields; a tap focuses the field; skipped-reason feeds the learned-answer flow (10.3d) | **Not covered** — review overlay exists before the fill; nothing after |
| G4 | **JD snapshot + resume-version link on save/apply** (title, company, location, salary text, full description, source URL, captured at the moment of save or fill) | E, U | P0 | Teal, Simplify, Huntr | Every application row stores the JD text and the resume id used; the tracker detail (U6.3) shows both; R5.1 and U4.7 can read the snapshot without re-fetching | **Partial** — U20.2 saves a job; ROADMAP Phase 3 says "adopt JD capture + resume-version link"; no story stores the JD text or the resume id per application |
| G5 | **"Already applied" / "saved" badges on job boards** (LinkedIn, Indeed, Greenhouse boards, company career pages) rendered by the content script from the mirror | E | P1 | Simplify, Jobright | On a supported board page, jobs already in the tracker show a badge within 1 s; no network call per card (reads the local mirror) | **Not covered** |
| G6 | **AI answers for free-text / essay questions on Pro** (server AI, metered, with the 13.4 truth rules; BYO key stays on Free) | I, E | P0 | Simplify+, Jobright Turbo | On a required free-text field the drawer offers "Draft with Kiwiply"; the draft cites the profile items it used; metered as a new `AiTask`; Free users see the BYO-key path | **Partial** — BYO-key drafting exists (`api.anthropic.com` host, `ai_answers` table); Phase 13 lists 13.2–13.6 and does not include server-side answer drafting |
| G7 | **My Answers bank**: a web page listing every learned answer (question → answer, where it was learned), editable, deletable, with "use this everywhere" | U | P1 | Simplify "pre-written responses", Huntr packets | `/settings/answers` lists learned answers with provenance; edit/delete syncs to the extension mirror on next pull; deleting is immediate | **Partial** — U13.2 promotes learned answers into profile *suggestions*; no page shows the long-tail answers themselves |
| G8 | **Autopilot "ask-and-remember"**: when 19.3 parks an item on an unknown required question, the review queue asks the user once and stores the answer for every later item in the run | E, I | P0 (for Phase 19) | Simplify Autopilot roadmap ("will pause and ask, and save your answers") | A NEEDS_YOU item with reason `unknown_question` shows the question in the drawer; answering it resumes the item and pre-answers identical questions in the same run | **Partial** — ROADMAP 19.3 parks the item; nothing says the answer is learned and reused |
| G9 | **Try-it page**: a sandbox application form on kiwiply.com the extension can fill in 30 s after install (first value before the first real application) | E, M | P1 | Simplify (test autofill), onboarding norms | New installs land on `/try`; the drawer fills it with the demo/new profile; the install funnel (U2.9) records `first_fill` | **Not covered** — U2.7 sends an install link; nothing proves the fill works before a real form |
| G10 | **In-product review prompt** after the 3rd successful fill, once, respecting a 90-day cool-down, linking to the Chrome/Edge/Firefox listing | E, M | P1 | Store ratings of 4.8–4.9★ are the entry ticket | Prompt shown ≤1 time per 90 days, only after a fill the user did not undo; dismiss is sticky | **Not covered** |
| G11 | **Firefox + Safari store presence** (Firefox needs `data_collection_permissions`, already declared) | E | P1 | Simplify, Teal (Chrome + Firefox + Edge) | Firefox listing live; Safari conversion evaluated with a go/no-go note | **Partial** — ROADMAP Phase 7; `BROWSERS.md` says Firefox/Safari planned; no dated story |

## B. Jobs, matching, alerts

| # | Gap story | Area | Pri | Bar set by | Acceptance criterion | Existing coverage |
|---|---|---|---|---|---|---|
| G12 | **Free explainable match score on every card** (deterministic: title/skills/location/seniority rules, no AI) with the Pro AI score layered on top | U | P1 | Jobright (free matching), Teal (10 credits), LinkedIn Job Match (free summary) | Every search/match card shows a 0–100 rules score and the top 3 reasons without an AI call; Pro adds U4.7 | **Partial** — U4.2 ranker + U4.6 Free daily matches (rules) + U4.7 Pro score; the per-card Free score with reasons is not explicit |
| G13 | **Sponsorship / work-authorisation signal on postings** ("mentions visa sponsorship", "no sponsorship", "unknown") from posting text, plus a preference filter | U, I | P1 | Jobright (H1B filter — its wedge with international students) | Enrichment (U4.1) tags postings; U4.5 preferences include sponsorship; cards show the tag; recall measured on a labelled fixture set | **Partial** — U4.1 enrichment and U4.5 preferences exist; sponsorship is not named |
| G14 | **Share-target / "save from any app"** on the phone (PWA share target + a `kiwiply.com/save?url=` endpoint) so a TikTok/Instagram/LinkedIn link becomes a saved job | N, U | P0 | Gen Z discovery data (TikTok/Instagram > LinkedIn) | Sharing a job URL from any phone app creates a SAVED application with a JD snapshot (G4); the laptop drawer shows it next pull | **Partial** — U5/U20.2 save-a-job from the drawer; U17.1 manifest; share-target not named |
| G15 | **Job-scam signals on cards + safety centre** (red-flag rules: pay-to-apply, chat-app interviews, off-domain email, too-good salary, unverifiable company; links to the S-area safety centre) | S, U | P1 | nobody in the matrix (differentiator); FTC/Barclays data | Cards show "check this one" with reasons when ≥2 rules fire; `/help/safety` exists; the assistant can explain a flag | **Not covered** — S area scope names a job-scam safety centre; no card-level signal story |
| G16 | **Auto-ghosted status + expected-response timeline** ("most companies on this ATS replied within 12 days"; after N days with no inbox activity the card offers "mark as ghosted / follow up") | U, I | P1 | nobody (Criteria: 48–53 % of applications unanswered) | Applications with no event for N days (per-ATS median from U12 data, default 14) get a GHOSTED suggestion; one tap sets status or schedules a follow-up (U6.8) | **Partial** — U6.8 stale nudges + follow-up dates; no GHOSTED state, no timeline |
| G17 | **Contacts attached to applications** (manual CRM: name, role, how we met, last touch; no scraping, no enrichment) | U | P2 | Huntr (unlimited contacts), Careerflow networking tracker | A contact can be added to an application or a company and shows in the detail sheet; export in the DSAR bundle | **Not covered** |
| G18 | **Company page basics from the posting store** (open roles, ATS used, median reply time from our data) — not Glassdoor reviews | U | P2 | Teal/Jobright company insights | U11.1 cards show ATS, open roles, our median reply time | **Partial** — U11.1 companies from the posting store; reply-time metric not named |
| G19 | **Interview date/time extraction from inbox mail → interview row** (deterministic parsing of common ATS/calendar invites; AI only when ambiguous, on the user's budget) | I, U | P1 | nobody (no competitor has the inbox) | An interview-classified mail with a parsable date creates a proposed `interview` row the user confirms; .ics (U6.4) follows | **Partial** — 14.4 classifies interview/reject/offer; U6.4 creates interviews manually; extraction not named |

## C. Resume & profile

| # | Gap story | Area | Pri | Bar set by | Acceptance criterion | Existing coverage |
|---|---|---|---|---|---|---|
| G20 | **"How an ATS sees it" parse preview** (run the resume through our own parser and show the extracted fields side by side with the PDF; flag what was lost) | R | P1 | ATS Verification ($5 one-time), Jobscan | Export dialog (R3.3) has a "Parse check" tab; lossy fields are listed with a fix hint; Free | **Not covered** — R2.5 lint and R5.2 keyword panel exist; a parse-fidelity view does not |
| G21 | **Drawer hand-off: tailor + cover letter + attach for this job in one tap** (from the ATS page, using the G4 snapshot; Pro) | E, R | P0 | Simplify+ "tailored resume in one click", Huntr packets | On a supported ATS page the drawer offers "Tailor for this job"; the result is a new resume (counts toward the cap) attached to the file input; cover letter pasted where a field exists | **Partial** — R5.1/R5.3/R5.5 are web-side; R5.5 names the board/extension hand-off but not the one-tap drawer flow |
| G22 | **Application packet view** (resume version + cover letter + answers used, per application, exportable) | U, R | P2 | Huntr application packets | Application detail shows the packet; "download packet" gives PDF + TXT | **Partial** — G4 + R5.3 supply the parts; the view is not planned |
| G23 | **LinkedIn profile optimizer (checklist, in the web app, from the pasted/imported profile — not from the live LinkedIn page)** | I, U | P2 | Careerflow (free, its wedge) | Given the R1.4 paste import, a deterministic checklist scores headline/about/experience completeness; AI rewrite is Pro | **Not covered** — needs a decision (see §F) because the in-page version would read LinkedIn's DOM |
| G24 | **Resume health nudge includes "stale vs profile" and "no numbers"** | R | P2 | Rezi/Teal nudges | — | **Covered** — R7.5 |
| G25 | **DOCX export, share link, translate** | R | P2 | Kickresume, Rezi | — | **Covered** — R7.3, R7.2, R5.4 |

## D. Interview prep & services

| # | Gap story | Area | Pri | Bar set by | Acceptance criterion | Existing coverage |
|---|---|---|---|---|---|---|
| G26 | **Company-and-role-specific question set generated from the JD snapshot** (deterministic bank first, Pro AI adds role-specific questions) | U, I | P1 | Big Interview (bank by role), Final Round mock | From an application with an interview, "Prep for this" opens a set tagged by the posting's skills; Free gets the bank, Pro the generated set | **Partial** — U9.1 bank, U9.3 AI mock, U9.4 hand-off; the JD-driven set is not explicit |
| G27 | **"We will never help you cheat live" statement on the Interview Prep page and pricing page** | T, M | P1 | Final Round's reputational problem | Copy present; honest-claims register entry | **Not covered** |
| G28 | **Expert resume review as an à-la-carte service with a 10 % Pro discount and a published turnaround** | O/S (services) | P2 | Rezi (monthly expert review on Pro, $8 à la carte) | — | **Covered** — O9.1–O9.10, Phase 20 |

## E. Billing, trust, support, growth

| # | Gap story | Area | Pri | Bar set by | Acceptance criterion | Existing coverage |
|---|---|---|---|---|---|---|
| G29 | **"No dark patterns" billing page + cancel in two taps inside the app** (no portal detour for cancel; renewal reminder email 3 days before; receipt links) | B, M | P0 | #1 one-star theme at Teal, Simplify, Jobright, Resume.io, Final Round | `/pricing` and `/billing` state: monthly or quarterly only, no weekly, no trial trap, cancel keeps access to period end, no refunds — in one screenshot-able block; cancel completes in-app in ≤2 taps with an undo | **Partial** — U15.3 renewal reminders; U15.2 cancel states; cancel today goes through Stripe Portal; marketing copy not planned |
| G30 | **Permissions explainer + "why we don't ask for `<all_urls>`"** on `/help` and the store listings, with the exact host list | T, E, M | P0 | Simplify's CRXPlorer "medium risk" / chrome-stats "very high" | A page lists every permission and host with the reason; the listing's privacy tab matches; a CI check fails if the manifest hosts drift from the page | **Not covered** — scoped permissions exist in `wxt.config.ts`; nothing publishes them |
| G31 | **"Your data is never used to train models; never sold; never shown to employers" default, stated and enforced** (provider settings + policy + U14.2 panel) | T | P0 | Yoodli (training exclusion is paid-only), Simplify (stated) | Policy clause + AI provider calls use no-training settings where available; U14.2 privacy panel shows it; A9.7 subprocessor list names the provider | **Partial** — U14.2 privacy panel and U14.5 policy updates; the training/selling/employer statements are not named |
| G32 | **Public status page + incident history** | P | P1 | SaaS norm; none of the small competitors have one | `status.kiwiply.com` shows API/web/extension-sync status from the A10 monitors; incidents (A10.5) publish there | **Partial** — A10.1/A10.3/A10.5 are internal; no public page |
| G33 | **Help centre `/help` with ATS-specific guides** ("Workday: what we fill, what we can't", "Greenhouse", …) and the fill-accuracy table (G2) | S | P0 | Teal Career Hub, Jobscan ATS guides, Simplify help centre | `/help` exists with search; one guide per supported ATS; linked from the drawer's "Something didn't fill?" | **Not covered** — S area scope; HANDOFF notes `/help` missing |
| G34 | **Student / campus channel**: verified-student discount or free Pro months via school email (.edu/ac.uk) and an ambassador program | M, B | P1 | Kickresume (free Premium for students), Simplify (campus-born), Big Interview/Yoodli via schools | A verified student gets a catalog-defined discount that passes the margin guard; ambassador referral tracked (U16.4) | **Not covered** — needs a decision (§F); the catalog (A3) can hold the price |
| G35 | **Shareable outcome cards designed for TikTok/Instagram** (weekly recap, "got the interview" card, streak) with no personal data by default | U, M | P1 | Gen Z social discovery; Handshake badges | Share card renders at 1080×1920 and square, shows counts not company names unless the user opts in | **Partial** — U16.3 shareable weekly card, O6.6 placement share card; the social-format and privacy default are not named |
| G36 | **Honest-claims register as a CI gate** (every marketing number links to a source or a metric; no "40× more interviews") | M, A | P1 | Competitors' unverifiable claims ("62 % land an interview", "40X opportunities") | A JSON register of public claims with evidence; a lint fails the web build on a number without a register id | **Not covered** — M area scope names it; no story |
| G37 | **Referral reward that fits the floor** (one Pro month both sides after 7 active days) | U, B | P1 | Kickresume vouchers | — | **Covered** — U16.4 (open question on margin remains) |
| G38 | **"Search inside your assistant" distribution** (ChatGPT app / MCP server exposing saved jobs, applications and matches read-only with the user's token) | I | P2 | Indeed app inside ChatGPT (Feb 2026) | Read-only MCP/ChatGPT connector authenticated with the extension token pair; no writes in v1 | **Not covered** — AI area scope; park until U4/U6 APIs are stable |

## F. Organisations & consultancies

| # | Gap story | Area | Pri | Bar set by | Acceptance criterion | Existing coverage |
|---|---|---|---|---|---|---|
| G39 | **Duplicate-submission guard across consultants and vendors** (same posting assigned to two consultants of one org, or the same consultant submitted to the same employer twice in N days) | O | P1 | Conrep, StaffSync360 ("track every submission to prevent duplicates") | Assigning a job already assigned/applied in the org shows a warning with who/when; FULL-scope only; audited | **Partial** — O10.5 job bank + O10.8 submit-detect mark APPLIED; no cross-consultant guard |
| G40 | **Bench availability + aging** (consultant-declared available-from date; marketer sees days-on-bench; reminders) | O | P1 | Bench-sales aging dashboards | Consultant sets availability in their own settings (consent); marketer dashboard shows aging only for FULL-paired consultants | **Partial** — O10.3 workspace; H0.3 placements (Timesheets product); availability not named |
| G41 | **Work-authorisation status on the consultant profile with expiry reminder** (self-declared, consent-gated, never a document number) | O, T | P2 | Bench-sales visa filters/expiry alerts | Field is optional, consultant-owned, shown to the marketer only under FULL; reminder goes to the consultant, not the org; T-area review of immigration-data handling | **Not covered** — needs a decision (§G): immigration status is sensitive data |
| G42 | **Cohort resume-readiness distribution with anonymised benchmarks** (k-anonymous ATS-score bands per cohort vs all users) | O | P2 | VMock (template scoring), Handshake advisor summaries | O8.4 readiness overview adds a band histogram with k≥5 suppression (O7.3) | **Partial** — O8.4 + O7.3 |
| G43 | **Org-curated practice sets** (a bootcamp uploads its own interview questions/guides for members) | O | P2 | Big Interview/Yoodli team assignment, Handshake content | Org admin can publish a question set; members see it in U9 tagged "From your org"; no member data flows back | **Partial** — O8.2 shared jobs is the same pattern for jobs; practice content not planned |
| G44 | **Honest `/organizations` page contrasting with bench-sales norms** ("your consultants see everything the marketer does; nobody submits for them") | O, M | P1 | Bench-sales CRMs (vendor-side, no consent) | Copy present; links to the consent screen preview | **Covered** — O14.2 (add the bench-sales contrast line) |

---

## G. Decisions the user must make (surfaced by this pass)

1. **Student discount / campus channel (G34)** — a catalog-held discount for verified students, or
   stay at list price? Kickresume gives Premium free to students; Big Interview/Yoodli/Handshake are
   free via schools. A discount must still clear the 80 % floor (the margin guard can test it).
2. **LinkedIn optimizer (G23)** — build only on pasted/imported profile text (safe), or also read the
   user's own LinkedIn page in the extension on click (Careerflow's approach; LinkedIn-ToS grey zone,
   and `linkedin.com` is not in our host list)? Recommendation: paste-only, P2.
3. **Work-authorisation field for consultants (G41)** — sensitive data; the bench-sales market expects
   it. Recommendation: self-declared status only (no numbers, no documents), consultant-owned,
   FULL-scope only, after T-area review; P2.
4. **Public fill-accuracy numbers (G2)** — publishing per-ATS accuracy is a trust asset *and* a stick to
   be beaten with. Recommendation: publish, with the date and the fixture count.
5. **Autopilot ask-and-remember (G8)** — confirm it is in Phase 19 scope (it changes 19.3 from "park"
   to "park, ask, learn"); the learned answers then flow into G7/10.3.
6. **Free match score on cards (G12)** — a rules-only score on Free costs nothing in AI budget but
   invites comparison with Jobright's AI score; confirm the Free/Pro split.

## H. Top 10 by impact (for the handback)

G1 adapters · G2 accuracy harness + public numbers · G21 one-tap tailor/attach from the drawer ·
G6 Pro free-text answers · G4 JD snapshot + resume link · G29 billing honesty + in-app cancel ·
G30/G31 trust statements (permissions, no training/no selling) · G14 share-target on the phone ·
G16 auto-ghosted + expected timelines · G15 scam signals.
