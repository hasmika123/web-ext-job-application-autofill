# ATS fixtures

Fixtures are local, scrubbed DOM snapshots. A `.html` file is paired with a `.expect.json` file
that records the adapter, canonical field-to-control map, manual/absent fields, required gaps, and
controls that must never be clicked. `node test/fixture_replay.test.js` replays every pair with the
real matcher and filler; it does not contact an ATS or submit a form.

Capture rules:

- Use only a public or throwaway synthetic-persona page; never capture a real candidate, session,
  token, login, or resume.
- Run captured HTML through `scripts/fixture-scrub.js` before adding it.
- Keep ids, names, labels, `aria-*`, `data-automation-id`, classes, required markers, option text,
  and shadow-root structure because the matcher depends on them.
- Remove scripts, inline handlers, control values, third-party URLs, and personal-looking text.
- Every adapter mapping change must update a sidecar expectation and the replay test must stay at
  100% for that fixture. Expectations are reviewed changes, not auto-generated snapshots.
