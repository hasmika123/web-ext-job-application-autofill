# Monitoring, alerting, SLOs, the public status page and incident response

Area `plat`. Stories: P1.1–P1.7, P7.1–P7.4. Existing: 15.1b error digest (`service/ops/ErrorDigest*`:
ERROR log events → one email ≤ every 15 min, grouped, via Brevo); Healthchecks pings in the backup scripts
(not live); `management.endpoint.health.probes` on (liveness, readiness incl. db); `jhimetrics` for admins;
Prometheus export disabled in prod; `scripts/migrate/04-verify.sh` manual smoke. **No uptime monitor, no
status page, no on-call path that survives the box dying.** Admin A10.3–A10.5 build the *internal* view
(Healthchecks poll, host stats, request metrics, incidents); this doc owns the *external* truth and the
human process, and feeds A10 its data.

## 1. Decisions

| # | Decision |
|---|---|
| D1 | **External truth lives off the box, on a paid plan.** One hosted monitor account (UptimeRobot Solo ~$12/mo or equivalent — free tiers are "hobby/non-profit") with monitors: `https://kiwiply.com/` (200 + keyword `Kiwiply`), `https://api.kiwiply.com/management/health` (keyword `"status":"UP"` = API **and** DB), `https://api.kiwiply.com/management/health/readiness`, TLS expiry on both hosts, DNS record check, and the **canary** (`/api/ops/canary`, D5). 1-min interval on the API, 5-min elsewhere. The admin page reads this via its API (A10.3) — it never *is* the monitor. |
| D2 | **Public status page at `status.kiwiply.com`, hosted by the monitor vendor**, components mapped to what a job seeker cares about: *Web app* · *Extension sync & autofill API* · *Sign-in & email* · *Job matches* · *Billing*. Each component is driven by a monitor (D1 + D5), not by hand, so the page is green/red without anyone awake. Incidents (P7.2) post there with plain-language updates. Linked from the web footer, the extension drawer's error state, and `/trust`. |
| D3 | **Alert routing for a team of one.** Severity → channel: **SEV1** (site/API down ≥ 2 checks, backup missed, disk > 90 %, canary failing 3×) → push (ntfy.sh topic or Pushover, phone bypasses Do Not Disturb) + email; **SEV2** (error rate > 2 % / 5 min, p95 > 1.5 s / 10 min, job failed twice, Stripe webhook failures, Brevo cap 80 %) → push during 08–23 local, else email + morning digest; **SEV3** (everything else, the 15-min error digest) → email. A daily 09:00 "all quiet" line in the digest proves the pipe works (absence of mail is never good news). Quiet hours never apply to SEV1. |
| D4 | **SLOs, written down and cheap.** Availability **99.5 %/30 d** on web + API (≈ 3.6 h budget), **p95 ≤ 800 ms** on `/api/profile/version` and `/api/applications` (the extension's hot paths), **backup freshness ≤ 24 h, binlog ≤ 30 min**. Measured by the external monitor (availability) and A10.3's `request_metric_minute` (latency). An exhausted error budget freezes feature deploys for the rest of the window except fixes — a rule, not a tool. Published on `/trust` once two months of data exist. |
| D5 | **Synthetic canary.** A dedicated user `canary@kiwiply.internal` (ROLE_USER, Free, flagged `is_canary` so it is excluded from analytics/billing/emails) and `GET /api/ops/canary` (unauthenticated, rate-limited 1/s, no body details) which internally: authenticates the canary, reads `/api/profile/version`, writes + deletes one `application` row in a transaction, pings the mail transport (`JavaMailSender.testConnection()`), checks the storage driver can `stat` a sentinel object. Returns `{ok, steps:{auth, db_rw, mail, storage, ms}}`. The monitor keyword-checks `"ok":true`. This is the one probe that proves sign-in, DB writes, mail and storage all work — `health` only proves the process is up. |
| D6 | **Logs: rotate, structure, keep little.** Compose `logging: {driver: json-file, options: {max-size: 20m, max-file: 5}}` on every service; API `jhipster.logging.use-json-format=true` in prod (one line per event, fields for `traceId`, `userId` hash, route); web logs stay plain. Retention = on-box only (≈ 100 MB cap). No log shipping service until there is a second box; the digest ring buffer (A10.4 "log view") covers the last 500 ERROR/WARN. |
| D7 | **Host guard.** `scripts/ops/host-guard.sh` every 5 min (cron): disk on `/var/lib/docker` and the uploads volume, free mem, swap in use, container restart counts (`docker ps --format` + `RestartCount`), cert days-left; thresholds → `curl` to the Healthchecks "host" check's `/fail` with the reason in the body (Healthchecks forwards it in the alert). A10.3's `HostStats` bean reads the same numbers for the page. |
| D8 | **Incident process** (lightweight, written in `docs/runbooks/README.md`): declare in admin (A10.5) *or* by posting on the status page by hand — whichever is reachable; severity ladder from D3; first public update within **15 min** of detection, then every 60 min; resolve note; postmortem within 5 working days for SEV1/SEV2 using the template in §6 (blameless; timeline, impact in users/minutes, root cause, what detection missed, 1–3 actions with owners). Postmortems are public on the status page history for anything users could see. |
| D9 | **Runbooks are files, one per alert**, in `docs/runbooks/<key>.md` with a fixed shape: *Symptom · Check (copy-paste commands) · Fix · Verify · If that fails · Owner*. Keys match A10 D8 plus platform ones: `box-unreachable`, `edge-caddy-down` (BeeCompete coordination — we never restart it; message the owner, their runbook), `cert-expiring`, `deploy-failed`, `rollback`, `binlog-gap`, `files-volume-full`, `canary-failing`, `ghcr-pull-failed`, `mail-provider-down`, `ai-provider-down`. |
| D10 | **Dependency outage matrix** (P7.4): every outbound dependency gets an explicit timeout, retry policy and degraded behaviour, in a table in this doc and in code (`RestClient` timeouts). Gemini → feature says "AI is resting, try later" (402/503 distinction kept); Brevo → queue + retry 3× over 30 min, never block the request; IMAP → skip the poll, next tick; AWS S3 → uploads fail with a retryable message, downloads of local-driver files unaffected; Stripe → checkout button disabled with copy, webhooks are Stripe's retries; job-board APIs → per-board skip, ingest continues. No new resilience library: Spring `RestClient` timeouts + a small `Retry` helper already fit; ask before adding resilience4j. |

## 2. Signal → severity → runbook

| Signal | Source | Sev | Runbook |
|---|---|---|---|
| web or API monitor down (2 consecutive) | external monitor | 1 | `box-unreachable` → `edge-caddy-down` |
| canary `ok:false` 3× | external monitor | 1 | `canary-failing` (branch by failing step) |
| backup / binlog / files check late | Healthchecks | 1 / 2 / 2 | `backup-missed`, `binlog-gap`, `files-volume-full` |
| disk > 85 % / > 90 % | host-guard | 2 / 1 | `disk-full` |
| mem > 90 % or swap > 2 GB for 10 min | host-guard | 2 | `memory-pressure` |
| cert < 14 d | host-guard + monitor | 2 | `cert-expiring` (edge Caddy auto-renews; if not, it is BeeCompete's Caddy) |
| container RestartCount rising | host-guard | 2 | `deploy-failed` / `memory-pressure` |
| 5xx > 2 % / 5 min, p95 > 1.5 s / 10 min | A10.3 metrics | 2 | per route group |
| deploy verify failed (auto-rolled back) | deploy.yml | 2 | `deploy-failed` |
| Stripe webhook failure, Brevo 80 % | A2 / A7 | 2 | `stripe-webhook-failing`, `mail-provider-down` |
| ERROR log kinds (new) | digest | 3 | — |

## 3. API shapes

```
GET /api/ops/canary                         -> 200 {ok:true, ms:412, steps:{auth:"ok",db_rw:"ok",mail:"ok",storage:"ok"}}
                                            -> 503 {ok:false, ms:30000, steps:{auth:"ok",db_rw:"timeout",...}}   (no stack traces, no ids)
GET /management/health/readiness            -> existing; db included
POST /api/admin/deployments                 -> A10.4 (bearer DEPLOY_HOOK_TOKEN)
```

The canary endpoint is excluded from the request-metrics rollup (it would be 30 % of traffic) and from
the digest's ERROR grouping (its failures already page).

## 4. Status page (390 px) and the footer link

```
┌──────────────────────────────┐
│ Kiwiply status               │
│ ● All systems operational    │
│                              │
│ Web app            ● 99.98 % │
│ Extension sync API ● 99.95 % │
│ Sign-in & email    ● 100 %   │
│ Job matches        ● 99.9 %  │
│ Billing            ● 100 %   │
│                              │
│ Past incidents               │
│ Oct 3 · Job matches delayed  │
│   3 h · resolved · postmortem│
│                              │
│ [ Subscribe to updates ]     │  <- 44px, email + RSS
└──────────────────────────────┘
```

Extension drawer error state: "Can't reach Kiwiply · check status.kiwiply.com" (ext area owns the copy).

## 5. `/trust` page content (P7.3 — marketing/trust areas own the route, this area owns the facts)

Backups: nightly + 15-min binlogs, off-site, encrypted, no-delete key · Last restore drill: *date, passed,
RTO 14 min* (auto-updated from the evidence log via a tiny JSON the drill writes to S3 and the web reads
at build or ISR) · Uptime: link to status · Security: HTTPS-only + HSTS, non-root containers, dependency
scanning, `security.txt`, disclosure policy · Data: where (US, AWS us-east-1 + one EU-hosted? no — one
US box), subprocessors (A9.7), deletion within 30 days, backups expire in ≤ 365 days · Honest line:
"We are a small team. Here is exactly what we do, with dates." Nothing on this page may be aspirational;
every line is backed by a story id in this plan being `done`.

## 6. Postmortem template (`docs/runbooks/_postmortem-template.md`)

```
# <date> — <title>            Severity: SEV1|SEV2   Duration: <detect→resolve>
Impact: <who, how many, what they saw>
Timeline (UTC): hh:mm event … 
Root cause: 
What detection missed / how long to notice: 
What went well: 
Actions: [ ] <action> — owner — story id
```

## 7. Failure modes of the monitoring itself

- Monitor vendor down → the status page is theirs too; we accept one vendor. Healthchecks is a second,
  independent vendor for the "did it run" class.
- Push provider down → email still goes; the morning "all quiet" line missing is itself the alarm.
- Canary user deleted/locked → canary 503 with `auth:"fail"` → SEV1 → runbook recreates it from env
  (`CANARY_PASSWORD_HASH`, bootstrap like the admin).
- Digest storm (hundreds of kinds) → the digest already caps per mail; SEV2 push fires once per 15 min.
- Alert fatigue → monthly review of alert counts in the postmortem log; any alert that fired > 4× without
  action is retuned or deleted (rule in `docs/runbooks/README.md`).

## 8. Cost

Monitor ~$12/mo · Healthchecks $5/mo · push (ntfy.sh free self-hostable; Pushover $5 once) → **~$17/mo**.

## 9. Tests

`CanaryResourceIT` (ok path; each failing step reported by name without internals; rate-limited; excluded
user cannot sign in via the normal login UI → `is_canary` blocks password login from non-loopback),
`host-guard.sh` under `ops.test.sh` with fake `df`/`free`/`docker` outputs → correct `/fail` bodies,
`liquibase` none, web: footer renders the status link (snapshot), `/trust` refuses to render a stale
drill date older than 45 days (shows "drill overdue" instead of hiding it).

## 10. Rollout

P1.1 monitors (human account + 6 monitors) → P1.2 status page + footer link → P1.3 routing (ntfy topic,
severities, "all quiet") → P1.5 log rotation + JSON logs → P1.6 host-guard → P1.7 canary → P1.4 SLO doc +
thresholds into A10.3 → P7.1 runbooks → P7.2 incident process + postmortem template → P7.3 `/trust` facts
→ P7.4 dependency matrix in code.
