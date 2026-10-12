# Design — Extension telemetry v2, error reporting and remote config (area `ext`, epic E8)

Status: decided 2026-10-11. Builds on 10.1 (`fill_event`, count-only, no user id), 6.1 (GA4 MP,
master switch + opt-out), the user-area event pipeline (`docs/design/user/analytics-events.md`:
`POST /api/events`, `product_event`, surface `ext`), admin A5.3–A5.5 (flags, announcements,
`ext.min_version`, per-ATS kill switch on `/api/config/client`) and A1.6 (consented support session).

## 0. Decisions

1. **Two channels, two privacy classes, one seam.** (a) *Engine telemetry* — count-only, user-less,
   always allowed unless the analytics opt-out is on (`fill_event` and its v2 columns). (b) *Product
   events* — user-scoped, enum names, allow-listed props, through `TrackingProvider.track()` →
   `POST /api/events` with `surface=ext` (U20.4). Both go through `tracking.js`; nothing else fetches.
   GA4 MP stays for install/uninstall funnel only and is retired once (b) has 30 days of data.
2. **Telemetry v2 adds *why* a fill fell short without adding *what*.** Per fill: counts per
   **field class** (`text, select, combo, radio, checkbox, date, number, file, textarea`) for found /
   filled / failed / lowConfidence / manual, plus `requiredLeftEmptyByClass`, `steps`, `durationMs`
   bucket, `adapterVersion` (ruleset), `overlayUncheckedCount`. Still no labels, values or URLs.
   Labels appear only in the **consented support session** (A1.6: failing field labels, user id,
   5 fills / 48 h, user-initiated).
3. **Errors are reported as fingerprints.** The SW and content script wrap entry points; an exception
   becomes `{fingerprint: sha256(name + top 3 frames with paths relativised), surface, extVersion,
   browser, atsFamily, count}`; batched per minute; ≤ 20/day per install; no message text (messages
   can contain page content). Stored in `ext_error_daily`; admin sees top fingerprints per version.
