# ATS fixtures

Fixtures are local, scrubbed DOM snapshots. A `.html` file is paired with a `.expect.json` file
that records the adapter, canonical field-to-control map, manual/absent fields, required gaps, and
controls that must never be clicked. `node test/fixture_replay.test.js` replays every pair listed in
`.fixture-replay.json` with the real matcher and filler; it does not contact an ATS or submit a form.

The manifest is intentional: `job-capture/` contains both one application-form contract and
posting-page sentinel contracts used by the capture tests. A new fixture must add its HTML, sidecar,
and manifest entry; an unlisted sidecar fails the replay test instead of being silently ignored.

Capture rules:

- Use only a public or throwaway synthetic-persona page; never capture a real candidate, session,
  token, login, or resume.
- Run captured HTML through `scripts/fixture-scrub.js` before adding it.
- Keep ids, names, labels, `aria-*`, `data-automation-id`, classes, required markers, option text,
  and shadow-root structure because the matcher depends on them.
- Remove scripts, inline handlers, control values, third-party URLs, and personal-looking text.
- Every adapter mapping change must update a sidecar expectation and the replay test must stay at
  100% for that fixture. Expectations are reviewed changes, not auto-generated snapshots.
