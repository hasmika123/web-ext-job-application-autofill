# Consultancy Ops add-on — moved to the Timesheets & Consultancy Ops product (area H)

> **Pointer (2026-10-11).** The whole add-on — timesheets *and* the money side (placements and rates,
> invoice records, payments, expenses, the profit view, the FINANCE role, retention, billing of the add-on)
> — is now one product area, **H**, designed in **`docs/TIMESHEETS-DESIGN.md`**. The money slice was moved
> rather than left here on purpose: invoices lock sheets, corrections of locked sheets flag the invoice,
> receipts reuse the proof scan and the same audit table covers both, so splitting them across an org
> document and a product document made the coupling artificial. No non-timesheet ops content remains in the
> org area; the org area keeps only the foundation stories (O1.x tenant model, O2.x invites, O6.x consent,
> O13.x notifications) that the product depends on.

Where things went:

| was here | now |
|---|---|
| §0 changelog vs the first draft | superseded by `docs/TIMESHEETS-DECISIONS.md` (decided + vetoable defaults) |
| §1 scope decisions | DESIGN §0, §1.3, §19 (non-goals) |
| §2 data model — money tables · §2.1 never collected | DESIGN §5.14 · §5.12 |
| §3 state machines (invoice) | DESIGN §4.2 |
| §4 profit view | DESIGN §5.15 |
| §5 API — money slice | DESIGN §6 (money block) |
| §6 finance flows (390 px) | DESIGN §3.6 |
| §7 billing of the add-on | DESIGN §11 (catalog rows, no price — D2) + story H7.1 |
| §8 privacy & security | DESIGN §12 |
| §9 tests | DESIGN §15 |

Stories: `docs/TIMESHEETS-STORIES.md` (H6 = money records, H7 = billing/retention/admin). The org stories
this file used to describe (the money-side stories of the Consultancy Ops epic) were removed from `docs/roadmap/areas/org.json`; the old → new id
mapping is DESIGN §13. `tenant-model.md` §4 still defines the FINANCE role and the `ops.*` permission keys.
