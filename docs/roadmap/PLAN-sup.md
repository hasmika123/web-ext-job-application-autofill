# PLAN — area `sup` (Support, help & community)

Written 2026-10-11. Machine-readable twin: `docs/roadmap/areas/sup.json` (10 epics, 55 stories:
0 done · 6 partial · 49 not started; 12 critical). Audit with the competitive benchmark:
`docs/roadmap/AUDIT-sup.md`. Deep designs: `docs/design/sup/*.md` (8 docs: help center, support
tickets, scam safety centre, AI help assistant, feedback & changelog, status & incidents,
extension help & site reports, community).

## 1. The shape of the problem

Every way to get help in Kiwiply today ends in a mailbox. The bug button, the extension's Feedback
tab and the contact form all write a row and email `support@`; the person who asked gets "Thanks 🙏"
and never sees the answer in the product. `/help` doesn't exist (the contact page literally links a
`mailto:`), the footer's "Status" goes to `/contact`, and the extension drawer — where every autofill
problem actually happens — has no way to say "this didn't work". There is no scam protection at all,
for an audience LinkedIn's 2026 data says is twice as likely to be victimised as Gen X.

The competitors are not strong here either, which is the opportunity. Simplify sits at 2.9/5 on
Trustpilot on "nine days and nothing fixed" and silent refund refusals; Jobscan replies to a minority
of negative reviews; Teal is email-only; Huntr hedges its refund policy. Handshake runs the best scam
program, but it lives in a help article and only covers postings on Handshake. Nobody answers
support **in the product**, nobody publishes per-ATS autofill status, and nobody warns **inside the
application form**. Those three are ours to take, and they cost little: Markdown articles, one ticket
table, one rules module, no new AI on Free.

Nothing here touches a locked decision: Free keeps no server AI (the help bot is retrieval-first and
Free never calls the model unless the user flips a cap from 0), "no refunds, cancel anytime" is
written where people look, the user Inbox stays IMAP-only (inbound support mail is a separate,
optional Brevo webhook), nothing auto-submits, and the scam blocklist is never a public blame list.

## 2. Epics

| Epic | Pri | What | Why it matters for the audience | Main risk |
|---|---|---|---|---|
| **S1 Help center** | P0 | `/help` from Markdown in the repo, search, ~40 articles (one per ATS, billing plainly), stats + 👍/👎, in-app help sheet, every link fixed | Self-serve is the first support channel this audience reaches for; G33 | Content effort; ATS articles need real screenshots |
| **S2 Tickets** | P0 | `support_ticket` with public id, thread, screenshot, admin reply + macros, fan-out (in-app, email, drawer), SLA stamped, privacy cascade | The receipt and the reply — the #1 complaint about every competitor | Staff time; must ship with S9.1 metrics so the SLA is honest |
| **S3 Scam safety** | P0 | `/safety` hub + local "Is this legit?" checker, report flow + Safety queue, extension "Heads up" banner, posting risk flags, blocklist, inbox label, country checklist | Gen Z is the scam demographic (32 % victims); we see the form, nobody else does; G15 | False positives on small legitimate employers; defamation (trust review) |
| **S4 Extension help & site reports** | P0 | "?" HelpSheet per adapter, one-tap "this site didn't fill" with hashed diagnostics, 👍/👎 per fill, per-ATS status, fixed-in-version card | Turns "Workday is broken" emails into a measured backlog and a visible fix | Joint ownership with `ext`; privacy of diagnostics |
| **S5 Feedback & changelog** | P1 | `feedback_event` + `ThumbsFeedback`, AI-output thumbs, public request board, changelog + what's new, CSAT/NPS, store-review prompt | "You asked, we shipped" is the loop that keeps them; G10 | Board moderation (no comments at launch) |
| **S6 AI help assistant** | P1 | Build-time embeddings, answer cards without a model, `AiTask.HELP` on a platform budget for Pro, escalation with transcript, eval gate | Conversational help with honest "I don't have that"; cheaper than a ticket | Policy hallucination (eval gate), the Free exception question |
| **S7 Status & incidents** | P1 | Incident model, public `/status` that survives an API outage, scoped drawer/app banners, subscriptions | "Is it me or them?" answered before a ticket; G32 user-facing half | Probe data is `plat`'s; manual until then |
| **S8 Community** | P2 | Discord kit + 16+ gate + moderation playbook, `#is-this-legit` bot, ambassadors, bridges; kill criteria | Where they already ask "is this legit?"; must not become a second queue | Moderation load; minors |
| **S9 Support ops** | P1 | Metrics + SLA alert, tags/bulk/timeline, knowledge-gap report, SUPPORT role scoping, runbooks | A two-person team answering like a ten-person one | Depends on A0.3 for the role |
| **S10 Policies, a11y, i18n, orgs** | P1 | Published support policy from one constants file, axe over support routes, Spanish pilot of safety + top 10, org-aware routing | No surprises; the most vulnerable audience isn't English-only | Translation review cost |

## 3. Recommended build order — first 10