4. **Remote config is read-only, signed by the server's TLS and bounded by the client.**
   `GET /api/config/client` (A5.5) returns `{minVersion, atsEnabled{family:bool}, submitSignals{…},
   autopilot{pacing}, announcements[], flags{}}`; cached 15 min in `chrome.storage.local`, refreshed
   on the sync alarm. The client applies only known keys with range checks (floors/ceilings in code).
   A missing or failing config = last cached value, else defaults. Kill switch **pauses filling** on a
   family ("Filling on Taleo is paused while we fix it — you can still fill manually, and saving still
   works"); it never disables reading or saving.
5. **Min version blocks filling only.** Below `minVersion` the drawer shows the update prompt and
   the fill button is disabled; reading, save-a-job and sync keep working (an auto-update is usually
   hours away; the user must not be locked out of their data).

## 1. Event taxonomy (surface `ext`; names stable; props allow-listed server-side)

| Event | Props |
|---|---|
| `ext_installed` / `ext_updated` | `version, browser(chrome|edge|firefox), reason` (replaces GA4 `extension_install`) |
| `drawer_opened` | `page_kind(ats|board|other), ats, has_form, signed_in` |
| `fill_started` | `ats, adapter, fields_planned, low_conf, ai_mapped, reused` |
| `fill_completed` | `fill_id, fields_filled, failed, required_left, steps, duration_bucket, auto_advance` |
| `fill_gap_resolved` | `count` (user filled a gap after the card) |
| `job_saved` | `source_kind(jsonld|adapter|board|generic), has_salary` |
| `submit_detected` | `ats, signal, confidence` |
| `submit_outcome` | `outcome` |
| `answer_drafted` / `option_picked` / `fields_mapped` | `outcome(drafted|cached|disabled|pro_required|error), tier(byo|server)` |
| `resume_uploaded_from_drawer` | `mode(save|attach)` |
| `suggestion_sent` | `count` (profile-learn batch size) |
| `autopilot_item_*` | `status, reason, ats` (E7) |
| `connect_completed` | `transport(external|relay), browser` |
| `error_fingerprint` | `fingerprint, surface, ats` (engine channel, user-less) |

No event carries a URL, company, job title, label, value or email. `fill_id` is the random UUID.

## 2. Data model (additive, MySQL)

```
fill_event (exists)  + fields_by_class_json JSON NULL   -- {"combo":{"found":3,"filled":2,"failed":1,"lowConf":0,"manual":0}, …}
                     + required_left_by_class_json JSON NULL, steps SMALLINT NULL, duration_bucket VARCHAR(8) NULL,
                     + ruleset_version SMALLINT NULL, overlay_unchecked SMALLINT NULL, browser VARCHAR(8) NULL
ext_error_daily      day DATE, fingerprint CHAR(64), ext_version VARCHAR(16), browser VARCHAR(8), surface VARCHAR(8),
                     ats VARCHAR(24) NULL, count INT, sample_frames_json JSON NULL  PRIMARY KEY(day, fingerprint, ext_version, browser, surface)
client_config (A5.5 owns)  key VARCHAR(64) PK, value_json JSON, updated_by, updated_at, reason VARCHAR(200)
product_event (A11.2 owns) — the ext events land here with surface='ext'
```

## 3. API shapes

```
POST /api/telemetry/fills                (exists; body gains the v2 fields; server validates ranges, drops unknown keys)
POST /api/telemetry/errors               [{fingerprint, surface, extVersion, browser, ats?, count, frames?[≤3]}]  ≤ 20/day per install (random install id header, not user)
POST /api/events                          (A11.2) — the BFF rule does not apply to the extension: it calls Spring directly with its Bearer, same as every other extension call
GET  /api/config/client                   → {minVersion:"0.70.0", atsEnabled:{taleo:false}, submitSignals:{copy:"LOW"}, autopilot:{minGapMs:20000,maxTabs:3,maxSteps:12}, announcements:[{id,text,url,until}], flags:{aiDefaultOnPro:true}, ttlSec:900}
GET  /api/admin/analytics/ext             → fill quality by ATS × class, error top-N by version, submit precision, version adoption
```

## 4. Client wiring

- `src/lib/tracking.js`: `track(name, props)` (batches ≤ 50 per 30 s or on SW idle; drops when opted
  out or signed out), `recordErrors(batch)`, `clientConfig()`.
- `src/lib/remote-config.js` (pure, SW-safe): `apply(raw) → config` with range checks and defaults;
  `isAtsEnabled(family)`, `needsUpdate(version)`. Consumed by the filler (refuse fill on a paused
  family; show the reason in the overlay), the drawer (banner + update prompt), Autopilot (pacing),
  submit-detect (signal confidence).
- `src/lib/errors.js`: `wrap(fn, surface)` for SW listeners and content entry points; fingerprinting;
  rate limit; never includes `message`.
- Drawer banner: announcements from config (A5.4), dismissible per id, stored locally.

## 5. Failure modes

| Failure | Behaviour |
|---|---|
| Config endpoint down | cached config until `ttl × 4`, then defaults (everything enabled, no min version) — an outage must not pause filling |
| Config says `maxTabs: 50` | clamped to the code ceiling (3); floors likewise; a config outside range is logged as an error fingerprint |
| Events endpoint 429/5xx | batch kept (≤ 200 events, FIFO drop) and retried on the next alarm; telemetry never blocks a fill |
| Error storm (a broken ATS throws per keystroke) | per-fingerprint client cap (5/min), per-install daily cap (20), server per-install cap |
| User opts out of analytics | `track` and `recordErrors` no-op; `fill_event` v2 stops too (same switch, as today); config fetch still runs (it is not telemetry) |
| Old extension sends v1 body | server fills nulls; panels show "n/a" for v2 columns per version |

## 6. Security / privacy

Engine telemetry remains user-less; product events are user-scoped like the web's and covered by the
same policy text (U14.5) and the per-user "Product analytics: off" switch (synced down via config
`flags.analyticsOff` so the extension honours a choice made on the web). Error frames are
path-relativised (`src/content/filler.js:212`) and never include page URLs or messages. Remote config
is data only — no code, no selectors that could exfiltrate (selectors are not accepted; only enums,
booleans, numbers and announcement text/URL on our own origin). `PRIVACY.md` gains a "Remote
configuration" paragraph and the "Fill-quality counts" section lists the new count classes.

## 7. Cost

Negligible: ~3 small POSTs per fill, one GET per 15 min. `product_event` volume for the extension is
bounded by fills (a user does tens per day, not thousands).

## 8. Tests

- `test/fill_telemetry.test.js` (extend): class buckets, caps, no label/value leakage (property test:
  serialise the event and assert no string longer than 24 chars outside enums).
- `test/remote_config.test.js`: defaults, clamping, TTL, stale-on-failure, `isAtsEnabled`,
  `needsUpdate` semver compare, unknown keys ignored, selector-looking strings rejected.
- `test/errors.test.js`: fingerprint stability, message exclusion, caps, batching.
- `test/tracking.test.js` (extend): `track` batching/opt-out/signed-out; `clientConfig` parsing.
- API: `ClientConfigResourceIT` (A5.5), `ExtErrorResourceIT` (caps), `FillTelemetryV2IT` (range validation).
- Filler: paused family shows the message and plans nothing; update-required disables fill only.

## 9. Rollout

E8.1 `track()` + the first 5 events (replacing GA4 for those) → E8.2 fill telemetry v2 columns + admin
breakdown → E8.3 error fingerprints → E8.4 remote-config client (min version, kill switch, announcements)
→ E8.5 submit-signal demotion + Autopilot pacing keys → E8.6 retire GA4 MP (remove the
`google-analytics.com` host permission — a store re-review in our favour).
