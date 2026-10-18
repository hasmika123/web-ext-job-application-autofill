# Competitive landscape — the market Kiwiply has to beat

Written 2026-10-11 on `product-roadmap`. Companion: `COMPETITIVE-GAPS.md` (the story-level gap list this
document feeds). Every roadmap area (U/O/A/R + the eight cross-cutting areas) gets reconciled against this.

**How to read the evidence.** Prices and ratings were checked on **2026-10-11**. Where a vendor's own
pricing page could be fetched it is marked *(vendor page)*; where only third-party reviews were available
it is marked *(reviews; verify)*. Most "review" sites in this category are run by competing products
(LoopCV, FastApply, Wobo, Resumly, JobCopilot, FinalRound, Jobright all publish reviews of each other),
so a single figure from one of them is a claim, not a fact. Store ratings quoted from such sites are
marked *(reported)*. Nothing below should be read as a reason to revisit a locked decision in
`CLAUDE.md`; §4 says explicitly where competitors do something we will not.

---

## 1. The market in one page

The category has split into four shapes, and the user base is moving between them:

| Shape | Who | What the user pays for | What the market has learned |
|---|---|---|---|
| **Autofill + tracker ("copilot")** | Simplify, Huntr, Teal, Careerflow, Kiwiply | Free autofill; paid AI tailoring | Free autofill is now table stakes; the paid tier sells *per-job* tailoring and answers. Trust (you still click Submit) is why these have 4.8–4.9★ stores while auto-apply tools sit at 2–3★ on Trustpilot. |
| **Auto-apply ("agent")** | LazyApply, AIApply, Massive, Sonara (revived under BOLD), LoopCV, JobCopilot, Jobright Agent, Simplify Autopilot (new) | Volume: N applications/day | Consistently the worst-reviewed products in the category (Trustpilot ~2.1–2.4 for LazyApply/Massive); complaints are irrelevant applications, broken forms, refunds. Employers report 157% more applications per hire since 2022 (Greenhouse benchmark, via Jobscan) and respond by ranking harder, which the bots then lose. |
| **Resume builders / ATS checkers** | Jobscan, Rezi, Kickresume, Enhancv, Resume.io, Resume Worded, Teal builder | Subscription (often weekly/monthly) or lifetime | A mature, crowded, billing-complaint-heavy market. Resume.io's $2.95-trial-to-$29.95 conversion is the most-documented dark pattern in the category. Lifetime deals (Rezi $149, Big Interview $299) are the counter-positioning. |
| **Match + alerts + prep** | Jobright, LinkedIn Premium, Indeed, Final Round, Yoodli, Big Interview, Handshake, VMock | Matching quality, interview reps, campus access | Jobright's matching is the most praised engine; LinkedIn/Indeed are adding native AI apply/match (LinkedIn Premium Apply Assistant, June 2026; Indeed app inside ChatGPT, Feb 2026). Prep tools split into "practice" (Yoodli, Big Interview — trusted) and "live cheat" (Final Round — reputationally toxic). |

Three facts shape everything below:

1. **Nobody owns the whole loop honestly.** Simplify is closest (autofill + tracker + matches + AI + now
   Autopilot) but its Autopilot submits without review ("Once you choose Autopilot on a job, it goes" —
   Simplify help centre) and its extension asks for `<all_urls>` + `cookies` + `webRequest`. Teal and
   Huntr stop at the tracker. Jobright stops at matching. Nobody has the inbox.