The skeleton: **a user hits a broken Workday form → taps "?" → reads the Workday guide → taps "this
site didn't fill" → sees ticket KW-… in Settings → gets the reply in-app and by email → the drawer
says "fixed in 0.66" → `/status` showed "Workday degraded" the whole time.**

| # | Story | Why here |
|---|---|---|
| 1 | **S1.1** `/help` route + renderer + six seed articles | Everything links here; one session; unblocks S1.7's link fixes immediately |
| 2 | **S2.1** Ticket model + API + legacy adapter | The object every other loop writes to; pure API |
| 3 | **S1.2** Search index + `/api/help/index` | Unblocks the drawer HelpSheet and the Help sheet |
| 4 | **S2.2 → S2.5** My requests + thread, then the Message-us sheet replacing the floating widget | First visible "support is real" moment; fixes the phone overlap leftover |
| 5 | **S2.6** Admin reply + macros + fan-out | Closes the loop; without it tickets are the old mailbox with an id |
| 6 | **S4.1 → S4.2** Drawer HelpSheet, then "this site didn't fill" | The extension's biggest support gap; feeds the ATS backlog with data |
| 7 | **S3.1 → S3.2** Scam rules module + `/safety` hub with the checker | Pure client-side, no AI, shippable in two sessions; the differentiator |
| 8 | **S5.1** `feedback_event` + `ThumbsFeedback` | Tiny; S1.4, S4.3, S5.2, S6.1 all hang off it |
| 9 | **S1.3** Content pass (40 articles) + **S1.7** link switch | Content can run in parallel from #1; links flip once `/status` (S7.2) exists or point to `/help` until then |
| 10 | **S9.1 + S10.1** Metrics and the published policy together | Never publish an SLA we don't measure |

Then in parallel lanes (strict file ownership, one Sonnet agent each):
- **Lane A (API):** S2.4 attachments, S2.7 privacy cascade, S3.3 scam reports + queue, S7.1 incidents,
  S9.2 tags/bulk, S9.4 SUPPORT role (after A0.3).
- **Lane B (web):** S1.4 stats, S1.6 Help sheet, S3.8 what-now checklist, S5.3 request board, S5.4
  changelog, S7.2 `/status`, S10.2 a11y.
- **Lane C (extension, with `ext`):** S3.4 Heads-up banner, S4.3 fill thumbs, S4.5 fixed-in-version
  card, S5.6 review prompt, S7.3 banners, S6.3 drawer Ask.
- **Lane D (AI/Pro):** S6.1 retrieval cards → S6.2 HELP task → S6.4 eval gate; S5.2 AI thumbs; S3.5
  posting risk flags once U4.1's schema lands.
- **Later:** S3.6 blocklist, S3.7 inbox label, S2.8 inbound mail (if approved), S8.* community, S10.3
  Spanish pilot, S10.4 org routing (after O1.1).

Launch-critical (P0) before the phone cohort is invited: S1.1–S1.3, S1.7, S2.1–S2.3, S2.5–S2.7,
S3.1–S3.4, S4.1–S4.2, S10.1.

## 4. Competitive gaps folded in (from `COMPETITIVE-GAPS.md`, commit 0843de1)

- **G15** (S,U) scam signals on cards + safety centre → S3.1, S3.2, S3.4, S3.5 (card chip with
  reasons when ≥ 2 rules fire; `/safety`; Pro "explain" via S6.2). Accepted in full; we went further
  with the in-form warning (S3.4) and the local checker.
- **G33** (S) `/help` with ATS guides, linked from the drawer → S1.1, S1.3, S4.1. Accepted in full.
- **G2** (E,M) public fill-accuracy table — hosted on `/help` by S1.5; the harness and numbers stay
  with `ext`, the honest-claims publishing with `mkt`.
- **G30** (T,E,M) permissions explainer — hosted on `/help` by S1.5 with the manifest drift check;
  wording review stays with `trust`.
- **G32** (P) public status page — the user-facing half is S7.1–S7.4; `plat` owns A10 probes that
  feed it. We don't claim uptime numbers until those exist.
- **G10** (E,M) store-review prompt — built as S5.6 because it is a feedback surface; `ext` reviews.
- **G34** (M,B) campus channel — only the program side (ambassadors, S8.3); the discount is the
  `mkt`/`pay` decision.
- **Rejected / not duplicated: G28** (O/S expert resume review service) — already covered by O9.1–O9.10
  and Phase 20; this area adds nothing but the support routing for service customers (S10.4 pattern).
  **Not adopted:** a Simplify-style weekly "Ask AI" over everything — the help bot is scoped to help
  content by design (U8 owns the product assistant). **Not adopted:** LinkedIn-style verification
  badges — no network to verify against; the checker + blocklist is the honest substitute.

## 5. Experience principles for Gen Z / Gen Alpha / millennials

