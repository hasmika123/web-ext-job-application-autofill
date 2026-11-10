# HANDOFF - Subscription work, second machine, AFTER the resume builder

> **SUPERSEDED 2026-10-15.** The earlier version of this file (an X5-only foundation plan) is replaced by Fable's complete
> unified subscription design, already merged into `version2` (branch `subscription-design`, docs only):
> `docs/HANDOFF-SUBSCRIPTIONS.md` is the handoff, `docs/subscriptions/` the design, `docs/roadmap/areas/sub.json` the 67 stories
> (area `sub`, prefix `K`). The X5/X6 stories in `docs/enterprise-v2/` are related prior art; where they overlap, the `subscriptions`
> design wins (it is one module for individual AND enterprise subscriptions, add-on services, per-seat plans, monthly/annual).

## How to run it on the second machine

1. Start ONLY when the coordinator says the resume builder branch is merged and `version2` contains `ent-accounts: S5`.
2. `git fetch origin` then `git switch -c ent-subscription-b origin/version2`. Commit ONLY on `ent-subscription-b`, push often
   (`git push -u origin ent-subscription-b`). Never commit to or push `version2`, `develop` or `main`; no force-push; no
   `git stash`; no pull requests (the coordinator merges). Sync only when told: `git fetch origin && git merge origin/version2`.
3. Read `docs/HANDOFF-SUBSCRIPTIONS.md` START HERE and follow its reading order and rules (the "first commands" there that say
   `git switch subscription-design` do NOT apply: you work on `ent-subscription-b` off `version2`, which already contains the design).
4. First tasks: **K3.4** (settings registry keys) then **K1.1**, i.e. phase S0 of `docs/subscriptions/10-stories-and-build-order.md`
   section 3; then continue in that file's build order. Mark each story with
   `node docs/roadmap/build-master-roadmap.mjs --set <id>=in_progress|done` and update `docs/subscriptions/progress-tracker.md`.
   Stop after the first phase that the build order calls P0-foundation (K1, K2, K3 and the K7 regression gate as listed there) and
   report; do not start K4+ web pages, K8 Stripe work or K10 unless the coordinator says so.
5. Commits: `ent-subscription: K<n.n> <subject>` ending with the line
   `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Money in `long` minor units; additive Liquibase only; Stripe test mode
   only; everything admin-configured; personal Free/Pro/Autopilot behaviour must stay byte-identical (the regression baseline in the
   handoff: `EntitlementServiceTest`, `BillingResourceIT`, `BillingWebhookIT`). Enterprise accounts are separate from personal ones
   (decision O4): an enterprise account never has a personal plan. Do not edit the login/identity code or marketer visibility code.
6. Tests: unit `./gradlew test --offline`; ITs `./gradlew integrationTest -x test --offline --tests '*<IT>*'` (not run by `test`);
   `OpenApiContractIT` (regenerate `api/openapi.json`), `TechnicalStructureTest`, and `OrgIsolationIT` (10/10) once at the end.
7. Done when: the agreed phase is built, tests green, committed and pushed on `ent-subscription-b`, and a report is written as the final
   message AND a committed file `docs/HANDOFF-ENT-SUBSCRIPTION-REPORT.md` (what changed, tests, spec conflicts, what next). Then stop.

## Decisions already made by the user (2026-10-15)
S-01 annual billing ON (CLAUDE.md amended) - S-03 no existing subscribers today - S-17 - S-19 Free with read-only lock when a subscriber does
not respond to a retirement - S-20 retirement wizard defaults to retire-to-Free. Open: S-06 which add-ons get prices, S-09 tax mode,
S-11 fee model, S-21 other retirement outcomes: record questions in `docs/subscriptions/decisions-for-user.md`, do not guess.
