# HANDOFF - Sprint 2 machine B report

> Written 2026-10-17 by the machine B session. Branches: `sprint2-b-assignments` (B1, tip a150d326),
> `sprint2-b-privacy` (B2, tip acab4eed), `sprint2-b-ops` (B3, tip 44460397), this report on `sprint2-b-report`.
> The B1 and B2 sections are the coordinator's summary of those two sessions; B3 is from the session that wrote it.

## MERGE NOTES FOR MACHINE A

1. **`sprint2-b-assignments`: SQUASH-merge it, do not merge its history.**
   - Commit c636adf4 accidentally committed the user's untracked root files: `kiwiply-2026-10-12.bundle` (45 MB) and about 35 MB of old local `.log` files. The logs hold DEBUG output with short-lived local demo JWTs from 2026-10-13; no production secrets were found.
   - 9458caab removed them from the tip, so the tip tree is clean, but they remain in that branch's history.
   - A history rewrite plus force-push was attempted with the user's OK, and this machine's permission policy blocked it. The user can run it themselves.
   - Otherwise squash-merge, so `version2` never carries the blobs, and delete the remote branch after merging.
2. **Liquibase:** B1 and B2 both add a changeset file dated `20261117010000_*` (`ent_assignment_lifecycle` and `privacy_retention`) and each appends one include to `master.xml`. Expect a trivial `master.xml` conflict; keep both includes.
3. **`DataMapIT` (B2) will fail after merging B1** until B1's new table `marketer_assignment_event` (it has an org reference) gets a row in `DataMap`. That is the test working as designed; add the row during the merge.
4. **Both branches regenerated `api/openapi.json`** (B1: 573 paths, +1; B2: 583, +11; base 572). After merging, regenerate with `OpenApiContractIT` and diff the path sets.
5. **Pre-existing failures on version2 a5094029, not caused by machine B:** `AccountDeletionSeparateIT` fails 2 of 11 and `EnterpriseOffboardingIT` fails 5 of 6 (they get 404 `error.org` on `/api/orgs/{id}/members/...`). Reproduced on a detached a5094029. Probably from ent-hardening-a (X4.10); not confirmed.
6. **B3 deploy:** the first deploy after merge recreates the mysql container (the `logging:` block changes its config, about 20 s of database restart, volume untouched). `deploy.yml` still pulls `latest`; the switch is documented in DEPLOY.md section 5.4. B3 touched `docker-compose.prod.yml` (image tag interpolation + `logging:`), `.gitignore` (`!.env.staging.example`), `.env.example`, `DEPLOY.md`, `MIGRATION.md`, `docs/HANDOFF.md` and `REAL-GAPS-C.md`; no Caddy file and nothing machine A owns.
7. **Pre-existing web vitest failures on version2 a5094029, not caused by machine B:** 18 tests in `src/components/app-v3/resume-builder` fail (`ResumeEditor.templateSwitch.test.tsx`, `PickTemplatePanel.test.tsx`, `TemplateGallery.test.tsx`; the assertions mention a `design-free-test` template id). Reproduced by the coordinator in a worktree whose branch has no `web/` diff against a5094029.
8. **B1 follow-ups changed one API body:** `POST mkt/matches/{id}/assign` now accepts the optional `{confirmDuplicate, duplicateReason}` (the old call without a body still works), and B1 also edited `web/src/components/ent/applications/AddApplicationDialog.tsx` and `web/src/lib/ent/applications.ts` (the guarded `POST /applications` caller; not a machine A area).
9. **Marketing ITs under load:** `MktOpportunitiesIT` and `MktMatchesIT` hit the 15 s `seed()` guard on this busy machine, failing the same way on a5094029 (3 of 8 and 2 of 3). Rerun them on a quiet machine after the merge.

## B1 `sprint2-b-assignments` (tip a150d326; follow-ups to b174800b below)

**Decision:** `marketer_assignment` is authoritative. The evidence:
- 35 readers plus the working board, keyed by consultant profile, and some consultants have no seat;
- `org_assignment` had 2 readers (ScopeEvaluator authz step 9 and `TrackerActForGate`), its FK to `org_member` can't hold seatless consultants, and only the demo seeder wrote it.

