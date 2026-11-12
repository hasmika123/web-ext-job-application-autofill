# What is left to build (enterprise), 2026-11-10

> One list of everything that was **faked in the demo** (2026-10-19) or is **missing for handing a real consultancy its own instance**.
> Sources: `demo/DEMO-PLAN.md`, `deferred/*`, `qa/REAL-GAPS-A/B/C.md`, `08-decisions-for-user.md`, `44-deployment-plan.md`, plus a code check on `ent-demo-p1`.
> Size: **S** = under a day · **M** = 1–3 days · **L** = a week or more. "Yours" = a step only you can do (money, servers, legal, merges).

## The one thing to know first

> **Update 2026-11-10: B1 and B2 are built** (branch `ent-licences`, `LICENCES-BUILD.md`). Licences now work without money. The paragraph below describes the state before that.

**Licences are not real yet.** The database has licence tables, but only the demo seeders write to them. There is no page or API that gives a consultant a licence. The demo seeders also supplied the data behind AI help, the Gmail inbox and Autopilot Prepare. **A brand-new organization would get none of the three.** This is the root blocker, so it is item **B1** below.

---

## 0. Housekeeping before new work (yours)

| # | Item | Note |
|---|---|---|
| 0.1 | **4 open PRs into `version2`:** #131 demo prep, #132 job descriptions, #133 UI refresh Phase 1, #134 resume parser | `ent-demo-p1` is 52 commits ahead of `version2`. New work should start from wherever these land. |
| 0.2 | **`version2` → `main` (PR #130) = production deploy** | First: a DB dump copied off the box, a migration review, prod flags off, and the Caddy routes. |
| 0.3 | **Backups go live** | The scripts are done. Still needed: bucket, IAM user, cron, the first dump and a restore drill. Without it, the 2026-09-17 data loss can happen again. |
| 0.4 | **A fresh database fails to migrate on MySQL 8.4+/9** (S, code) | Foreign keys onto `hr_employee(org_id, id)` are refused, and the demo works around it on every start. Also check which MySQL version prod runs. |

---

## 1. Shown in the demo, but faked behind the scenes

| # | What the audience saw | What was really behind it | Real build needed | Size |
|---|---|---|---|---|
| D1 | **Pro AI** in the extension: answer help, best resume, job fit | A fake AI (`ai-stub`), plus an admin AI-quota override per consultant. `isPro()` is always false for enterprise logins. | AI budget comes from the org licence (see B2), plus a real AI provider key and a cost check | M |
| D2 ✅ | **Marketer tailors a resume** (58% → 87%; built 2026-11-11, `MKT-TAILOR-BUILD.md`) | A preset for one job and one consultant (`lib/ent/demo/tailor-preset.json`). The steps run on a timer. | A marketer tailoring endpoint (acting for the consultant over `ResumeTailorService`), a real before/after score and keywords, and a tailoring UI for any job | M–L |
| D3 ✅ | **Tailored resume goes with the job into Prepare** (built 2026-11-10, `PINNED-RESUME-BUILD.md`) | Pinned only for the preset job, in the browser. The server has no field for it. | `mkt_opportunity.resume_id` (additive migration), a `resumeId` on `ConPrepareDTO`, and a real "consultant approves the marketer's resume" step | M |
| D4 | **Gmail inbox updates applications** | A sample mailbox (fake IMAP, mails sent from a fake Gmail page). A real Gmail was never run live. | A real-Gmail rehearsal, a key-handling runbook (`DOSSIER_INBOX_KEY`), and a check of which moves reach the marketer's board (only with the consultant's sharing consent) | S–M |
| D5 ✅ | **Job matches "using AI"** (wording fixed 2026-11-11: called rule-based ranking; real AI scoring is still an option) | Rule-based formulas (skill overlap, location, experience) | Either change the wording (S) or build real AI scoring (M) | S / M |
| D6 ✅ | **Interview prep "AI questions"** (wording fixed 2026-11-11: practice questions you score yourself; AI questions are still an option) | A fixed question list, scored by the consultant themself | Either change the wording (S) or have AI generate the questions (M) | S / M |
| D7 | **My Features usage tiles** ("AI credits left 50 of 50") | Hard-coded numbers; usage is never counted | Real usage metering per consultant, tied to B1/B2 | M |
| D8 | **Organization-branded extension** (no Kiwiply anywhere) | A script re-skins a dev build on this laptop (`brand-extension.mjs`). It keeps the same extension ID. | A per-org build, signing and store-listing pipeline (Chrome, Edge) | L |
| D9 | **Autopilot on Workday and SmartRecruiters** | Local copies of those sites. SmartRecruiters sits behind a bot check (never bypassed), and real Workday was never filled past step 1 in a batch. | Test the multi-step fill on a real Workday posting. Accept that SmartRecruiters stays manual. Merge PR #132 (full job text on Greenhouse, Lever and SmartRecruiters). | S–M |
| D10 | **Demo sign-in tabs** (passwordless "sign in as") | Only on when `DEMO_ENABLED` is set | Confirm it is off and unreachable on prod and on real tenants | S |
| D11 | **Extension Jobs tab** | Only "Open posting" and "I applied". Interested, Decline and Need info exist in code but have no buttons. | Add those buttons, plus a "Prepared" status the marketer can see | S–M |
| D12 | **Autopilot on/off for the whole platform** | API call only, with no page | A switch on the platform admin settings page | S |

