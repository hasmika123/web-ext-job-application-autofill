# Timesheets — moved to the Timesheets & Consultancy Ops product (area H)

> **Pointer (2026-10-11).** Timesheets were promoted from an org epic to a **product area, like the Resume
> Builder**, by user decision ("like resume builder the time sheets also should be an product level feature").
> This file's content — the job to be done, decisions, personas, the 390 px flows, state machine, data model,
> never-collected table, proof scan, API, flags, consent, reminders, audit, exports, failure modes, rollout,
> tests and competitive table — now lives in **`docs/TIMESHEETS-DESIGN.md`** (§0–§19), with the backlog in
> `docs/TIMESHEETS-STORIES.md` / `docs/timesheets/stories.json`, the decisions in `docs/TIMESHEETS-DECISIONS.md`
> and the on-ramp in `docs/HANDOFF-TIMESHEETS.md`.
>
> The org stories this file used to cite (the Consultancy Ops epic's timesheet stories) were removed from
> `docs/roadmap/areas/org.json`; the old → new id mapping is `docs/TIMESHEETS-DESIGN.md` §13. Nothing in
> the design changed by the move: D1 org add-on only · D2 priced later in admin · D7 OCR optional, off by
> default · D10 P2 · every number a setting with a default.

Where things went:

| was here | now |
|---|---|
| §0 job to be done · §1 decisions | DESIGN §0, §1 |
| §2 personas | DESIGN §2 |
| §3 week view / proof / inbox / history | DESIGN §3.1–§3.4 |
| §4 state machine | DESIGN §4.1 |
| §5 data model (incl. §5.12 never collected, §5.13 proof scan) | DESIGN §5.1–§5.13 |
| §6 API | DESIGN §6 |
| §7 flags | DESIGN §7 |
| §8 privacy, consent, erasure | DESIGN §3.5, §12 |
| §9 reminders | DESIGN §10 |
| §10 audit | DESIGN §8 |
| §11 export | DESIGN §9 |
| §12 failure modes | DESIGN §16 (risks) + the stories' AC |
| §13 rollout · §14 tests · §15 competitive · §16 billing | DESIGN §14, §15, §17, §11 + H7.1 |