2. **Billing is the #1 complaint everywhere.** Weekly plans ($13–$20/week at Teal, Simplify, Careerflow),
   hidden prices (Jobright's `/pricing` 404s; AIApply hides amounts until checkout), auto-renewals, no
   refunds. Kiwiply's locked terms (monthly/quarterly only, "no refunds, cancel anytime — you keep what
   you paid for", published prices) are already a differentiator; they have to be *visible*.
3. **The audience is moving to the phone and to social.** 22% of Gen Z use TikTok as a job-search tool
   (iHire), 46% say they got a job/internship via TikTok (Zety, n=896, 2025), 55.6% have skipped an
   application because it required a cover letter, and ~65% of all applications are completed on
   mobile (Appcast benchmark). None of the extension-first competitors has solved "the phone is where
   the job is found; the laptop is where it is applied for" — Kiwiply's U2.7/U5/U20 plan does.

---

## 2. Competitor profiles

### 2.1 Autofill / apply tools

#### Simplify (Simplify Copilot + Simplify+ / Autopilot) — the benchmark
- **Best at:** the free autofill (Chrome Web Store ~4.9★ from ~3,700 ratings, 500k–1M users *(reported)*),
  the tracker that logs every submit, one-click tailored resume + cover letter on Simplify+, a job board
  with matches, an iOS app, and now **Autopilot** (agent applies on supported ATSs; fails rather than
  guesses; will soon "pause and ask you questions it can't answer and save your answers").
- **Pricing** *(reviews; verify — `simplify.jobs/pricing` returns 404)*: Copilot free, unlimited.
  Simplify+ $19.99/week · $39.99/month · $89.99/3 months. No trial documented, no refund policy
  documented. Autopilot included in Simplify+ with credits; larger allowance "coming".
  Sources: [Jobright review](https://jobright.ai/blog/simplify-copilot-review-2026-features-pricing-and-top-alternatives/),
  [ResumeHog](https://resumehog.com/blog/posts/simplify-copilot-review-2026-is-the-free-autofill-tool-worth-it.html),
  [Simplify help: Autopilot](https://help.simplify.jobs/articles/1784339-getting-started-with-autopilot).
- **Audience:** US students and new grads (campus-born), early-career tech.
- **Weaknesses / complaints:** Workday accuracy ~70% vs ~90% Greenhouse/Lever in one 23-application
  test; "multiple forms where the extension did not populate any fields"; Simplify+ billing surprises;
  AI resume output "needs editing"; Trustpilot 3.0★ (n=9). Autopilot has **no review step** — a
  structural trust problem for a product whose free tier's reputation rests on "you still click Submit".
- **Trust/privacy posture:** Policy (Aug 2026) says no ads, no selling, no training generalised models.
  But the extension requests `<all_urls>` with `cookies`, `webRequest`, `webNavigation`; CRXPlorer
  rates it medium risk and chrome-stats "very high" risk impact. Revenue comes from employers (job
  board) — a conflict Kiwiply does not have.
  Sources: [simplify.jobs/privacy](https://simplify.jobs/privacy),
  [crxplorer](https://crxplorer.com/extension/pbanhockgagggenencehbnadejlgchfc/simplify-copilot-autofill-job-applications-job-tracker-ai-resumes).

#### Jobright (Jobright AI, Orion agent, Jobright Autofill extension)
- **Best at:** job matching ("one of the best matching engines you can use"), H1B-sponsorship filters
  (its wedge with international students), daily matches, "insider connections", a 4.9★ extension
  (~200k–300k users *(reported)*), mobile app.
- **Pricing** *(reviews; verify — no public price list)*: Free tier; Turbo **$39.99/month** (up from
  $29.99 in 2026), $17.99/week, $89.99/quarter. No trial, no refunds.
  Sources: [Jobity](https://jobity.io/blog/jobright-review), [Wobo](https://www.wobo.ai/blog/jobright-review/),
  [ApplyGhost](https://applyghost.com/blog/jobright-ai-review).
- **Audience:** US-only coverage; international students / new grads in tech.
- **Weaknesses:** billing/cancellation "in 72% of one-star Trustpilot reviews" (single source);
  resume tailoring "invented a language I do not know"; agent waitlisted for months; applies via
  aggregators, not career pages; US-only.
- **Trust/privacy:** opaque pricing is itself a trust signal; agent behaviour (supervised vs autopilot)
  documented only by third parties.

#### LazyApply
- **Best at:** raw volume on LinkedIn/Indeed/ZipRecruiter (15–1,500 apps/day).
- **Pricing** *(reviews; verify)*: now annual only — Basic $99/yr (~15/day), Premium $149/yr, Ultimate
  $999/yr. No trial; refund "within 30 days / before 100 applications". AppSumo lifetime sold out;
  lifetime buyers allege service was cut back.
  Sources: [Dreamwork](https://www.dreamworkhq.com/blog/lazyapply-review), [LoopCV directory](https://www.loopcv.pro/directory/lazyapply/).
- **Weaknesses:** Trustpilot ~2.1–2.4★; "buggy", "waste of money", forms filled wrong, irrelevant
  roles, ignored refund requests, named on a LinkedIn-automation blacklist for ToS violations.
- **Trust/privacy:** requires Gmail; bulk submission is exactly what Kiwiply's locked decisions exclude.

#### AIApply
- **Best at:** the writing toolkit (cover letters, interview answers) at a low headline price.
- **Pricing** *(reviews; verify — amounts hidden until checkout)*: ~$29/mo or ~$12–16/mo annual for the
  toolkit; auto-apply separately $49/mo (100 apps) to $99/mo (250) — one reviewer's all-in for 100
  apps/month ≈ $68. BBB F rating reported by one source.
  Sources: [Dreamwork](https://www.dreamworkhq.com/blog/aiapply-review), [Scoutify](https://scoutify.com/blog/aiapply-review/).
- **Weaknesses:** auto-apply "slow, inaccurate, overpriced", keyword-only matching, stale board.

#### Massive (usemassive.com)
- **Best at:** marketing on TikTok ("AI applies for you").
- **Pricing** *(reviews; verify, conflicting)*: ~$59/mo, ~$50/mo quarterly ($117–$297/quarter reported);
  4-day trial, 14-day guarantee. A founder TikTok claims a cut to $33/mo (unconfirmed).
- **Weaknesses:** Trustpilot ~2.1★; "$297 for 3 months, zero interviews"; applies weeks after posting.
  Source: [JobCopilot review](https://jobcopilot.com/use-massive-review/), [Trustpilot](https://www.trustpilot.com/review/usemassive.com).

#### Sonara / LoopCV / JobCopilot (the rest of the auto-apply tier)
- Sonara went dark Feb 2024, revived under BOLD (the Zety/LiveCareer group) — $2.95 trial → $23.95/4
  weeks: the same trial-conversion pattern as Resume.io. LoopCV: free 10 apps/mo; $19.99 (100) / $59.99
  (300) with an "approve before sending" option — the only one with a review step by default.
  JobCopilot ~$20–56/mo (sources conflict). All share the complaint "generic resume to every role".
  Sources: [LoopCV on Sonara](https://www.loopcv.pro/directory/sonara/), [AIApply on Sonara](https://aiapply.co/blog/sonara-alternatives), [FastApply on LoopCV](https://blog.fastapply.co/fastapply-vs-loopcv-review-and-comparison-2026).

#### Careerflow
- **Best at:** the free **LinkedIn profile optimizer** (in-place scoring of 14 sections with a
  checklist), recruiter/hiring-manager search, networking tracker; Premium Plus adds AI mock interview.
- **Pricing** *(vendor page, 2026-10-11)*: Free (1 resume, ~10 tracked jobs); Premium $8.99/wk ·
  $23.99/mo · $54.99/qtr · $172.99/yr; Premium Plus $19.99/wk · $44.99/mo · $119.99/qtr · $299.99/yr.
  Source: [careerflow.ai/premium](https://www.careerflow.ai/premium).
- **Weaknesses:** free tier walls fast (1 resume / 10 jobs); weekly plan; guidance is checklist-style.
- **Trust/privacy:** reads the user's own LinkedIn page in the extension — the LinkedIn-ToS grey zone.

### 2.2 Trackers

#### Teal
- **Best at:** the tracker + Chrome clipper ("category-leading"), unlimited free tracking, resume
  builder with 10 templates, job-match scorer (10 free credits), Career Hub content. Chrome Web Store
  ~4.9★ / ~3,200 ratings / ~200k users *(reported)*.
- **Pricing** *(reviews; vendor page returned 403)*: Free; Teal+ **$13/week · $29/month · $79/quarter**;
  no annual plan (annualised monthly = $348). Weekly plan annualises to ~$676 if left running.
  Sources: [HiredRadar](https://hiredradar.com/teal-hq-review/), [Jobsolv](https://jobsolv.com/directory/teal), [ResumeHog](https://resumehog.com/blog/posts/teal-hq-review-2026-is-this-job-search-tool-worth-it.html).
- **Audience:** millennial switchers, organised job-seekers; strong SEO/content brand.
- **Weaknesses:** no autofill-to-submit assist beyond basic, no interview prep, AI bullets need editing;
  the weekly plan is the complaint.
- **Trust/privacy:** not scanned in this pass; publisher Teal Labs, Inc.

#### Huntr
- **Best at:** the cleanest kanban board, one-click capture, unlimited contacts, **unlimited application
  autofills on Free**, "application packets" (resume + cover letter + answers per job), map view.
- **Pricing** *(vendor page, 2026-10-11)*: Free — 100 tracked jobs, unlimited base resumes, 2 tailored
  resumes, 2 packets, unlimited autofills, all templates, free PDF. Pro **$40/mo · $90/qtr · $160/6 mo**
  — unlimited tailoring/packets/AI cover letters/reviews. Chrome ~4.8★ / ~1,300 ratings *(reported)*.
  Source: [huntr.co/pricing](https://huntr.co/pricing).
- **Weaknesses:** $40/mo "too much for a tracker"; Pro is the only route to tailoring volume.

### 2.3 Resume builders / ATS checkers

#### Jobscan
- **Best at:** the deepest per-posting keyword match report; the category's "ATS score" brand;
  Greenhouse/Workday-specific guidance content.
- **Pricing** *(reviews; app.jobscan.co/plan is JS-only)*: Free 5 scans/month; Premium **$49.95/mo**,
  $89.95/qtr (~$29.98/mo); Premium+ $89.95/mo reported; annual disputed. No pro-rated refund.
  Sources: [Interview Guys](https://blog.theinterviewguys.com/is-jobscan-worth-it-in-2026/), [Makerstack](https://makerstack.co/reviews/jobscan-review/).
- **Weaknesses:** "steepest price in the category" (~$10/scan for light users); scores do not predict
  interviews; usability complaints.

#### Rezi
- **Best at:** AI resume writing that targets keywords, a real **$149 lifetime** plan, 30-day
  money-back guarantee, monthly expert review on Pro, an Enterprise tier ($99/mo per 200 users — the
  campus/bootcamp play).
- **Pricing** *(vendor page, 2026-10-11)*: Free (1 resume, 1 AI interview, 3 PDFs); Pro $29/mo;
  Lifetime $149; Enterprise $99/mo per 200 users. Source: [rezi.ai/pricing](https://www.rezi.ai/pricing).
- **Weaknesses:** limited design flexibility, no mobile app, no application automation.

#### Kickresume
- **Best at:** template breadth (40+), transparent pricing, 14-day guarantee, **free Premium for
  students/teachers** (ISIC/UNiDAYS), gift vouchers as referral, iOS/Android app, LinkedIn/PDF import.
  Trustpilot 4.6★ (~3,600 reviews).
- **Pricing** *(vendor page, 2026-10-11)*: Free (4 templates, unlimited downloads, no AI); $24/mo,
  $18/mo quarterly ($54), $8/mo yearly ($96). Source: [kickresume.com/pricing](https://www.kickresume.com/en/pricing/).
- **Weaknesses:** billing/AI-credit disputes (~4% one-star), AI content needs editing.

#### Enhancv
- **Best at:** design-led templates, AI assistant, pro-rated refunds if you land a job. Trustpilot
  ~4.7★ *(reported)*.
- **Pricing** *(reviews; conflicting)*: $24.99–$39/mo; ~$16.50–$23/mo on 3–6-month plans; 7-day
  watermarked trial, then documents lock.
- **Weaknesses:** two-column/icon templates fail ATS parsing; free tier is effectively a trial.

#### Resume.io (BOLD)
- **Best at:** volume and SEO; app presence.
- **Pricing** *(reviews)*: $2.95 7-day trial **auto-converting to $29.95 / 4 weeks**; free = TXT only.
- **Weaknesses:** "thousands of complaints about unexpected charges"; cancellation difficulty across
  Trustpilot/ProductHunt/Reddit. The negative example the category is measured against.
  Source: [Enhancv on Resume.io](https://enhancv.com/blog/resume-io-review/).

#### Resume Worded
- Line-by-line coaching rather than keyword matching; ~$19–29/mo *(reviews)*; free score only.

### 2.4 Job match / alerts (platform-native)

#### LinkedIn
- **Job Match** (all users: match summary vs required/preferred qualifications; Premium: high/medium/low
  + Top Applicant), AI fit assessment, natural-language search, and **Premium Apply Assistant** (June
  2026: pre-fills fields, writes cover letters, confidence scores, supports off-platform jobs).
  Source: [Jobsistant guide](https://www.jobsistant.com/guides/linkedin-2026-ai-changes) *(secondary; verify)*.
- Implication: the "fill a LinkedIn Easy Apply form" use case is being absorbed by LinkedIn itself for
  Premium subscribers; Kiwiply's value is on the *company career page / ATS* side and across boards.

#### Indeed
- Smart Match on an always-updated Indeed Profile, **Career Scout** (job-seeker AI coach), and an
  **Indeed app inside ChatGPT** (Feb 2026, `@Indeed`). Source: [HeroHunt](https://www.herohunt.ai/blog/linkedin-vs-indeed-vs-workable-ai-recruiter-2026/) *(secondary)*.
- Implication: "search inside the assistant you already use" is a distribution channel Kiwiply should
  think about for Phase 2 of the AI area (P2 in the gap list).

### 2.5 Interview prep

#### Final Round AI
- **Best at:** mock interviews (ProductHunt 4.7★ n=82) and the notorious **live "Interview Copilot"**
  (real-time answers during a real interview, marketed as undetectable).
- **Pricing** *(reviews; wildly inconsistent)*: $25/mo billed annually ($300) to $149/mo monthly;
  Job Hunter auto-apply add-on $24.99–$74.99/mo; refunds only within 72 hours.
- **Weaknesses:** billing/refunds dominate one-star reviews (Trustpilot 3.9★ n=255); copilot freezes
  mid-question; "undetectable" contradicted by testers; ethics. Several ATS/interview vendors now
  detect it; 38% of candidates have walked away from a process with an AI interview (Greenhouse 2026).
- **Positioning lesson:** live in-interview help is a reputational liability with employers, schools and
  consultancies — exactly the org buyers in Phases 21–22. Do not copy (§4).

#### Yoodli
- **Best at:** delivery analytics (pacing, filler words, eye contact), AI roleplays with follow-ups,
  multi-persona panels; strong campus footprint (e.g. UW gives it free); enterprise sales-training pivot.
- **Pricing** *(vendor page, 2026-10-11)*: Starter free (5 lifetime roleplays); Pro $8/mo annual (10
  roleplays/week); Advanced $20/mo annual (unlimited, **data excluded from AI training**); Team/
  Enterprise custom. No refunds. Source: [yoodli.ai/pricing](https://www.yoodli.ai/pricing).
- **Weaknesses:** evaluates delivery not content; no job-search context.

#### Big Interview
- **Best at:** a curated question bank by role/industry, structured curriculum, licensed to hundreds of
  universities (free to students there), a 30-day no-questions refund.
- **Pricing** *(vendor page, 2026-10-11)*: BootCamp $39/30 days; Accelerator $99/3 months (adds LinkedIn
  optimisation + AI resume feedback); Pro $299 lifetime. Source: [biginterview.com/pricing](https://www.biginterview.com/pricing).
- **Weaknesses:** dated UX; no application context; nothing on a phone that feels native.

### 2.6 Organisation / campus / consultancy platforms

#### Handshake
- The default campus job platform. 2026: AI ranking of jobs by likelihood to apply (stated as not
  blocking anyone), optional Resume optimizer, **AI Skills Studio** (Sept 2026), AI Fellow badges,
  mobile-first appointment booking with advisors, AI-generated student summaries for advisors.
  Source: [Handshake support](https://support.joinhandshake.com/hc/en-us/articles/38856960612631-About-AI-powered-features-in-Handshake-for-students),
  [Aug 2026 updates](https://updates.joinhandshake.com/announcements/handshake-student-product-updates-august-28-2026).
- Implication: for schools Kiwiply is not a Handshake replacement; it is the "apply + track + prove
  outcomes" layer the career centre lacks. Consent-scoped SUMMARY data (O6) is the right posture.

#### VMock
- Institution-only AI career platform: Smart Resume Editor (scored against templates), Career Fit,
  Aspire (LinkedIn feedback), Elevator Pitch (computer-vision delivery feedback). Consumer $19.95/mo
  *(directory; stale)*; institutional pricing by quote. Competitor (Qwyse) frames it as a "rigid
  standardisation grader". Symplicity (the other campus incumbent) was acquired by Volaris in Feb 2026.
  Sources: [GSU](https://career.gsu.edu/vmock/), [Qwyse](https://www.qwyse.com/blog/vmock-vs-qwyse/) *(competitor)*.
- Implication: cohort resume readiness + benchmarks (O8.4, O7) is the parity bar; our edge is that our
  score is tied to real applications and real outcomes, not a template.

#### Bench-sales / consultancy tooling (Conrep, StaffSync360, Benchinfo-type hotlist portals; CEIPAL/JobDiva as the staffing ATS incumbents)
- What they do: hotlist management (rate, work authorisation, location, skills, marketing status),
  submission tracking with **duplicate-submission prevention**, bench **aging dashboards**, visa-expiry
  alerts, placement pipeline, Outlook-based submissions, account-manager assignment, canned reports
  ("Submission activity by sales in-charge"). CEIPAL ~$50/user/mo, JobDiva ~$100/user/mo *(estimates)*.
  Sources: [Conrep](https://www.conrep.com/products/bench-sales/), [StaffSync360](https://staffsync360.com/), [100Hires](https://100hires.com/ceipal-vs-jobdiva.html).
- What they do not do: anything *for the consultant*. They are vendor-side CRMs; the consultant has no
  login, no consent, no view, and frequently the recruiter submits on their behalf without telling them.
  Kiwiply's Phase 22 Marketer model (consultant consents, approves resumes, runs the fill, submits) is
  the inverse — the honest version of bench sales — and that is the pitch.

---

## 3. Feature matrix

Legend: ● full · ◐ partial / limited / paid-only · ○ none · **✗ deliberately not** (locked decision).
"Kiwiply today" = what is real on `version2` + the published extension (0.28.0); "Kiwiply planned" = on
the roadmap (story ids in `COMPETITIVE-GAPS.md`).

| Capability | Simplify | Jobright | LazyApply / AIApply / Massive | Teal | Huntr | Careerflow | Jobscan | Rezi / Kickresume / Enhancv | Final Round / Yoodli / Big Interview | Handshake / VMock | Bench-sales tools | **Kiwiply today** | **Kiwiply planned** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Free autofill on ATS career pages (Workday, Greenhouse, Lever, Ashby…) | ● (~70% Workday) | ◐ ext | ◐ boards only | ◐ | ● | ◐ | ○ | ○ | ○ | ○ | ○ | ● 4 ATS + generic, review overlay | ● more ATS + fixture harness (E) |
| LinkedIn Easy Apply / Indeed Apply fill | ● | ● | ● | ◐ | ● | ◐ | ○ | ○ | ○ | ○ | ○ | ◐ Indeed smartapply host only | ● (E) |
| Learned answers across applications | ● | ◐ | ◐ | ○ | ◐ | ○ | ○ | ○ | ○ | ○ | ○ | ● cache + profile suggestions (10.3) | ● answers bank (U) |
| AI drafting of free-text questions | ◐ Simplify+ | ◐ Turbo | ◐ | ○ | ◐ Pro | ◐ | ○ | ○ | ○ | ○ | ○ | ◐ BYO-key only | ● Pro (I/E) |
| One-click tailored resume per job | ◐ Simplify+ | ◐ Turbo | ◐ | ◐ Teal+ | ◐ Pro | ◐ Premium | ○ (report only) | ◐ paid | ○ | ○ | ○ | ◐ 13.4 tailor (web) | ● R5.1/R5.5 + drawer |
| Cover letter generator | ◐ paid | ◐ paid | ◐ | ◐ paid | ◐ paid | ◐ paid | ○ | ● | ○ | ○ | ○ | ○ | ● R5.3 (Pro) |
| Save-a-job / clipper from boards | ● | ● | ○ | ● | ● | ◐ | ○ | ○ | ○ | ● | ● hotlist | ● drawer save (U20.2) | ● + JD snapshot (E) |
| Tracker auto-updated on submit | ● | ◐ | ◐ | ◐ manual | ◐ manual | ◐ | ○ | ○ | ○ | ○ | ● vendor-side | ● submit-detect | ● U6 |
| Tracker auto-updated **from the inbox** (interview / reject / offer) | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ◐ Outlook | ● IMAP (14.x) | ● U6/U10 |
| Kanban / phone cards, swipes | ◐ | ◐ | ○ | ● | ● | ◐ | ○ | ○ | ○ | ○ | ● | ◐ list | ● U6.5 |
| Job matching with explainable score | ◐ | ● (best) | ○ | ◐ 10 free credits | ◐ | ◐ | ● per posting | ○ | ○ | ● ranking | ◐ | ◐ light matches (13.6) | ● U4.2–U4.7 |
| Daily matches by email/push | ● | ● | ○ | ◐ | ○ | ○ | ○ | ○ | ○ | ● | ○ | ◐ | ● U7 |
| H1B / sponsorship filter | ○ | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● visa | ○ | ◐ U4.5 (gap) |
| ATS resume score + per-JD keyword gaps | ◐ | ◐ | ○ | ◐ | ◐ | ◐ | ● | ◐ | ○ | ● | ○ | ◐ 13.5 score | ● R5.2 |
| Resume builder with templates + PDF | ◐ | ◐ | ○ | ● | ● | ◐ | ○ | ● | ○ | ◐ | ○ | ○ | ● R0–R7 |
| LinkedIn profile import / optimizer | ◐ | ○ | ○ | ◐ | ○ | ● (free) | ○ | ◐ import | ◐ BI | ● VMock | ○ | ○ | ◐ paste-import (R1.4); optimizer = gap |
| Mobile app / PWA | ● iOS | ● app | ○ | ◐ web | ◐ web | ○ | ○ | ● KR app | ◐ | ● | ○ | ○ | ● U17 + N area |
| Phone → laptop hand-off (save on phone, apply on laptop) | ◐ | ◐ | ○ | ◐ | ◐ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● U2.7/U5/U20.3 |
| Interview prep: question bank + AI mock (text) | ○ | ◐ | ◐ AIApply | ○ | ○ | ◐ Plus | ○ | ◐ Rezi | ● | ● | ○ | ○ | ● U9 (Pro) |
| Delivery analytics (voice/video) | ○ | ○ | ○ | ○ | ○ | ◐ | ○ | ○ | ● Yoodli/VMock | ● | ○ | ○ | ✗ dropped for now |
| Live in-interview answers | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● Final Round | ○ | ○ | ○ | **✗ never** |
| Auto-apply / auto-submit | ● Autopilot (no review) | ◐ agent | ● | ○ | ○ | ○ | ○ | ○ | ◐ FR add-on | ○ | ◐ recruiter submits | ○ | **✗ Autopilot prepares, never submits (19)** |
| Analytics: response rate by resume / ATS / company | ◐ | ◐ | ○ | ◐ | ◐ Pro | ○ | ○ | ○ | ○ | ● for schools | ● | ◐ sample | ● U12 |
| Job-scam signals on postings | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ◐ vetted employers | ○ | ○ | ◐ S area (gap) |
| Ghosting detection / follow-up nudges | ○ | ○ | ○ | ◐ reminders | ◐ | ○ | ○ | ○ | ○ | ○ | ◐ aging | ○ | ◐ U6.8 (gap: auto-ghosted) |
| Human services (review, rewrite, coaching) | ○ | ○ | ○ | ○ | ○ | ◐ perks | ○ | ◐ Rezi expert review | ◐ coaching | ● advisors | ○ | ○ | ● O9 / Phase 20 |
| Org / cohort dashboard with member consent | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ◐ Rezi Enterprise | ◐ Team | ● (no consent model) | ● (no consent) | ○ | ● O1–O8 consent-scoped |
| Consultancy marketer workspace (job bank, approved resumes, no-submit) | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ◐ (vendor-side, submits for them) | ○ | ● O10 |
| Timesheets / placements / invoices (record-only) | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● | ○ | ● H (Timesheets product) |
| BYO AI key on Free | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● | ● keep |
| Published prices, no weekly plan, no trial-trap | ○ | ○ (404) | ○ | ○ (weekly) | ● | ○ (weekly) | ● | ◐ | ○ | n/a | n/a | ● | ● + make it loud (M/B) |
| Scoped host permissions (no `<all_urls>`) | ○ | ? | ○ | ? | ? | ? | n/a | n/a | n/a | n/a | n/a | ● 15 ATS hosts + activeTab | ● publish it (T/E) |
| "No training on your data" default | ◐ stated | ? | ○ | ? | ? | ? | ? | ? | ◐ Yoodli paid-only | ? | n/a | ◐ consent per feature | ● state it (T) |
| Student / campus free or discount | ● campus origin | ○ | ○ | ○ | ○ | ○ | ○ | ● Kickresume free Premium | ● via school | ● | n/a | ○ | ○ (decision) |
| Lifetime / one-time plan | ○ | ○ | ◐ (withdrawn) | ○ | ○ | ○ | ○ | ● Rezi $149 | ● BI $299 | n/a | n/a | ✗ | **✗ "nothing is unlimited"** |

---

## 4. Where Kiwiply wins, must reach parity, and should deliberately not copy

### 4.1 Where Kiwiply wins (lean in; make it visible)

1. **The tracker that fills itself from both ends.** Submit-detect on the way out (parity with Simplify)
   *plus* the user's own Gmail inbox on the way back (interview / reject / offer → status, with the
   "never guess" matcher). No competitor in the matrix has the inbox. This is the one feature a Gen Z
   user would make a TikTok about ("it knew I got rejected before I opened the email"). Make the
   Messages/analytics surfaces (U10, U12) real early and market it.
2. **Trust by construction.** Scoped host permissions (15 ATS hosts + `activeTab`, no `cookies`/
   `webRequest`) vs Simplify's `<all_urls>`; no auto-submit; no attestation-box ticking; no employer
   revenue; no weekly plans; published prices; "cancel anytime, keep what you paid for". Every one of
   these is a line competitors are being hammered on in one-star reviews. Today none of it is *said*
   anywhere a user would see it (gap list T/M items).
3. **Autopilot that prepares, not fires.** Simplify's Autopilot "goes" without review and has to "fail
   rather than guess". Kiwiply's Phase 19 queue (READY / NEEDS_YOU / review queue in the drawer) is the
   human-in-the-loop version buyers in schools and consultancies can actually sanction. The one thing to
   borrow from Simplify is the *ask-and-remember* loop (pause on an unknown question → the answer is
   saved for next time); 19.3 parks the item but does not yet say the answer is learned.
4. **The self-building profile.** "Ask the bare minimum, derive from the resume, learn the rest while
   applying" (10.3) + card-by-card review (R1.4) is a materially shorter onboarding than any builder's
   form. Teal/Rezi/Kickresume all start with a form; Simplify starts with a resume upload and a long
   profile. The 5-screen phone onboarding (U2) ending in 3 real jobs has no equal in the matrix.
5. **Free is honest.** Core autofill free and identical on every tier; BYO key on Free; free resume
   parsing; deterministic (non-AI) lint, matches and ATS structure checks on Free. Competitors' free
   tiers are trial-shaped (Enhancv watermark, Resume.io TXT-only, Careerflow 1 resume/10 jobs).
6. **Organisations done lawfully.** Consent-scoped SUMMARY/FULL (O6) is unique in the matrix; Handshake,
   VMock and every bench-sales CRM show the organisation everything by default. For schools this is
   the compliance story; for consultancies the Marketer role is the "honest bench sales" story.
7. **One design system, phone first, dark mode, accessibility** — rare in this category (Big Interview,
   Jobscan and the auto-apply tools are visibly desktop-era).

### 4.2 Where Kiwiply must reach parity (table stakes the audience will test in week one)

| Parity item | Bar set by | Status |
|---|---|---|
| ATS coverage beyond 4 adapters: iCIMS, SmartRecruiters, Workable, Taleo/Oracle, SuccessFactors, BambooHR, Jobvite, Rippling/Dover, **LinkedIn Easy Apply**, Indeed Apply | Simplify, Huntr, Jobright | hosts declared; adapters missing (E) |
| Published, measured fill accuracy per ATS (Workday is where Simplify is weakest — ~70%) | Simplify's weakness is the opening | fixture harness unplanned (E) |
| JD snapshot at save/apply time + resume-version link on every application | Teal, Simplify, Huntr | save-a-job exists; snapshot not (E/U) |
| Per-job tailored resume + cover letter **from the drawer**, one click | Simplify+, Huntr packets, Teal+ | R5.1/R5.3/R5.5 web-side; drawer hand-off thin |
| AI answers for free-text questions on Pro (the hardest fields are essays) | Simplify+, Jobright Turbo | BYO-key only today |
| Match score on every card, explainable, with a Free version | Jobright, Teal (10 credits) | U4.2/U4.6/U4.7 planned; Free = rules only |
| Sponsorship / work-authorisation signal on postings | Jobright | U4.5 preferences only |
| Mobile app presence (PWA installable, share-target) | Simplify iOS, Jobright, Kickresume | U17 + N area |
| Question bank by role/company + AI text mock | Big Interview, Final Round mock, Rezi | U9 planned |
| Resume builder with ≥3 ATS-safe templates, PDF/DOCX, LinkedIn import | Teal, Rezi, Kickresume | R0–R7 planned |
| Contacts/networking tracker (manual, no scraping) | Huntr (unlimited contacts), Careerflow | not planned |
| In-product review prompt after a successful fill (store rating 4.8–4.9★ is the entry ticket) | Simplify, Teal, Jobright, Huntr | not planned (E/M) |
| Help centre + in-app help | all | `/help` missing (S) |
| Student discount or campus channel | Kickresume (free), Big Interview/Yoodli (via school), Simplify (campus-born) | decision needed |

### 4.3 Deliberately not copying — and why

| Competitor feature | Why not | What we do instead |
|---|---|---|
| **Auto-submit / bulk auto-apply** (LazyApply, Massive, AIApply, Simplify Autopilot, Jobright agent) | Locked: no auto-submit, no cloud auto-apply. Also the worst-reviewed products in the category; employers are ranking harder against volume; LinkedIn-ToS blacklists. | Phase 19 Autopilot prepares in the user's browser, stops at the final page, never ticks attestations. Sell *prepared, reviewed, submitted by you* as the feature. |
| **CAPTCHA solving / "undetectable" anything** | Locked. | NEEDS_YOU parking (19.3). |
| **Live in-interview copilot** (Final Round) | Reputational poison with the org buyers (schools, consultancies); Greenhouse 2026: 38% of candidates abandon AI-interview processes; "undetectable" claims fail. | Practice only (U9, Phase 20.1 text mock); say so on the pricing page. |
| **Scraping LinkedIn/Indeed for jobs or contacts** (Jobright "insider connections", Careerflow recruiter search, all auto-apply bots) | Locked: never scraping; ATS public APIs + one licensed aggregator. | Public job-board APIs (217 boards today), licensed aggregator (16.1), manual contacts (gap). |
| **Weekly plans, hidden prices, $2.95 trial traps, 72-hour refund windows** (Teal, Simplify, Careerflow, Jobright, Resume.io, Sonara, Final Round) | Locked: Free/Pro/Autopilot, monthly + quarterly, published, no trial, cancel-anytime-keep-period. It is also the #1 one-star theme for every competitor. | Make the billing honesty a marketing asset (gap M/B). |
| **Lifetime / unlimited plans** (Rezi $149, Big Interview $299, LazyApply lifetime) | Locked: "nothing is unlimited", ≥80% margin floor; LazyApply's lifetime buyers got cut back anyway. | Quarterly plan is the long-search option; a student *discount* (not unlimited) is the open decision. |
| **Employer-funded job board / recruiter marketplace** (Simplify, Jobright, Handshake) | Conflict of interest with the user; Kiwiply's trust story is "we only work for you". | Services marketplace (Phase 20) is paid by the user/org, experts vetted. |
| **AI voice/video delivery scoring** (Yoodli, VMock) | Dropped for now (locked 2026-10-05): cost, privacy of video, budget floor. | Text practice; revisit after Launch 2. |
| **Org sees everything by default** (Handshake advisor summaries, VMock, bench-sales CRMs) | Consent model O6 is the differentiator and the lawful default (16+, GDPR Art. 8). | SUMMARY by default, FULL only via explicit pairing. |
| **Recruiter submits on the consultant's behalf** (bench-sales norm) | Locked: Marketer never submits, never signs in as the consultant. | O10 no-submit guarantee, tested structurally. |

---

## 5. The Gen Z / Gen Alpha / millennial lens

**What they actually use** (sources above; 2025–2026 surveys, mostly vendor-run — directional, not precise):
- **Discovery is social and mobile.** 22% of Gen Z use TikTok as a job-search tool vs 20.8% LinkedIn
  (iHire); 76% rely on Instagram for career content vs 34% LinkedIn (Zety); 46% say they landed a job or
  internship via TikTok (Zety n=896); 95% say an employer's social presence affects whether they apply.
  ~65% of applications are completed on mobile (Appcast). **Implication:** the job is found on a phone
  from a TikTok/Instagram link; Kiwiply must capture it there (share-target, PWA, "save for laptop")
  and the share card (U16.3) must be designed to be posted.
- **They apply more and tolerate less friction.** Gen Z averages 21.9 applications per search vs 16.6
  overall; 55.6% have skipped an application because it demanded a cover letter; 55% plan to switch
  jobs this year (Robert Half). **Implication:** volume without spam — fast fills, the cover letter
  pre-drafted so it is never a reason to skip, and a tracker that absorbs 20+ applications without a
  spreadsheet.
- **AI is assumed, not feared — but it must be honest.** 55.8% of Gen Z used AI the last time they
  updated a resume; 38.6% have submitted a fully AI-written resume; 93% have used ChatGPT. They also
  know the output lies ("invented a language I do not know" — Jobright review). **Implication:**
  suggest → diff → accept with truth checks (R4/13.4) is the right posture; "Ask Kiwiply" (U8) is the
  native UI; the assistant must *do* things (save, set status, create alert), not just chat.
- **They are the scam demographic.** 69% of Gen Z apply without checking a role is genuine (Barclays);
  15–32% report being victimised (Express/Harris, WFMZ); FTC job-scam losses ~$500M/yr; scammers now
  generate postings with AI. **Implication:** scam signals on cards and a safety centre (S area) are a
  Gen Z feature nobody in the matrix offers — and a parent-/school-facing trust story.
- **They get ghosted and they know it.** 48–53% of applications go unanswered (Criteria 2025–26);
  61% ghosted after an interview (Indeed). **Implication:** expected-response timelines, "mark as
  ghosted" automation, follow-up nudges (U6.8) and the inbox-driven status are emotional relief as much
  as workflow.
- **They distrust dark patterns and talk about them publicly.** Weekly plans and trial traps are
  the stories on TikTok ("I got charged $29.95 by a resume site"). **Implication:** the billing honesty
  must be on the pricing page, in onboarding, and in the cancel flow — and be screenshot-able.
- **Millennials (second audience)** are switchers with several roles: they want one base profile and
  three targeted resumes, response-rate analytics by resume, calendar integration, and a desktop
  builder that does not feel like a toy. R (targets as resumes), U12 and U6.4 cover this; keep the
  desktop builder serious.
- **Gen Alpha (first jobs, 16+)** arrive through schools/bootcamps (O area): one-question flows, chips
  over text fields, no wall of settings, dark mode, 44 px targets, and a consent screen they can
  understand — plus the hard 16+ rule.

**What they expect from a product in 2026** (the bar set by the apps they live in, not by job tools):
instant first value (<60 s to the first fill or the first 3 jobs), autosave and undo everywhere, bottom
tabs and sheets, push that respects quiet hours, a streak that forgives, dark mode, an assistant that
can act, a share card, and a privacy panel that says plainly what is stored and who sees it. The user
plans (U0, U2, U7, U8, U14, U16, U17) already encode this; the competitive gap list adds the few
things competitors do that those plans missed.
