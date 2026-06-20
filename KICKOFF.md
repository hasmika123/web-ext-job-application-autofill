# Claude Code kickoff prompt

Open Claude Code in this repo, press **Shift+Tab** until it shows
**"auto-accept edits on"**, create a working branch (`git checkout -b build`),
then paste the prompt below.

---

You are building Dossier autonomously. Read `CLAUDE.md`, then `PROGRESS.md`.

Work the **loop** in CLAUDE.md, one task at a time, starting at **Current focus**:
1. Read ONLY the relevant phase section of `ROADMAP.md` (never the whole file).
2. Implement the task.
3. Run the tests in CLAUDE.md → they must be green.
4. Update `PROGRESS.md` (check box, advance Current focus, add a Log line).
5. Commit as its own commit `phase<P>.<N>: <subject>` and `git push`.
6. Continue automatically to the next task.

**Stop and ask me only if:**
- A task is ambiguous or underspecified.
- Tests fail twice in a row on the same task.
- You'd add a dependency, change the architecture, or deviate from `ROADMAP.md`.
- You hit a task marked as a decision/gate in `PROGRESS.md`.
- A step needs a secret or external account I must create (e.g. Neon, R2,
  Cloudflare, Chrome Web Store, GitHub Actions secrets).

**Guardrails:** no auto-submit, ever · capture real ATS DOM before writing
selectors · never commit secrets (env only) · server is source of truth, the
extension store is an offline cache · one task = one commit = one push.

When you reach Phase 1, generate the backend from `dossier.jdl` (the stack is
already decided in PROGRESS 1.0 — do not pause to re-confirm it).

Begin now with the Current focus task. Give me a one-line summary after each
commit so I can follow along.
