# AUDIT — area `sup` (Support, help & community)

Written 2026-10-11 against branch `product-roadmap` (= `version2` + design docs). Method: every
route, component, API resource and extension surface that a stuck, confused, scared or delighted
user could reach to get help, report something or tell us what they think. State legend:
**real** = real data + API + tests · **partial** = exists but fire-and-forget, dead-ended or
sample-backed · **missing** = nothing behind the link (or no link). Evidence paths are relative to
the repo root.

Companion: `docs/roadmap/PLAN-sup.md`, `docs/roadmap/areas/sup.json`, `docs/design/sup/*.md`.
Overlapping stories in other areas are referenced by id (U14.4, A8.1–A8.5, A1.5, A1.7, A5.3, U4.6)
and never edited here.

## 0. What is real underneath (reusable foundation)

| Capability | Evidence | Notes |
|---|---|---|
| Bug/idea intake (web + extension), public, auth-optional, consented diagnostics | `api/src/main/java/com/dossier/api/web/rest/BugReportResource.java`, `service/BugReportService.java`, `liquibase/changelog/20260629000300_bug_report.xml`, `web/src/app/api/bug-reports/route.ts` (BFF, 10/h/IP), `job-autofill/src/lib/tracking.js:544-549` (`submitBugReport`) | Stores `source, user_login, email, message, category(BUG/IDEA/OTHER), severity, status(NEW→TRIAGED→IN_PROGRESS→RESOLVED/WONTFIX), url, app_version, user_agent, admin_notes`. **No reply path, no user-visible record, no screenshot.** |
| Support notification email on each report/inquiry (best-effort, async) | `BugReportService.notifySupport`, `SalesInquiryService.notifySales` → `MailService.sendEmail(to, subject, html, multipart, isHtml)` (`service/MailService.java:55`); `dossier.bug-report.notify-email` / `dossier.sales.notify-email` default `support@kiwiply.com` | Brevo SMTP from `no-reply@kiwiply.com`. The human reply, if any, happens in a mailbox outside the product. |
| Contact-us inquiries (sales topics), queue in admin | `web/src/app/(marketing)/contact/page.tsx`, `components/pricing/ContactForm.tsx` (1000-char cap, BFF 5/h/IP), `api .../SalesInquiryResource.java`, `SalesInquiryService.java` (topics mirror `web/src/lib/catalog.ts`; anything else → `other`), `20261005010000_sales_inquiry.xml`, `InquiryStatus{NEW,CONTACTED,WON,LOST}` | Built for **sales** (Autopilot/org/services). "Help & support" on the contact page is a card with no distinct path — a support question becomes an `other` sales inquiry. |
| Admin queues for both | `web/src/components/admin-v3/bug-reports/BugReportsPage.tsx`, `admin-v3/inquiries/InquiriesPage.tsx`, `components/admin/BugTriageControl.tsx`, `InquiryFollowUp.tsx`; audited via `AdminAuditService.BUG_TRIAGE_UPDATE` / `INQUIRY_UPDATE` (`service/AdminAuditService.java:42-46`) | Owned by admin A8.1/A8.3 (done) and A8.2/A8.4/A8.5 (planned). This area adds the **user side** and the conversation, not another queue. |
| Floating bug button on every page | `web/src/components/BugReportWidget.tsx`, mounted in `web/src/app/layout.tsx:63` | Draggable circle with a one-time nudge; marketing + app + admin. Known leftover: floats over content on phones (`docs/HANDOFF-ROADMAP.md` §6). |
| Extension "Feedback" tab | `job-autofill/entrypoints/options/OptionsApp.tsx:46,398-446` | Same three categories; consent switch for browser + extension version; not tied to the page the user was on. |
| Settings → Help & Support card | `web/src/app/(app)/settings/page.tsx:193-203`, tab in `components/app-v3/settings/SettingsV3Page.tsx:15` | Three links: Contact, Privacy, Terms. No FAQ, no articles, no status, no ticket history. |
| Landing FAQ (5 questions) | `web/src/components/marketing/v3/V3Faq.tsx:8-30` | Native `<details>`; not searchable; linked from the contact page as "/v3#faq". |
| Fill telemetry (anonymous, per fill) | `20260922000000_fill_event.xml` (`ats, adapter, fields_found/filled/failed, required_left_empty, user_corrected, ext_version`) | The raw material for "report a broken site" — today it's counts only, no user-initiated report, no link to a bug. |
| In-app notifications + bell | `NotificationResource`, `20260923030000_notifications.xml` | A reply to a support request could ride this; nothing does yet. |
| Admin runtime settings (`app_setting`) | `20261011010000_app_setting.xml` (`setting_key/value`, seeded `demo.enabled`) | Where a status banner / support hours / AI-help switch can live without a deploy (A5.1). |
| AI gateway with task metering | `api/src/main/java/com/dossier/api/service/ai/{AiTask,AiPolicy,AiPricing,AiProvider,GeminiAiProvider}.java` (tasks DRAFT, PICK, MAP, ENRICH, PARSE, MATCH, FIT, TAILOR, JOBS, INBOX) | An AI help assistant is a new `HELP` task behind the same gateway and budgets. |
| Rate-limited BFF helper | `web/src/lib/rate-limit.ts:40` (`rateLimit(request, bucket, limit, windowMs)`) | Reused for every new public intake (tickets, scam reports, feedback). |
| Store-listing support contacts | `job-autofill/STORE-LISTING.md:132` (support email + `https://kiwiply.com` as the support site), `job-autofill/PRIVACY.md:148` | The Chrome Web Store "support site" points at a homepage with no help section. |

