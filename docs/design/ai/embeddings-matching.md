# Design — Embeddings and retrieval for job matching, search and keywords (area `ai`, epic I4)

Status: decided 2026-10-11. Inputs: `JobMatchService` + `JobPrefilter` (13.6b: word-overlap gates,
≤ 50 candidates, one Flash-Lite call), `job_posting`/`job_match` tables (`20260922070000`,
`20260922080000`), `AtsScoreService` keyword coverage, ROADMAP 16.1 (strong matches — first build after
Launch 1; Free 3 rule-ranked/day, Pro 10–20 AI-scored), U4.1/U4.2 (posting store v2 + FULLTEXT search),
U4.6 (feedback), gap **G13** (sponsorship signal), locked rules (no scraping; public ATS APIs + one
licensed aggregator; nothing unlimited).

## 0. Summary

1. **Embeddings run on the platform budget, not the user's.** Postings are embedded once (nightly,
   batch), profiles when they change. Cost is ≈ $0.0003 per posting and ≈ $0.001 per profile — the
   per-user AI budget is untouched by retrieval; only the Pro LLM *reasons* step is metered to the user.
2. **No new infrastructure.** Vectors are 256-dim float32 (Matryoshka-truncated from
   `gemini-embedding-001`; `voyage-3-lite` is the configured fallback) stored as `VARBINARY(1024)` in
   MySQL. Retrieval is SQL prefilter → in-process cosine over ≤ 5 000 candidates (≈ 1 ms) → rules
   re-rank → optional LLM scoring of the top 50. MySQL 9's `VECTOR` type / HeatWave index is a later
   swap behind `VectorStore`, not a requirement.
3. **Three consumers, one index:** daily matches (16.1), job search ranking (U4.2 hybrid
   FULLTEXT + vector), and synonym-aware keyword coverage for ATS score / keywords panel (R5.2).
4. **Feedback learns a preference vector.** 👍/save/apply move a per-user EMA vector toward the
   posting; 👎/hide move it away; "hide company" is a hard filter. Explanations stay rule-based
   (fairness doc) — the vector re-ranks, the rules explain.
5. **Free gets rules + vectors, no LLM**: 3 matches/day with deterministic reasons; Pro gets 10–20
   with LLM-scored reasons on the economy model (U4.6 split kept).

## 1. Audience lens

The phone user wants three jobs that *feel* right in the first 30 seconds, with a reason that reads
like a friend's text ("remote, React, they sponsor"). Retrieval quality is that moment; synonyms
("frontend" ≈ "UI engineer", "IaC" ≈ "Terraform") are where keyword systems embarrass themselves and
where Jobscan's "overly literal" complaint comes from.

## 2. Architecture

```
nightly 02:00 ingest (exists) ──▶ 02:20 EmbedJob: new/changed postings → text = title + company + location + first 1 500 chars (cleaned)
                                      → EmbeddingProvider.embed(batch ≤ 100) → job_posting_embedding
profile change (bio/resume default/preferences) ──▶ ProfileEmbedJob (debounced 10 min): text = headline + target titles + skills + last 2 roles + preferences
                                      → profile_embedding (one row per user; version = profile fingerprint)

MatchPipeline.run(user):
  1 SQL prefilter: posted ≤ 48 h (matches) | any (search), country/remote gate, level gate (existing rules), not seen, not tracked, not hidden company  → ≤ 5 000 ids
  2 cosine(profile ⊕ preference vector, posting) in Java over the candidate vectors (loaded in one query, cached per night)   → top 200
  3 RulesRerank: + title match, + skills named, + sponsorship ok, − stale, − level distance (existing JobPrefilter signals become weights)  → top 50 with `reasons[]`
  4 Free: top 3 shown with rule reasons · Pro: top 50 → one LLM call (JOBS task, batch API at night) → score + ≤ 15-word reason (truth-checked against posting) → ≥ 60 shown, max 20
```
Search (U4.2): `score = 0.55 · FULLTEXT_rank + 0.45 · cosine(query_vec, posting)` with the same
rules re-rank; query embedding is one call per distinct query text (cached 24 h, platform budget).

## 3. Data model (additive)

```sql
CREATE TABLE job_posting_embedding (
  posting_id BIGINT PRIMARY KEY, model VARCHAR(60) NOT NULL, dims SMALLINT NOT NULL DEFAULT 256,
  vec VARBINARY(1024) NOT NULL, text_hash CHAR(64) NOT NULL, created_at DATETIME NOT NULL,
  CONSTRAINT fk_jpe FOREIGN KEY (posting_id) REFERENCES job_posting(id) ON DELETE CASCADE
);
CREATE TABLE profile_embedding (
  user_id BIGINT PRIMARY KEY, model VARCHAR(60) NOT NULL, dims SMALLINT NOT NULL DEFAULT 256,
  vec VARBINARY(1024) NOT NULL, pref_vec VARBINARY(1024) NULL,      -- feedback EMA, same dims
  fingerprint CHAR(64) NOT NULL, updated_at DATETIME NOT NULL
);
CREATE TABLE match_feedback (                                        -- U4.6's signal, normalised
  id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id BIGINT NOT NULL, posting_id BIGINT NOT NULL,
  signal VARCHAR(12) NOT NULL,   -- UP|DOWN|HIDE|HIDE_COMPANY|SAVE|APPLY|DISMISS
  created_at DATETIME NOT NULL, INDEX (user_id, created_at)
);
ALTER TABLE job_posting ADD COLUMN sponsorship VARCHAR(12) NULL;     -- G13: OFFERED|NOT_OFFERED|UNKNOWN (rules first, model when ambiguous)
ALTER TABLE job_posting ADD COLUMN dedup_group BIGINT NULL;          -- I4.5 semantic dedup
```
Retention follows postings (30 days in U4.1). Profile vectors are deleted with the account; they are
derived data, included in DSAR as "we keep a numeric summary of your profile for matching".

