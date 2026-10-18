# The `FileStorage` seam: local filesystem first, S3 by configuration later

Area `plat`. Stories: P5.1–P5.5. User decision (2026-10-11, `docs/RESUME-BUILDER-DECISIONS.md`): all file
bytes — uploaded resumes, built-resume PDFs (R0.6), application attachments — go through **one seam** with a
**local-filesystem driver** as the default now; the S3 driver is selected later by config only; R0.6 must
not call S3 directly. Existing: `ResumeStorageService` (interface: `objectKeyFor`, `store`, `load`,
`delete`) + `S3ResumeStorageService` (AWS SDK v2) + `StorageConfiguration` (`S3Client` bean, anonymous
creds when blank) + `dossier.storage.*` properties; `ApplicationAttachmentResource` and `ResumeFileResource`
proxy downloads through the API. Production today points at a real AWS bucket whose pre-2026-09 objects
are orphaned.

## 1. Decisions

| # | Decision |
|---|---|
| D1 | **Rename, don't rewrite.** `ResumeStorageService` becomes `FileStorage` (`service/storage/FileStorage.java`); `S3ResumeStorageService` becomes `S3FileStorage`; a new `LocalFileStorage` joins. The interface keeps `objectKeyFor(prefix, userId, entityId, fileName)` / `store` / `load` / `delete` and gains `exists(key)`, `stat(key) → {size, contentType, etag, lastModified}`, `open(key) → InputStream` (streaming; `load` stays for small files), and `list(prefix, continuationToken)` (for the sweep). Callers are the three resources + R0.6; nothing else may import the SDK (ArchUnit rule: only `service.storage.s3` depends on `software.amazon.awssdk`). |
| D2 | **Driver chosen by one property.** `dossier.storage.driver = local | s3` (env `DOSSIER_STORAGE_DRIVER`, default **`local`** in prod and dev). `@ConditionalOnProperty` picks the bean; the `S3Client` bean is created only for `s3`. Compose mounts a named volume `uploads:/srv/uploads` into api; `dossier.storage.local.root=/srv/uploads`. Tests run `local` against a temp dir, plus the existing MinIO IT for `s3`. |
| D3 | **Keys are driver-neutral**: `<prefix>/<userId>/<entityId>-<uuid>-<safeName>` (exists). Local maps a key to `<root>/<prefix>/<userId>/<rest>`; the sanitiser already strips path separators, and `LocalFileStorage` additionally resolves and asserts the real path starts with `<root>` (traversal test). Max key length 512; filename ≤ 200 chars after sanitising. |
| D4 | **Writes are atomic and fsync'd**: write to `<root>/.tmp/<uuid>`, `fsync`, `Files.move(ATOMIC_MOVE)`; a crash leaves only `.tmp` litter that the sweep removes (> 1 h old). Content-type is stored in an xattr-free sidecar: `<file>.meta` (JSON: contentType, size, sha256, createdAt) written before the move. `stat` reads it. |
| D5 | **Limits and sniffing at the seam, not per caller**: `FileStorage.store` enforces `dossier.storage.max-bytes` (10 MB today, `MultipartProperties` already 10 MB), computes sha256, and **sniffs** the content with Tika-free magic-number checks for the allowed set (`application/pdf`, `docx` zip signature, `image/png|jpeg` for attachments later) — a declared `application/pdf` that doesn't start with `%PDF` is rejected 415. Callers keep their own business rules (resume caps, R0.6 sizes). |
| D6 | **Downloads stream with `ETag` + `Content-Length` + `Cache-Control: private, max-age=0`** from `open()`; `Range` is supported for PDFs (`206`) so the Resume Builder preview and mobile viewers can seek. The API stays the only reader; the web proxies (Option A, locked). |
| D7 | **Disk is now user data → it is backed up and watched.** `backup-files.sh` (backup-restore-pitr.md D4) syncs `/srv/uploads` nightly; `host-guard.sh` alarms at 80 % of the volume; `dossier.storage.local.min-free-bytes` (default 1 GB) makes `store` fail with **507 Insufficient Storage** (`STORAGE_FULL`) before the disk is actually full, so MySQL on the same disk never starves. |
| D8 | **Migration between drivers is a job, not a flag flip.** `scripts/ops/storage-migrate.sh local→s3` (or the admin "Run now" job `storage.migrate`, A10.2): walks `list("")`, copies each object + meta to the target with sha256 verification, writes `storage_object.migrated_at`. During migration `dossier.storage.driver=dual-read` serves reads from the target then falls back to the source, writes go to the target. When the sweep reports zero unmigrated objects, flip to `s3` and (after a backup) delete local. The reverse direction works identically. |
| D9 | **A `storage_object` ledger** (new table): `key PK, driver, size, sha256, content_type, owner_user_id, ref_type (RESUME|BUILT_RESUME|ATTACHMENT), ref_id, created_at, migrated_at, deleted_at`. Every `store` inserts, every `delete` soft-deletes. It is the **inventory** the 2026-09-17 loss lacked (blobs without rows), feeds the orphan sweep, the DSAR export (list of files), account deletion (delete by owner), and the per-user storage quota (`SUM(size) WHERE owner`) that Free/Pro caps can use later. |
| D10 | **Orphan sweep** (`storage.sweep`, weekly, A10.2 registry): objects on the driver with no live ledger row → report, and delete after 30 days in the report; ledger rows whose object `exists()` is false → mark `missing_at`, report, and the owning resource shows "file unavailable" rather than 500. The S3 bucket's pre-2026-09 orphans are the first report; the user decides deletion (open question). |

## 2. Configuration