Not present anywhere: a `/help` route or any help article · a support ticket the user can see ·
replies from the team inside the product · a status page · a changelog / "what's new" ·
👍/👎 on any AI output, article or match (U4.6 plans it for matches) · feature requests / voting ·
CSAT/NPS · a scam-safety page, scam reporting, or any scam warning in the extension or job store ·
a community (Discord/Slack/forum) or a link to one · keyboard-shortcut help · support macros/SLA ·
inbound email → ticket · article analytics · help content in any language but English.

## 1. Surface-by-surface

| Surface | State | Real today | Dead-ended / missing | Evidence | Gaps → stories |
|---|---|---|---|---|---|
| `/help` (help center) | **missing** | — | No route. The contact page sets `HELP_HREF = "mailto:support@kiwiply.com"` and comments "There is no /help route yet". Footer "Browser Extension Help" → `/signup`; "Status" → `/contact`; "Blog/Career Guides/Interview Questions" are "Soon" chips | `web/src/app/(marketing)/contact/page.tsx:34-36`, `web/src/components/marketing/nav.ts:105-131` | S1.1–S1.7 (critical) |
| `/contact` | **partial** | Form → `POST /api/inquiries` → admin Inquiries (sales). Cards: General questions · Enterprise · Help & support · "We usually reply by email within two business days" | A support question is routed as a sales inquiry with `topic=other`; no account context, no ticket id, no way to see the answer in-app. The "two business days" is a promise with no measurement behind it | `contact/page.tsx:26-31`, `SalesInquiryService.TOPICS` | S2.1–S2.3, S2.6 |
| Bug button (every page) | **partial** | Posts message + category + optional email + consented URL/UA; 10/h/IP; support@ email; admin triage | Fire-and-forget: the reporter never hears back unless someone emails them by hand; no screenshot; no "my reports"; covers the phone content; the same widget is on marketing, app and admin pages | `BugReportWidget.tsx`, `BugReportService.submit` | S2.1, S2.4, S2.5 |
| Settings → Help & Support | **partial** | Contact/Privacy/Terms links | No FAQ/articles, no "My requests", no status, no shortcuts, no version, no "what's new" (U14.4 plans a bug sheet + FAQ links; this area supplies the destinations) | `(app)/settings/page.tsx:193-203` | S1.6, S2.3, S5.4 |
| Extension drawer (`panel/`) | **missing** (for help) | Header has Settings + Close only | No "?" / help, no "this site didn't fill" report, no per-ATS tips, no "did this fill work?" | `job-autofill/entrypoints/panel/HomeView.tsx:205-225` | S4.1–S4.4 (critical) |
| Extension options → Feedback | **partial** | Bug/idea form, consent switch, `submitBugReport` through the seam | Not tied to a page/ATS; no reply path; no help links; no changelog | `OptionsApp.tsx:398-446`, `tracking.js:544` | S4.1, S5.4 |
| Scam safety (anywhere) | **missing** | — | No page, no checker, no reporting, no warnings on job pages, no posting-level flags, no "what to do if it happened" | — | S3.1–S3.8 (critical) |
| AI support | **missing** | — | No help bot; the planned Ask Kiwiply (U8) is a product assistant grounded in user data, not help content | `docs/design/user/ai-assistant.md` | S6.1–S6.4 (critical) |
| Feedback loops | **missing** | — | No 👍/👎 on AI drafts, tailoring, help answers; no feature requests or voting; no CSAT after support; no "what's new" | U4.6 plans match feedback only | S5.1–S5.6 |
| Status / incidents | **missing** | — | Footer "Status" → `/contact`; admin observability (A10) has no public face; nothing tells users "the ATS adapter is broken, we know" | `nav.ts:131` | S7.1–S7.4 |
| Community | **missing** | — | No Discord/Slack/forum, no link, no code of conduct, no ambassadors; 16+ rule for school orgs exists in the org design but no community policy | `docs/design/org/consent-data-sharing.md` | S8.1–S8.4 |
| Support ops (admin side) | **partial** | Queues + notes + audit (A8.1/A8.3) | No reply from the queue, no macros, no SLA clock, no tags, no knowledge-gap report, no CSAT, no inbound mail; A8.2/A8.4 add assignee/priority/first-response but still no outbound reply | `AdminBugReportResource.java`, `AdminSalesInquiryResource.java` | S2.6–S2.8, S9.1–S9.4 |