## 4. API

Internal: `EmbeddingProvider.embed(model, texts) → List<float[]>` on the `AiProvider` seam (routing doc
§2), task `EMBED` metered with `login = NULL, feature = embed`. `VectorStore.topK(queryVec, candidateIds,
k)` pure Java. Public: no new endpoints; `GET /api/jobs/search?explain=1` (U4.2) and
`GET /api/profile/job-matches` gain `reasons[]` and `signals{title, skills, location, sponsorship,
semantic}` per card (fairness doc §3).

## 5. Cost math (platform)

| Item | Volume | Tokens | Cost / month |
|---|---|---|---|
| Posting embeddings | 10 000 new/day × 400 tok | 4 M/day | `gemini-embedding-001` ≈ $0.15/M → $0.60/day ≈ **$18**; batch −50 % → $9 |
| Profile embeddings | 5 000 users × 2 changes/mo × 300 tok | 3 M/mo | ≈ $0.45 |
| Query embeddings | 20 000 distinct queries/mo × 20 tok | 0.4 M | ≈ $0.06 |
| Pro LLM reasons | per user, existing JOBS budget line | — | user budget (gateway doc §5: ≈ $0.05/user/mo) |

Even at 10× volume the platform spend is < $200/month, inside the A4 monthly cap and invisible to the
80 % margin guard (it is a platform cost per posting, amortised over all users). Dimension 256 keeps
the candidate load at ≈ 5 MB per night per 5 000 postings.

## 6. Feedback learning

`pref_vec ← normalise(0.9 · pref_vec + 0.1 · sign · posting_vec)` with sign +1 (UP/SAVE/APPLY), −1
(DOWN/HIDE); `HIDE_COMPANY` → hard filter list on `job_match_setting`. Query vector at match time =
`normalise(0.7 · profile_vec + 0.3 · pref_vec)` (pref absent → profile only). Evaluated on held-out
feedback (last 20 % by time): precision@10 must rise vs profile-only; otherwise the weight is tuned,
never the explanation.

## 7. Sponsorship signal (G13)

Rules over posting text: phrases (`will sponsor`, `visa sponsorship available`, `H-1B`, `unable to
sponsor`, `must be authorized … without sponsorship`, `no sponsorship`) → OFFERED / NOT_OFFERED; both
or neither → UNKNOWN; UNKNOWN with a candidate phrase → economy-model classification in the nightly
ENRICH batch (platform budget, ≤ $0.0002 each). Recall measured on a 300-posting labelled fixture
(target ≥ 0.9 for NOT_OFFERED, the one that hurts). Matching rule exists already: a user who needs
sponsorship × NOT_OFFERED → score < 30; cards show the tag; U4.5 preference filter uses it.

## 8. Failure modes

| Failure | Behaviour |
|---|---|
| Embedding provider down | postings stay unembedded; pipeline falls back to the current word-overlap prefilter for those (flag `semantic=false` in explain); retry queue next night |
| Model changed (dims/model id) | `model` column mismatch → re-embed job over 7 nights (rate-limited); mixed-model cosine never computed (filter by model) |
| Candidate set > 5 000 | tighten prefilter (recency, level) before cosine; metric `match.candidates` p95 |
| Preference vector drifts to one company | hard cap: pref contributes ≤ 30 %; "reset my preferences" in settings |
| Vector leaks (DSAR/export) | vectors are not exported (derived); documented |

## 9. Fairness / privacy

Embedded profile text excludes name, contact, EEO/self-ID, DOB, address line (allowlist builder shared
with the fairness doc). Bias eval (I5.2) runs the match pipeline with paired personas (name/gender/age
signals removed vs present — they are never in the text, the test proves it). Postings are public data.

## 10. Evals and tests

`VectorStoreTest` (cosine, topK, ties), `EmbedJobTest` (hash skip, batch split, model mismatch),
`MatchPipelineTest` (prefilter → cosine → rerank ordering with fixtures; semantic=false fallback),
`SponsorshipRulesTest` (300-fixture recall), `PreferenceVectorTest` (EMA math, cap), eval
`jobs.score` precision@10 ≥ 0.6 and a synonym set (20 pairs) where vector recall ≥ 0.9 vs keyword ≤ 0.5.

## 11. Rollout

I4.1 provider + tables + nightly embed (shadow, nothing user-visible) → I4.2 pipeline behind flag
`matches.semantic` for 10 % of Pro users; compare save-rate → I4.3 Free rules+vectors → I4.4 feedback
→ I4.5 dedup → I4.6 synonym coverage in ATS/keywords → I4.7 search hybrid when U4.2 lands → I9.8 sponsorship.

## 12. Mobile wireframe (390 px) — a match card with signals

```
┌──────────────────────────────┐
│ Stripe · Frontend Engineer   │
│ Remote (US) · $150–190k      │
│ ◔ 88 · React, TypeScript     │
│ ✓ sponsors visas  ✓ remote   │
│ "close to your Loop Studio   │
│  role; they want Next.js"    │
│ [Save] [Why 88?] [👎]        │
└──────────────────────────────┘
```
