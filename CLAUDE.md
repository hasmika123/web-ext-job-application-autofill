# CLAUDE.md — Working rules for this repo

Claude Code reads this automatically every session. Keep it short.

## What this is
Dossier: MV3 browser extension (vanilla JS, no build step, everything on
`window.JAF`) that autofills job applications. Being productized into extension +
Spring Boot API + Next.js web app. Spec: `ROADMAP.md`. Task tracker: `PROGRESS.md`.

## The loop (do this every session)
1. Read `PROGRESS.md` → find **Current focus**.
2. Read ONLY the matching phase section of `ROADMAP.md` (not the whole file).
3. Do that one task. Stop when it's done — do NOT start the next task.
4. Update `PROGRESS.md`: check the box, move **Current focus** to the next task,
   add one line under **Log**.
5. **Commit and push this one task on its own.** One task = one commit = one push.
   Never batch multiple tasks into a commit. Message: `phase<P>.<N>: <subject>`
   (e.g. `phase0.1: local field-choice cache`). Then `git push`.

## Hard rules
- **No auto-submit, ever.** No CAPTCHA bypass. Legitimate use only.
- **Capture real ATS DOM before writing selectors.** Never guess tenant markup —
  it's the #1 failure mode. Use real `data-automation-id`s / option text.
- Extension code: vanilla JS on `window.JAF`, no build step, no new deps without asking.
- Server is the source of truth; the extension's local store is an offline cache.
- Never commit secrets. API keys via env only; never ship a key in the extension bundle.

## Commands
- Extension tests: `cd job-autofill && npm test` (must be green before done).
- Backend (once it exists): `cd api && ./gradlew test`.
- Web (once it exists): `cd web && npm test`.

## Version-bump ritual (extension changes)
Bump `job-autofill/manifest.json` + `package.json`. If rules change, bump the
`version` in `src/config/rules.js` too (the smoke test asserts it).

## Layout (target monorepo)
`/job-autofill` extension · `/api` Spring Boot · `/web` Next.js · root: ROADMAP/PROGRESS/CLAUDE.
When working in `job-autofill/`, read `job-autofill/ARCHITECTURE.md` for the file map.

## Definition of done (every task)
Acceptance criteria met · tests added & green · PROGRESS.md updated · versions
bumped if extension changed · **committed and pushed as its own commit** (one task
per commit, see loop step 5). If blocked or going off-spec, stop and ask — don't improvise.