## 2. Cross-cutting gaps

1. **Nothing closes the loop.** Every intake (bug, idea, inquiry) ends in a support mailbox and an
   admin row; the person who asked gets a "Thanks 🙏" and silence. There is no object a user can
   point to ("my request #1842"), so there is no SLA, no CSAT, no "it's fixed" notification.
2. **Help is a mailto.** The contact page, the store listing and the footer all promise a help
   center that does not exist. For an extension product, 80 % of support volume is "site X didn't
   fill" / "where is the button" / "cancel my plan" — exactly what articles answer at zero cost.
3. **The extension is mute.** The drawer, where every autofill problem happens, has no way to say
   "this didn't work" with the ATS/adapter context we already measure in `fill_event`.
4. **No scam protection at all** for an audience that LinkedIn's own 2026 data says is the most
   victimised (Gen Z 32 % vs Gen X 17 %) and most likely to ignore warning signs (32 %).
   Kiwiply sees the posting, the employer domain and the application form — it is in a unique
   position to warn *before* the user types an SSN into a fake "onboarding" form.
5. **Support PII has no lifecycle.** `bug_report.email/url/user_agent` and `sales_inquiry` rows
   are kept forever and are not part of the GDPR deletion cascade (`AccountDeletionResource`).
6. **Locked-decision pressure points:** Free has no server AI (so an AI help bot needs its own
   budget line and plan rule); "no refunds, cancel anytime" must be written plainly in help, not
   discovered in a ticket; the Inbox decision (user's own Gmail) does not cover a support mailbox,
   so inbound-email-to-ticket needs its own, separate mechanism (Brevo inbound webhook) or none.

## 3. Competitive benchmark (checked 2026-10-11)

Scope: help centers, support channels and response times, communities, scam-safety content, and
what users complain about. Sources are the vendors' own pages plus Trustpilot/BBB/FTC/LinkedIn data.

| Product | What it does best (support/help/safety) | What users complain about | Kiwiply: beat / match / don't copy |
|---|---|---|---|
| **Teal** (tealhq.com) | HelpScout-hosted docs (`tealhq.helpscoutdocs.com`) with plain billing articles (e.g. "Changing & Canceling Your Teal+ Subscription", cancel button only on recurring plans, `membersupport@tealhq.com`); a "community" framing (members paired with members, workshops library) — https://tealhq.helpscoutdocs.com/article/30-changing-canceling-your-teal-subscription, https://www.unite.ai/tealhq-review | Email-only support; no status page; the peer "community" is a marketing promise, not a visible forum (Trustpilot 106 reviews: https://ca.trustpilot.com/review/tealhq.com) | **Match** the plain-English billing articles. **Beat** with in-product tickets and a visible reply. **Don't copy** the email-only funnel. |
| **Simplify** (simplify.jobs) | Featurebase help center: 14 collections / 58 articles, "Ask AI" search, a public **Feedback site + Roadmap** (`help.simplify.jobs`); cancel article promises use until period end — https://help.simplify.jobs/, https://help.simplify.jobs/en/articles/8410005-how-to-manage-or-cancel-your-subscription | Trustpilot **2.9/5** (20): "you can't take 9 days and then not fix anything", refund refused "even though there is no refund policy in place on their website", extension "not able to scan the job description" — https://www.trustpilot.com/review/simplify.jobs | **Match** AI search over help + a public feedback/roadmap board. **Beat** on first-response time (publish and measure it) and on a refund policy stated plainly ("no refunds, cancel anytime" is a locked decision — say it everywhere). **Don't copy** silent refund refusals. |
| **Huntr** (huntr.co) | Intercom help center with task-level articles (Job Tracker, Chrome extension, autofill, dashboard), chat **or** email, an explicit **billing FAQ / troubleshooting** article and a written refund policy (3-day window after a second billing period, never after 14 days) — https://help.huntr.co/en/collections/10297189-job-tracker, https://help.huntr.co/en/articles/9859119-refund-policy, https://help.huntr.co/en/articles/10827983-billing-faq-troubleshooting | Refund rules are hedged ("not guaranteed, high engagement may disqualify"); support email obscured on the page | **Match** the task-level article structure and the billing troubleshooting article. **Beat** by making the policy unhedged. |
| **Jobscan** (jobscan.co) | Large learning center; Trustpilot 4.3/5 (330) with some "incredibly prompt" replies; Capterra lists email/help desk, knowledge base, phone — https://www.trustpilot.com/review/jobscan.co, https://www.capterra.co.uk/software/1060858/jobscan | Replies to only 21–46 % of negative reviews; ComplaintsBoard: "waiting an entire week for responses… is not acceptable", 0 % resolution rate; Dec-2025 cancellation dispute (access cut early, promo link instead of confirmation) — https://www.complaintsboard.com/jobscan-b134885, https://ie.trustpilot.com/review/jobscan.co?page=8 | **Beat** with a visible SLA clock and a cancel flow that confirms in writing. **Don't copy** retention offers in place of answers. |
| **Handshake** (joinhandshake.com) | The best **scam program** in the set: "How to Spot and Report Scams on Handshake" help article, a three-dot "report employer/message" flow on every posting, a Safety team that investigates, employer verification; amplified by hundreds of university career-center pages — https://support.joinhandshake.com/hc/en-us/articles/34476362391831-How-to-Spot-and-Report-Scams-on-Handshake, https://careers.uw.edu/resources/identifying-scam-and-fraudulent-job-postings/, https://careers.usc.edu/blog/2025/11/14/3-tips-to-identify-and-avoid-fraudulent-job-postings/ | Safety content lives in a help article, not where the student is deciding; reporting only covers postings on Handshake | **Match** report-on-the-posting + an investigating owner. **Beat** by warning inside the application page (we see the form) and by covering off-platform scams (WhatsApp/Telegram recruiters) that Handshake can't. |
| **LinkedIn** (Job Search Safety Pulse 2026) | Verification badges on recruiters/companies/jobs, reduced visibility for likely scams, 98.7 % of scam content removed by automation, community reporting; the data: 90 % of scam messages push off-platform, Gen Z 32 % victims vs Gen X 17 %, 32 % of Gen Z ignore warning signs, 62 % saw a suspected fraudulent job — https://news.linkedin.com/2026/LinkedIn-Job-Search-Safety-Pulse, https://www.linkedin.com/help/lms/answer/56325 | Verification is a platform moat we can't replicate; help is generic; no personal "was this a scam?" tool | **Don't copy** badges (we have no network). **Beat** with a personal checker + an on-page "this employer domain doesn't match the posting" signal. Use LinkedIn's statistics in our copy. |
| **Indeed** | Clear "I may have been scammed — what can I do" nine-step checklist (stop contact, police, bank, report to Indeed, IC3, real company, DOL, FTC identity theft, secure devices); "Spam vs scam" explainer; firm rule "Indeed never contacts you by social media or text" — https://www.indeed.com/help/job-seekers/articles/30495177212301-i-may-have-been-scammed-what-can-i-do, https://au.indeed.com/help/job-seekers/articles/360040122351-spam-vs-scam-spotting-the-difference, https://www.indeed.com/news/releases/how-to-spot-and-avoid-job-offer-scams | US-centric agencies; reporting path buried; nothing proactive on the user's side | **Match** the after-the-fact checklist, localised by country (FTC/IC3 · Action Fraud · ACSC/Scamwatch · Canadian Anti-Fraud Centre). |
| **Reddit** (r/jobs, r/recruitinghell, r/Scams) + ad-hoc Discords | Where Gen Z actually asks "is this legit?" — peer answers in minutes, screenshots, no account needed; many job-seeker Discords (e.g. OffSec jobs channel, NextJob hub 24 k members) — https://discordbotlist.com/servers/nextjob-hire-freelance-job-1224897044259278858 | Unmoderated advice, scammers inside the communities, no accountability | **Match** the speed with a moderated Discord + a `#is-this-legit` channel staffed by the scam checker. **Don't copy** open DMs for minors. |
| **FTC / FBI IC3 / BBB (context)** | Job-scam losses tripled 2020→2023; > $220 M in H1 2024; task scams 20 k reports in early 2024 vs 5 k in all 2023; only ~4.8 % of victims report; BBB: young adults 5× more likely to report a job-scam loss; IC3 2025 ages 20–29: 4,555 complaints / ~$33 M (secondary) — https://www.ibj.com/articles/job-scams-are-on-the-rise-and-more-people-are-falling-for-them-ftc-says, https://ny1.com/nyc/all-boroughs/ap-top-news/2025/07/09/beware-of-scams-that-promise-good-pay-for-completing-easy-online-tasks, https://techbullion.com/job-scam-statistics-fbi-ftc-data/ | — | This is the "why now" for the safety centre and the reason reporting must be one tap and shame-free. |

**Where Kiwiply can be best-in-class:** (1) the only tool that **warns inside the application**
(domain mismatch, SSN/bank fields before an offer, pay-to-apply) because the extension reads the
form; (2) **support that answers in-product** with a visible ticket, SLA clock and "fixed in
v0.66" close-out — none of the seven does this; (3) **"this site didn't fill" in one tap** with
the adapter context attached, feeding the ATS backlog publicly (status page per ATS); (4) honest
policy pages — cancel-anytime/no-refund stated where people look, matching the locked decision.
**Must match:** a real help center with AI search (Simplify), task-level articles (Huntr), a
public feedback/roadmap board (Simplify), report-a-scam on the posting (Handshake), the
after-the-fact checklist (Indeed). **Should not copy:** verification badges (no network),
email-only support, hedged refund policies, retention offers instead of answers.

## 4. Honest status counts for the stories in `areas/sup.json`

`done` (0): nothing in this area is end-to-end (every existing intake lacks the reply path, so it
is `partial` by this area's definition). `partial` (6): bug intake web, bug intake extension,
contact form for support topics, settings help card, landing FAQ, admin queues (as the back end of
tickets). `not_started`: everything else (help center, tickets, scam safety, AI help, feedback,
status, community, support ops).