---

## 2. Needed to hand a consultancy its own instance

### A. Setting up a new organization

| # | Item | Status | Size |
|---|---|---|---|
| A1 | Create the organization, its owner and its subdomain | **Built** (platform admin "Create organization") | — |
| A2 ✅ | **Onboarding runbook and checklist**: create, enable modules, branding, invite people, give licences (written 2026-11-11, `ONBOARDING-RUNBOOK.md`) | Not written. The licence step has nothing behind it (B1). | S |
| A3 ✅ | **Bulk import** of consultants and resumes (CSV / many files; consultants from a CSV with their invitation built 2026-11-11, `ONBOARDING-BUILD.md`; resumes in bulk left out by user decision) | Not built. Only a bulk e-mail invite exists. A real consultancy arrives with 50–150 people. | M–L |
| A4 | **Custom domain** (e.g. `jobs.aaruna.com`): DNS check, certificate, Domains page | Tables and host lookup exist. Not built: the API, the checks and the page. | L |
| A5 | **Edge Caddy change** for custom domains (on-demand certificates, deny rules) | Yours: you apply it on the shared box | yours |
| A6 | **Extension works on a custom domain** (connect, Prepare batch) | Blocked: the extension trusts `*.kiwiply.com` only | M |
| A7 ✅ | **Real enterprise accounts carry their organization** (the demo members were special-cased; checked 2026-11-11, runbook §5) | Check that invited and created accounts work in connect and profile-version without the demo special case | S |
| A8 | **Org terms / data processing agreement** at sign-up | Not built; legal text is yours | S + yours |

### B. Licences and billing

