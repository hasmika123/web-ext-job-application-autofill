# Consultant workspace: My Features (`/w/consultant/features`)

Board: `design/enterprise-consultant/features.webp`. READ ONLY page: the consultant sees only their OWN entitlements and usage. **No price, margin or
billing figure appears anywhere** (CLAUDE.md: prices, limits and defaults are admin catalog inputs).

## Endpoint

| Verb + path | What | Permission |
|---|---|---|
| GET `/api/orgs/{orgId}/me-workspace/features` | tiles + the five features with status, allowance, usage, reset date, deep link | `ConsultantHomeService.requireSelf` (Consultant role, `opportunities.respond`, own `consultant_profile`) **plus** `features.view` |

Everything else (non-consultant, other org, no profile, flags off, unknown org) is the generic 404. No client-supplied consultant id exists.

**No write was added.** The brief allowed `POST /features/{key}/use` only when a metered action exists in the product. None does yet (there is no
AI resume tailoring / optimization action in the consultant workspace; interview prep sessions and match views are already recorded by their own
pages), so there is no write, no new table, no migration and no seeder.

## Real vs SAMPLE
- **Real (derived from the consultant's own rows, this calendar month UTC):** AI Job Matching used = own `cws_match_view` rows; Interview Prep used =
  own `cws_prep_session` rows; Email Application Tracking = own `talent_application` rows; "Features Used This Month" = the sum of the three, with the
  delta against the same sum for last month (null when last month was 0); reset date = first of next month.
- **SAMPLE (`sample:true`, `SampleMark`):** which features exist, every status (all ENABLED), premium flags, allowances (matching unlimited, resume
  tailoring 50 credits, interview prep 20 sessions, tracking unlimited, optimization 20), "Active Features", "AI Credits Left", "Premium Tools Enabled"
  and "Expiring Soon" (renewal = end of the current month). They are admin inputs in the real product: **replace `ConsultantFeaturesService.catalog()`
  with EntitlementService when the admin catalog and the consultant role merge.**
- **Untracked, never faked:** AI Resume Tailoring and Resume Optimization have no metered action, so `used` is `null`; the table says "Usage tracking
  arrives with this tool" and shows no progress bar. AI Credits Left therefore equals the full allowance (tile marked Sample).

## Web
`components/ent/consultant-ws/FeaturesPage.tsx` (+ test), `lib/ent/consultant-ws/features.ts` (+ test), route
`app/(tenant)/%5Ft/w/consultant/features/page.tsx`, BFF `app/api/orgs/[orgId]/me-workspace/features/route.ts` (GET only). Root attribute
`data-consultant-features data-status={status}`. Five tiles; Enabled Features table (filter All / Enabled / Needs attention (not enabled or >= 80 %
used) / Premium, `ProgressBar` from `@kiwiply/ui`, View/Use deep link, row menu); Usage Overview cards (features flagged `overview`); Recommended
Tools (3 cards to resumes / interview-prep / matches); rail: bee card, Quick Actions (resumes, interview-prep, matches, marketer), Tips (numbered).
The description folds under the feature title (no separate column) so the table fits at 1440. **Recommended Tools and Tips are static defaults in
`features.ts` and should become admin config.** No `packages/ui` change.

## OrgIsolationIT rows to add
GET `/api/orgs/{orgId}/me-workspace/features` (no body). No new tables, so no org-first fixtures.

## Wiring for the coordinator
1. `workspaces.json`: flip `features` live. 2. Nothing for master.xml (no migration) or EnterpriseDemoBootstrap (no seeder).

## Tests
`ConsultantFeaturesResourceIT` (6 tests: own usage counts incl. last-month exclusion and null for untracked, no price/billing field, a second consultant's
usage never leaks, empty consultant gets zeroes, other org / non-consultant / marketer / no-profile 404, flags-off 404). Web: `features.test.ts`,
`FeaturesPage.test.tsx`.