Help should feel like texting a friend who happens to know the product: **search box first, two big
buttons, one tap per step**. A receipt for everything ("KW-7F3A2Q, reply due tomorrow 14:00") because
silence is the thing this audience punishes with a one-star review. Answers arrive **where they are**
— in the drawer, in the app, on the phone — and email is the backup, never the channel. Safety is
**shame-free and local**: the checker runs on their device, nothing is sent unless they tap Report,
and the copy is "3 things look off", never "you were fooled". Honesty is a feature: the SLA is
measured before it is published, the status page says "last updated 12 min ago" when the API is
down, the billing article says "no refunds" in the first sentence, and "we don't have that in help
yet" is an allowed answer from the bot. Accessibility and Spanish are not phases two; the most
vulnerable job seekers are the most targeted. For millennials the same system reads as calm and
professional: tickets, policies, status — nothing cute gets in the way of the answer.

## 6. How we beat the competition

1. **Support answered in-product with a visible SLA** (S2 + S9.1 + S10.1): none of Teal, Simplify,
   Huntr or Jobscan does it; their one-star themes are silence and surprise charges.
2. **The only tool that warns inside the application form** (S3.4) and flags postings with reasons
   (S3.5) — Handshake and LinkedIn can only act on their own platforms; we see the form fields.
3. **"This site didn't fill" in one tap with diagnostics, and per-ATS public status** (S4.2 + S4.4 +
   S7.2): the extension category's biggest complaint becomes a measured backlog users can see.
4. **Help that grows from real questions** (S1.4 + S9.3 + S6.4): search misses and 👎 become the next
   article; the bot is retrieval-first and cheaper than a ticket.
5. **A feedback loop that closes visibly** (S5.3 + S5.4): "You asked: #184 — fixed in 0.66".

## 7. Dependencies on other areas

- **A (admin):** A0.3 staff roles (S9.4), A1.7 user timeline (S9.2 link), A5.1/A5.3 runtime settings
  and flags (S2.8, S3.6, S6.2, S7.3), A4.3 kill switches (S6.2), A8.2/A8.4/A8.5 queue upgrades (S2.6
  reuses QueueCard and the group_key approach), A10 alerts/probes (S7, S9.1).
- **U (user):** U0.1/U0.2 shell + Sheet primitive (S1.6, S2.5), U4.1 posting schema (S3.5), U4.6
  match feedback (shares `feedback_event`), U10.1 Messages (S3.7), U14.4 help panel (superseded in
  spirit by S1.6; not edited), U19.1/U19.3 a11y + test infra (S10.2), U20.x extension sync (S4.5).
- **R:** R0.6 `FileStorage` seam (S2.4). **O:** O1.1 tenant model, O5.4 STAFF (S10.4).
- **ext / mkt / plat / trust / ai (cross-cutting, not yet written):** adapters and the accuracy
  harness (S3.4, S1.5), honest-claims register (S1.5), compose/edge for the Discord bot (S8.2) and
  monitors (S7), defamation/privacy review of the blocklist and diagnostics (S3.6, S4.2), AI gateway
  changes (S6.2).

## 8. Status honesty

Nothing is `done`. The six `partial` stories are the surfaces that exist as intake with no reply
path: S1.3 (five landing FAQs), S1.6 (settings help card), S2.3 (contact form), S2.5 (floating bug
widget), S2.6 (admin queues without reply), S4.1 (extension Feedback tab). Each AC says exactly what
remains.

## 9. Top risks

1. **Publishing an SLA we can't keep.** Mitigation: S9.1 ships with S10.1; macros + help deflection
   first; the policy page reads the same constants the metrics measure.
2. **Scam-checker false positives hurting small employers.** Mitigation: hedged "Be careful" band,
   ATS/vendor allowlist, "This is legit" feedback, internal-only blocklist, trust-area review.
3. **Diagnostics privacy in site reports.** Mitigation: per-install salted hashes, host only, consent
   per report with a preview, PRIVACY.md paragraph.
4. **AI help drifting from policy.** Mitigation: facts sheet generated from the catalog, 40-question
   eval gate in CI, Free never calls the model by default.
5. **Community becoming a second, unmeasured support queue.** Mitigation: redirect bot, staff rota,
   kill criteria at 90 days.
6. **Content debt.** ~40 articles + 9 safety pages + Spanish pilot is real writing; schedule S1.3 as a
   parallel content lane from day one.

## 10. Open questions for the user

1. **Free AI help cap:** keep `help.ai.free_daily_cap = 0` (strictly no server AI on Free, answer
   cards only), or allow a small second exception (e.g. 3 grounded help answers/day on the platform
   support budget, ≈ $0.001 each)?
2. **Inbound email → ticket (S2.8):** build the Brevo inbound webhook so people can reply from their
   inbox, or keep support strictly in-app + outbound email only?
3. **SLA targets:** Pro/Autopilot 1 business day, Free 2, site/scam reports 1 for all — acceptable as
   the published promise, or should Free be "best effort" until the team grows?
4. **Community:** launch the Discord at all before Launch 1, or keep S8 parked until there are
   ≥ 1 000 weekly actives to populate it (the kill criteria suggest waiting)?
5. **Support mailbox identity:** keep `support@kiwiply.com` as the human-read fallback (it exists in
   the store listing and PRIVACY.md) and route it into tickets later, or retire it from public copy once
   S1.7 lands?
6. **Spanish pilot scope (S10.3):** safety hub + top 10 articles first, or wait for the broader i18n
   decision in U19?