| # | Item | Status | Size |
|---|---|---|---|
| **B1** ✅ | **Licence administration**: give, change and remove a consultant's licence and add-ons (Pro AI, inbox, Autopilot). Includes the **Consultant Licenses** page. | Not built. Today's "License" dialog only edits a status label. | M |
| **B2** ✅ | **One licence-aware gate** for AI, inbox, Prepare and builder AI/tailoring in the tenant web app | Inbox and Prepare read licences. AI and the builder ignore them (402 for every enterprise account). | M |
| B3 ✅ | Subscription Overview, Billing & Invoices, Feature Usage pages (built read-only 2026-11-11, `ORG-BILLING-BUILD.md` step 1a; quote → confirm is step 1b) | Placeholders ("Soon"). Tables exist; nothing reads them. | M each |
| B4 | **Stripe per organization**: setup fee, licence items, quotes, webhooks, reconciler, failed payments (planned in `ORG-BILLING-BUILD.md` steps 1b–3; user decisions 2026-11-11: invoices paid in 15 days, setup fee on the first invoice, C1–C10 defaults. **Step 1b built 2026-11-11:** licence changes are priced (quote) and confirmed, removals wait for the period end with Keep; no money moves. **Step 2 built 2026-11-12:** the platform admin starts billing (account, period, setup fee waived for existing organizations), the Stripe customer and the fee item when `enterprise.billing.stripe_enabled` is on (default off), the billing portal, and the daily period rollover with estimate invoices) | Not built | L |
| B5 | Catalog prices published | Yours (after the margin-guard review) | yours |

### C. Admin pages that are still placeholders

| # | Item | Status | Size |
|---|---|---|---|
| C1 | HR (onboarding, documents, compliance, offboarding): records only, no identity documents | Tables and seed data only | L |
| C2 | Finance / timesheets: records only, never move money | Parked; the timesheets design questions are open | L |
| C3 | Integrations: webhooks, CSV import/export | Not built | L |
| C4 | Reports beyond the 30/90-day overview; scheduled reports | Partial | M |
| C5 | Executive overview workspace | Not built | M |
| C6 | Marketing Manager workspace (8 pages: approvals, escalations, workload, team pipeline) | Not built (parked) | L |
| C7 | Small gaps: admin password reset, "Message your marketer", vacation approval, placement milestones/resources (sample data), search beyond page names | Placeholders inside real pages | S each |
| C8 | UI refresh: Phase 1 (structure and wording) is in PR #133; Phase 2 (visuals) | Phase 1 waits on merge; Phase 2 not started | M |

### D. Security and operations (what a consultancy's IT will ask about)

| # | Item | Status | Size |
|---|---|---|---|
| D-1 | Single sign-on per organization (Google Workspace / Microsoft), sign-in codes or passkeys | Not built | L |
| D-2 | Organization can require two-step sign-in | Not built | M |
| D-3 | Cross-tenant isolation test suite (forged host, unknown host, suspended domain) | Partial | M |
| D-4 | Monitoring and alerts, incident process, status page | Not built | M |
| D-5 | `security.txt` / security page, dependency scanning, secrets rotation | Not built | S–M |
| D-6 | Break-glass platform access (audited support access) | Not built | M |
| D-7 | Least-privilege DB user, point-in-time recovery, S3 versioning | Yours | yours |
| D-8 | Re-run the full story suites (19 stale failures) and re-record the videos | Open | M |

### E. Open decisions (yours, in `08-decisions-for-user.md`)
- **Commercial (C1–C10):** credits, Stripe Tax, USD only, proration.
- **Product (D1, D3, D4, D6, D7):** marketer inbox attribution and similar.
- **Separate accounts (O4 Q1–Q5):** offboarding export, bring-your-own AI key.
- **DD-12 (sell custom domains at launch)** and **DD-14 (local licence applier first).**
- **White-label:** whether the bee mascot stays on the sign-in backdrop, and where "Get the extension" points for a branded org.

---

## 3. Suggested order

1. **B1 + B2: licences for real.** This unblocks AI, inbox and Autopilot for any organization that isn't demo data. It is also the base for D1, D7 and B3–B4.
2. **D3 + D2: pinned resume, then real marketer tailoring.** This turns the demo's best moment into a real feature.
3. **A2 + A3 + A7: onboarding.** The runbook, bulk import and real accounts, so the first consultancy can actually move in.
4. **D5/D6 wording fix (S):** stop calling the rule-based features AI until they are.
5. **B3 + B4: billing pages and Stripe per organization.** Needed before charging the first organization.
6. **A4–A6 + D8: custom domain and branded extension publishing.** Needed for a full white-label hand-off.