```yaml
dossier:
  storage:
    driver: ${DOSSIER_STORAGE_DRIVER:local}          # local | s3 | dual-read
    max-bytes: ${DOSSIER_STORAGE_MAX_BYTES:10485760}
    local:
      root: ${DOSSIER_STORAGE_LOCAL_ROOT:/srv/uploads}
      min-free-bytes: ${DOSSIER_STORAGE_MIN_FREE_BYTES:1073741824}
    s3:                                              # unchanged keys, moved under s3
      endpoint: ${DOSSIER_STORAGE_ENDPOINT:}
      region: ${DOSSIER_STORAGE_REGION:us-east-1}
      bucket: ${DOSSIER_STORAGE_BUCKET:dossier-resumes}
      access-key: ${DOSSIER_STORAGE_ACCESS_KEY:}
      secret-key: ${DOSSIER_STORAGE_SECRET_KEY:}
      path-style-access: ${DOSSIER_STORAGE_PATH_STYLE_ACCESS:false}
```

`docker-compose.prod.yml`: `S3_BUCKET`/`S3_ACCESS_KEY`/`S3_SECRET_KEY` lose their `:?` (required) marks —
blank S3 is a valid state under `local`. The `uploads` named volume is declared; `api` mounts it `rw`;
`mysql` and `web` do not see it. Volume lives under `/var/lib/docker/volumes` on the same disk as MySQL
today (P6.3 moves to a dedicated data disk on the own server).

## 3. Interface

```java
public interface FileStorage {
    String objectKeyFor(String prefix, Long userId, Long entityId, String fileName);
    StoredObject store(String key, InputStream in, long declaredLength, String contentType);   // sniffs, limits, ledger
    StoredFile  load(String key);                                                              // small files (≤ 2 MB) — else IllegalState
    InputStream open(String key, @Nullable LongRange range);
    Optional<ObjectStat> stat(String key);
    boolean exists(String key);
    void delete(String key);                                                                   // idempotent
    Page<String> list(String prefix, @Nullable String continuationToken);
}
record ObjectStat(long size, String contentType, String etag, Instant lastModified) {}
```

Error mapping at the resources: `StorageFullException` → 507 `STORAGE_FULL`; `UnsupportedContentException`
→ 415 `UNSUPPORTED_FILE`; `TooLargeException` → 413 `FILE_TOO_LARGE`; missing object → 404 `FILE_MISSING`
(and the ledger row marked). All four already have user-facing copy slots in the upload components.

## 4. Failure modes

| Failure | Behaviour |
|---|---|
| disk full mid-write | temp file fails, nothing moved, ledger untouched, 507; host-guard already paged at 80 % |
| api container replaced during a write | temp litter only; sweep removes; client retries |
| volume accidentally recreated (compose `down -v`) | ledger rows → `missing_at` by the sweep; **never** run `down -v` — the forced deploy command (deploy doc D8) can't |
| S3 creds revoked while `driver=s3` | `store` 503 `STORAGE_UNAVAILABLE` with retry copy; canary `storage:"fail"` pages |
| dual-read with a half-migrated object | read falls back to source; migrate job verifies sha256 before marking |
| two drivers hold the same key | impossible by design: ledger `driver` column is authoritative; `dual-read` consults it first |
| `.meta` sidecar missing (manual copy) | `stat` falls back to `Files.probeContentType` + size; sweep rewrites the sidecar |

## 5. Security & privacy

- No public bucket, no presigned URLs (Option A locked); local root `0700`, owned by the container's
  `app` user; the volume is not world-readable on the host.
- At rest: S3 SSE-S3 (exists). Local: full-disk encryption is the host's job — the own-server runbook
  (P6.3) requires LUKS on the data disk; on the shared box it is not available → stated on `/trust`.
- Sniffing stops disguised executables being stored and served back with a trusted content type;
  `Content-Disposition: attachment` on every download; `X-Content-Type-Options: nosniff` (P4.1).
- Account deletion: `DELETE` by `owner_user_id` through the ledger, then the sweep confirms.
- Ledger has no file content and no filenames beyond the sanitised key.

## 6. Cost

Local: zero until the disk fills (~1 GB per 100 users at 5 resumes × 2 MB). S3 later: ~$0.023/GB-month
+ requests — trivial. The migration job's egress from the box is free; S3 PUTs ≈ $0.005/1k.

## 7. Tests

`LocalFileStorageTest` (atomic write, traversal rejected for `../`, `..\\`, absolute and URL-encoded keys,
min-free honoured, sidecar round-trip, range reads), `S3FileStorageIT` (renamed; MinIO), `FileStorageSniffTest`
(PDF/DOCX accepted, PDF-named PNG rejected, zip bomb size guard), `StorageLedgerIT` (store/delete rows,
quota sum), `StorageSweepTest` (orphan both directions, 30-day grace, `.tmp` litter), `StorageMigrateIT`
(local→MinIO with sha verification and dual-read fallback), ArchUnit (`awssdk` only under
`service.storage.s3`), `ResumeFileResourceIT`/`ApplicationAttachmentResourceIT` keep passing against
`local`, plus the ops test for `backup-files.sh`.

## 8. Rollout

P5.1 (interface rename + local driver + property + compose volume; prod flips to `local` — existing S3
rows keep `driver=s3` in the ledger backfill so old resumes still load) → P5.3 (sniffing, limits, streaming,
ranges) → P5.2 (files backup + host-guard volume threshold; pairs with P0.5) → P5.5 (ledger backfill +
sweep + first orphan report) → P5.4 (migration job + dual-read; exercised local→MinIO in staging before it
is ever needed in prod).