So `org_assignment` is now a projection for seated consultants, and `AssignmentLifecycleService` is its only writer:
- `end_reason` takes REASSIGNED, MANUAL or PAUSED;
- `replaced_by_assignment_id` chains each row to its replacement;
- pause and resume end and reopen the projection.

The `MarketerAccess` seam is untouched, and no per-assignment visibility was built (decision O6).

**API:** the existing assign / unassign / update / restore routes are the atomic create / end / reassign. They take an optional `reason` (max 200 characters, SensitiveContent) and write a history line. New route: `GET /api/orgs/{orgId}/marketing-assignments/consultants/{consultantId}/history`, with an OrgIsolationIT COVERAGE row.

**Handover:** runs in the same transaction.
- Moves open opportunities (ASSIGNED, VIEWED, INTERESTED, NEEDS_INFO), tasks and follow-ups the previous marketer owned for that consultant.
- On unassign it goes to the backup if there is one; undo gives the work back.
- One `MARKETING_HANDOVER` audit row. The consultant gets a MESSAGE notice; the new marketer gets an in-app SYSTEM notice with e-mail off. No new notification kinds.

**Liquibase:** `20261117010000_ent_assignment_lifecycle.xml`.
- `-1` creates `marketer_assignment_event`.
- `-2` is an idempotent backfill of `org_assignment` from `marketer_assignment`. It has not been run against real data.

