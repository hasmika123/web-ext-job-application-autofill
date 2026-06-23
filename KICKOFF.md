# Claude Code kickoff prompt

Open Claude Code in this repo, press **Shift+Tab** until it shows
**"auto-accept edits on"**, create a working branch (`git checkout -b build`),
then paste the prompt below.

---

You are building Dossier autonomously. Read `CLAUDE.md`, then `PROGRESS.md`.

Work the **loop** in CLAUDE.md, one task at a time, starting at **Current focus**:
1. Read ONLY the relevant phase section of `ROADMAP.md` (never the whole file).
2. **Choose the mode:**
   - If the task adds a new component, new dependency, or changes architecture
     (e.g. backend scaffold, auth, data model, sync layer, AI proxy, CI/CD, web
     dashboard) → **enter plan mode, present a plan, and WAIT for my approval
     before writing any code.**
   - If it's a small in-place change (e.g. a field cache, one ATS adapter, a
     version bump) → just execute.
3. Implement the task.
4. Run the tests in CLAUDE.md → they must be green.
5. Update `PROGRESS.md` (check box, advance Current focus, add a Log line).
6. Commit as its own commit `phase<P>.<N>: <subject>` and `git push`.
7. Continue automatically to the next task.

**Stop and ask me only if:**
- A task is ambiguous or underspecified.
- Tests fail twice in a row on the same task.
- You'd add a dependency, change the architecture, or deviate from `ROADMAP.md`.
- You hit a task marked as a decision/gate in `PROGRESS.md`.
- A step needs a secret or external account I must create (e.g. AWS S3, Brevo/SMTP,
  Cloudflare, Chrome Web Store, GitHub Actions secrets).

**Guardrails:** no auto-submit, ever · capture real ATS DOM before writing
selectors · never commit secrets (env only) · server is source of truth, the
extension store is an offline cache · one task = one commit = one push.

Phases 0–2 are already done — the Spring/MySQL backend, the Next.js web app, the
extension sync layer, and the **live deployment + CI/CD** (kiwiply.com) all exist.
Pick up from **Current focus** (Phase 3+); don't regenerate or re-decide the stack.

Begin now with the Current focus task. Give me a one-line summary after each
commit so I can follow along.