**Duplicate guard and caps:**
- Rules: SAME_POSTING, SAME_JOB (window), VENDOR_CHAIN (title + location heuristic; there's no end-client field), TOO_MANY_CONSULTANTS (off).
- WARN answers 409 `DUPLICATE_WARNING`; a confirmation plus a 1-200 character reason goes through and writes `PIPELINE_DUPLICATE_OVERRIDE`.
- BLOCK answers 409 `DUPLICATE_BLOCKED`. The cap answers 409 `ASSIGNMENT_CAP`.
- It runs at assignment and at record time (mkt submissions and applications). Bulk Assign skips flagged rows and names them.
- The web change is the Opportunities board "Possible duplicate" dialog plus an inline reason box.

**Settings:**

| Key | Default |
|---|---|
| `org.pipeline.duplicate_policy` | WARN |
| `org.pipeline.same_client_window_days` | 90 |
| `org.pipeline.max_submissions_per_requirement` | 0 (off) |
| `org.pipeline.open_matches_max` | 0 (off) |
| `org.assignments.handover_open_work` | true |

**Tests:**
- full `./gradlew test`: 311 classes, 2936 tests, 0 failures (incl. TechnicalStructureTest, NoSubmit*);
- unit classes: DuplicateGuardTest 18, AssignmentLifecycleServiceTest 20, PipelineGuardSettingsTest 5, OpportunityAssignmentServiceTest 39 (6 new);
- ITs: OrgAssignmentLifecycleIT 11, PipelineGuardApplicationsIT 5, PipelineGuardIT 9, OrgMarketingAssignmentsIT 16, OrgApplicationResourceIT 23, MktSubmissionsIT 5;
- `OrgIsolationIT` alone 10/10; `OpenApiContractIT` 1 (573 paths, none missing);
- web tsc and eslint clean; vitest on marketer-ws: 27 files, 378 tests.

**Not clean:** `MktOpportunitiesIT`, `MktJobsIT` and `MktMatchesIT` had 3 failures in one loaded run:
- `MktMatchesIT.assignRecordsTheMatchOnly` is a known pool-size-1 failure (V2-TEST-PASS-REPORT);
- two were 15 s seed timeouts under load.

They were not rerun cleanly; machine A should rerun them after merging.

**Not built:** from X4.13, the DELEGATE kind, scheduled handovers, the consent re-point prompt, the nightly role re-check and the Reassign sheet UI. X4.8's `consultants.max` entitlement. X8.4's BoardPolicy, manager-approval hold, metering and pinned resume version. The "same employer, different role" rule. Confirmation boxes on the Matches, Submissions and Applications pages and in the extension flow. Offboarding doesn't apply `reassignments` yet.

**Open question:** cross-consultant limit default 0 vs the spec's 3.

**Stories:** MKT-60..64, ADM-130.

**Other:** happy-path assign ITs aren't possible under `@Transactional` with a pool of 1, so they're covered by unit tests.

### Follow-ups (B1)

Added 2026-10-17 on `sprint2-b-assignments`, tip b174800b (commits c11b7026, 772a32ea, 1f3b689e, b174800b on top of a150d326). Squash-merge note 1 still applies.

**1. Clean rerun of the three marketing ITs** (one class per gradle run, behind the shared lock). The machine was heavily loaded (other projects' gradle runs, Docker, the demo), and the failures are all in `seed()`.

| Class | At a150d326 | `origin/version2` a5094029, detached |
|---|---|---|
| `MktJobsIT` | 7 tests, 0 failed | not needed |
| `MktOpportunitiesIT` | first run: BUILD SUCCESSFUL (8 tests, 0 failed). Reruns later under heavier load, at 772a32ea: 6 of 8 failed, then 3 of 8 failed | 3 of 8 failed |
| `MktMatchesIT` | 3 tests, 2 failed | 3 tests, 2 failed |

- Every failure is the `seed() timed out after 15 seconds` guard, except `MktMatchesIT.assignRecordsTheMatchOnly` at a150d326, which failed on a `Lock wait timeout` when inserting into `mkt_opportunity`.
  - That is the known pool-size-1 `REQUIRES_NEW` failure from `docs/V2-TEST-PASS-REPORT.md`.
  - On version2 the same test fails one step earlier, on the `seed()` timeout.
- The 15 s seed guard only fails under load, and it fails the same way on version2. No failure was caused by this branch, so nothing was fixed. They need a quiet machine (or a larger guard) to go green.
- The exact test count of the first `MktOpportunitiesIT` run was not saved (the next class's run replaced the XML); 8 is from the later XMLs.

**2. Duplicate confirmation in the other marketer flows.** The "Possible duplicate" answer from the Opportunities board (409 `DUPLICATE_WARNING`, findings, a 1-200 character reason, retry with `confirmDuplicate` + `duplicateReason`) now also covers every other flow that calls a guarded route.
- Shared piece, extracted from the Opportunities dialogs (which now use it): `web/src/components/ent/marketer-ws/DuplicateConfirm.tsx` (the notice with the reason box, a sheet, and a `useDuplicateAsk` hook) and `web/src/lib/ent/marketer-ws/duplicate.ts` (codes, wire fields, plain sentences).
- Job Matches: a dialog for Assign. Assign selected skips the flagged rows and says so ("Left out: N looked like a duplicate"), as Bulk Assign does.
- Jobs (Assign sheet), Submissions (New Submission) and Applications (Add Application): an inline notice, a primary button that becomes "... anyway" and stays off until there is a reason. The warning is dropped when another consultant or job is picked. Add Application sends the confirmed call under a new idempotency key.
- `DUPLICATE_BLOCKED` and `ASSIGNMENT_CAP` stay plain messages with nothing to confirm in every flow.
- BFF: the matches assign, jobs assign and submissions create routes forward the two optional fields and nothing else.

**Deviations (read these):**
- **API change.** `POST mkt/matches/{id}/assign` took no body, so a warning raised from the Job Matches page could never be confirmed. It now takes the optional `{confirmDuplicate, duplicateReason}` (the two-argument service method stays and passes `Confirm.NONE`). The openapi snapshot was regenerated: 573 paths, none missing, one request body added.
- **Applications lives outside `marketer-ws`.** The Applications flow that calls the guarded route (`POST /applications`) is `web/src/components/ent/applications/AddApplicationDialog.tsx`, plus `CreateBody` in `web/src/lib/ent/applications.ts`. The marketer-ws Applications board itself has no create call. Both files are outside machine A's areas.
- **Jobs sheet.** The Jobs Assign sheet was added as well: it calls the guarded `POST mkt/jobs/{jobId}/assign`, so it would otherwise have been stuck on a warning.

**Tests:**
- vitest, `src/components/ent/marketer-ws` + `src/lib/ent/marketer-ws`: 28 files, 406 tests (was 27 files, 378).
- New: `JobMatchesPage` 6, `JobDiscoveryPage` 4, `SubmissionsPage` 4, `ApplicationsPage` 4, `duplicate.test.ts` 5, `matches.test.ts` 5, `jobs.test.ts` 2, `submissions.test.ts` 2, and the BFF routes `duplicate.routes.test.ts` 9.
- Folders re-run together: `src/components/ent/applications` 32 and `src/app/api/orgs/[orgId]/mkt` 9.
- Java unit: `MktMatchesServiceTest` 17 (3 new), `MktMatchesResourceTest` 4 (1 new), 0 failed. `OpenApiContractIT` 1 passed.
- `npx tsc --noEmit` clean. `npx eslint` on every changed file: 0 errors, 1 warning that already existed (`matches.test.ts:58`).
- Not verified in a browser.
- Story MKT-62 lists the new routes and tests; one log line was added to `progress-tracker.md`.

## B2 `sprint2-b-privacy` (tip acab4eed)

**(a) Retention:** `service/privacy/*`, nightly at 03:50 UTC.
- Targets: `admin_audit_event`, expired `refresh_token`, `ai_call`, resolved `bug_report`, deletion reports.
- Batch-limited, each batch its own transaction, dry run, audited (`RETENTION_PURGE` / `RETENTION_DRY_RUN`), a `retention_run` row per run.
- Multi-instance safe through a new `job_lease` table.

**(b) Data map:** `DataMap` / `DataClass` classify 202 tables, and `DataMapIT` fails on unmapped user/org tables. It found and fixed 4 erasure gaps: `bug_report`, `sales_inquiry`, `ai_quota_override`, pending `admin_mfa_challenge`.

**(c) Deletion:** `POST`, `GET` and `DELETE /api/account/deletion-request`.
- 24 h undo window; `AccountDeletionPurgeJob` runs every 5 minutes.
- An `account_deletion_report` on every erasure path, with counts and status and no PII.
- Enterprise accounts get a 404 on these routes.

**(d) Export:** `/api/account/exports` (+ `/{id}`, `/{id}/file`).
- An async ZIP capped by `privacy.export.max_mb` (200), one active job, 3 a day (429 beyond).
- An HMAC-signed, expiring link that still requires the owner; anything else gets a 404.

**(e) Terms:** `GET` and `POST /api/account/terms-acceptance`, for TERMS and PRIVACY, version plus timestamp.

**Admin routes:** `/api/admin/privacy/retention`, `retention/run?job=&dryRun=` (dryRun defaults to true), `retention/runs`, `deletion-reports`, `deletion-requests`, `data-map`.

**Liquibase:** `20261117010000_privacy_retention.xml`, changesets 1-6 (`job_lease`, `retention_run`, `account_deletion_request`, `account_deletion_report`, `data_export_job`, `terms_acceptance`).

**Settings:**

| Key | Default |
|---|---|
| `privacy.retention.enabled` | true |
| `privacy.retention.dry_run` | false |
| `privacy.retention.batch_size` | 500 |
| `privacy.retention.max_batches` | 40 |
| `privacy.retention.admin_audit_months` | 24 |
| `privacy.retention.sessions_grace_days` | 7 |
| `privacy.retention.ai_call_months` | 13 |
| `privacy.retention.bug_report_months` | 24 |
| `privacy.retention.deletion_report_months` | 36 |
| `privacy.deletion.grace_hours` | 24 |
| `privacy.export.max_mb` | 200 |
| `privacy.export.expiry_hours` | 72 |
| `privacy.export.max_per_day` | 3 |
| `privacy.export.include_files` | true |
| `legal.terms_version` | 2026-10 |
| `legal.privacy_version` | 2026-10 |

**Tests:**
- unit: 67 passed across the privacy, settings, storage and TechnicalStructure classes (26 new); the full unit suite was not run;
- new and related ITs: 39 passed (DataMapIT 5, RetentionServiceIT 9, AccountPrivacyResourceIT 9, AccountErasureReportIT 2, AdminPrivacyResourceIT 4, AccountDeletionResourceIT 4, AccountDeletionServiceIT 4, AccountExportResourceIT 2);
- regression: OrgMembershipPrivacyIT 8, DataShareServiceIT 17, TrackerDataLifecycleIT 3, TrackerExportActorIT 4, OrgIsolationIT 10/10, OpenApiContractIT 1 all passed (583 paths, +11, none removed);
- the 7 pre-existing failures are in merge note 5.

**Scope notes:**
- No identity code touched (`AccountDeletionService` only). No web changes.
- Stories APP-10..12, PLT-63..65.
- REAL-GAPS-C rows T0.2 and T1.1-T1.4 FIXED.

**Open:**
- T1.5 subprocessor register not built (needs the user's DPA decisions).
- Terms aren't recorded at sign-up (that would touch registration identity code; decide).

**Follow-ups (B2), `sprint2-b-privacy` tip f09c3f09:**
- Full unit suite (`./gradlew test`, never run before): 2913 tests in 315 classes, 0 failures, 0 errors, 0 skipped, BUILD SUCCESSFUL. Nothing on the branch needed fixing.
- Web wiring for the PERSONAL Settings > Privacy panel (the enterprise `ent/settings` page is untouched). BFF routes under `web/src/app/api/account/`: `deletion-request` (GET, POST, DELETE), `exports` (GET, POST), `exports/[id]` (GET), `exports/[id]/file` (GET, streams the ZIP; only `exp` and `sig` are forwarded), `terms-acceptance` (GET, POST). A zero-hour deletion window answers `DELETED`, and the POST route then clears the session cookies.
- UI: `AccountDeletion.tsx` replaces the immediate delete (`DeleteAccountButton.tsx` removed). It uses an inline confirm, a countdown with a Cancel button, and an undo toast. `DataExports.tsx` adds "Prepare my data export", a list of jobs with status, size and a Download link, and polling while a job runs. Both read their state from the API on mount.
- Enterprise or other 404: the deletion card shows a one-line "managed by your organization" note and the export list renders nothing. The (app) Settings page is already personal-only on kiwiply.com.
- Terms acceptance has BFF routes only; nothing calls them from sign-up (still the open decision above).
- Web checks: vitest on the touched folders: 62 passed in 6 files (39 new: 18 route, 10 deletion card, 7 export list, 4 lib; plus the 9 updated panels tests and the 14 NotificationsPanel tests); `tsc --noEmit` clean; eslint clean on the changed files. The full web vitest run shows 18 failures in 3 resume-builder template files (`ResumeEditor.templateSwitch`, `PickTemplatePanel`, `TemplateGallery`; "design-free-test" template id). They are in code this branch does not touch.
- Not verified in a browser; `next build` was not run (junctioned node_modules).
- Left alone: the old BFF `DELETE /api/account` (immediate erase) is no longer used by the UI but still exists, as does the API endpoint. Consider removing both once nothing else needs them.
- The Settings UI still calls the immediate `DELETE /api/account`; the undo-window and export UI and BFF are a follow-up.
- No deletion e-mail (mail templates are machine A's).
- No org-close purge.
- Re-deletion after a backup restore (T1.9) not built.
- Scheduler triggers are untested (scheduling is off in the test profile).

## B3 `sprint2-b-ops` (tip 44460397)

Repo files only. Nothing was run against production or the box, no ssh, no Caddy file touched.

**Built:**
- `scripts/ops/deploy.sh`: explicit tag (default: the checkout's HEAD sha; `latest` refused in any case), always `-f docker-compose.prod.yml -f docker-compose.shared-edge.yml` (asserted; it refuses the bare file), `--dry-run`, `--rollback`, `--no-snapshot`, `--allow-destructive-migrations`, a lock. Steps: compose config check; work out the rollback target (recorded tags, or the running images tagged `pre-<time>`); Liquibase destructive-statement lint between the previous and new sha; pre-deploy DB snapshot; pull; `up -d` with `DOSSIER_API_TAG` / `DOSSIER_WEB_TAG`; wait for API health UP and web (probed from inside the web container), then public smoke URLs; any failure after `up` rolls back to the previous tags (exit 1, or 2 if the rollback fails too). It never restores the DB on its own; the message names the snapshot. Healthchecks start / success / fail via `HC_DEPLOY_URL`.
- `scripts/ops/snapshot-db.sh` (the default snapshot hook; local, mode 600, newest 5, refuses a cut-short dump).
- `docker-compose.prod.yml`: image tags read `DOSSIER_API_TAG` / `DOSSIER_WEB_TAG` (default `latest`, so `deploy.yml` is unaffected) and every service gets a `logging:` block (json-file, 5 x 10 MB, compressed).
- Staging: `docker-compose.staging.yml` (project `dossier-staging`, own aliases `dossier-staging-web/api`, memory caps; replaces the shared-edge overlay, never combined with it), `.env.staging.example` (placeholders only; `.gitignore` now un-ignores it), `deploy.sh --staging --build`.
- `scripts/ops/host-guard.sh` (disk, memory/swap with strikes, container restarts of our projects, certificate days; read-only; `/fail` ping with the reasons) plus its cron line; `kiwiply-logrotate.conf`; `docker-daemon.json.example` (documented as NOT to apply casually: it restarts BeeCompete's containers).
- `backup-db.sh`: optional age or gpg encryption (`BACKUP_AGE_RECIPIENT` / `BACKUP_GPG_RECIPIENT`, no-op by default, fails closed if the tool is missing), `--dry-run`; `verify-restore.sh` accepts `.age`/`.gpg` names, `--identity`, and on the box does an integrity-only check of an encrypted newest backup (the private key is deliberately not there).
- `scripts/ops/backup-uploads.sh` (nightly archive of the uploads volume + sha256 manifest, optional encryption, `uploads/` 30-day lifecycle rule, `HC_UPLOADS_URL`).
- Healthchecks hooks: `HC_UPLOADS_URL`, `HC_HOST_URL`, `HC_DEPLOY_URL` (all optional, no-op when unset).
- `docs/ops/incident-runbook.md`; `DEPLOY.md` sections 5.4-5.8; `docs/HANDOFF.md` and `MIGRATION.md` corrected (scripts exist; the box-side setup is still the user's).
- REAL-GAPS-C: P0.3, P0.5, P1.5, P1.6, P2.1, P2.3, P3.2, T5.5 FIXED; P0.1 and P2.2 PARTIAL; one log line at the end of `progress-tracker.md`.

**Tests:** `scripts/ops/test/ops.test.sh` now runs three suites: 31 (existing) + 114 (`deploy.test.sh`: dry run, good deploy, health and smoke failures with rollback, rollback-fails exit 2, pull and snapshot failures, first deploy, manual rollback, locking, migration lint, snapshot, the real `docker compose config` of prod and staging, example-env placeholders) + 93 (`guard.test.sh`: host guard, encryption with fake age/gpg, uploads backup, encrypted drill, cron/logrotate/lifecycle) = 238 passed, 0 failed. All use a fake docker and curl on this Windows machine. shellcheck 0.11.0 is clean on `scripts/ops/*.sh` and `scripts/ops/test/*.sh` (same glob as the CI "Ops scripts" job). The `REAL_DOCKER=1` real-MySQL round trip was not run here (the Docker daemon was not running); it runs in CI.

**Deviations:**
- `deploy.yml` is NOT switched to `deploy.sh`: that can only be proven on the box. P2.1 is FIXED for the script, not the pipeline; the one-line switch is in DEPLOY.md 5.4.
- Uploads backup is a daily tar.gz + manifest, not the design's `aws s3 sync` (design D4): it keeps deleted user files out of backups within 30 days and needs no IAM change.
- The migration lint is a regex heuristic over changed Liquibase files, not the CI `liquibase-lint` of the design.
- The staging smoke URLs are off by default; the design's host names (`staging.kiwiply.com`, `api-staging.kiwiply.com`) are in `.env.staging.example` and DEPLOY.md 5.5.

**Not done / open for the user:**
- Not built: P0.2 binlog shipping, P0.4 monthly PITR drill, P0.6 rebuild drill, P1.1 monitors (user accounts), P1.2 status page, P2.5 deploy user, P2.6 CI hardening.
- Box-side setup (the user's): backup bucket and IAM user, Healthchecks checks (backup, restore, uploads, host, deploy), `install` of `/etc/cron.d/kiwiply-ops` and `/etc/logrotate.d/kiwiply`, the age key pair (private key to the password manager first; losing it makes encrypted backups unreadable), first dump and drill, DNS and the edge Caddy blocks for staging, UptimeRobot.
- Open: should the weekly drill stay integrity-only once dumps are encrypted? The doc asks for a full restore from the key holder's machine at least quarterly.
- Counsel review (L12) of the breach-notification clocks in the runbook is still open.

## Verification (B4)

The verify queue (section 6 of `docs/HANDOFF-ENT-SPRINT2-SPLIT.md` on `origin/sprint-2`) was **empty** at every check: about 2026-10-16 evening after B3 was pushed, repeated roughly every 5 minutes for about 90 minutes, and a final check at 2026-10-17 03:26 UTC. No branch was verified by the B4 duty; the test counts above are each session's own.

Not verified in a browser (Playwright paused by the user).
