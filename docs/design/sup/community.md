# Design — Community (area `sup`, epic S8)

Status: decided 2026-10-11, **P2 and deliberately small**. Gen Z asks "is this legit?" on Reddit
and Discord within minutes; none of the benchmarked tools run a moderated space (Teal's "community"
is a marketing line, Simplify has a feedback board, Handshake has a feed). A community is a
moderation commitment, not a feature — so the design is a playbook plus two product bridges.

## 0. Decisions

1. **Discord, one server, invite from `/community`.** Not Slack (not where the audience is), not a
   self-hosted forum (moderation + a11y + GDPR cost). Discord's own minimum age is 13; **Kiwiply's
   server is 16+** (aligned with the org design's 16+ rule for school orgs) and says so at the gate.
2. **The community is not a support channel.** `#help` has a pinned bot message: "For account,
   billing or bugs, message us in the app — you'll get a tracked reply" with the link. Staff do a
   daily 20-minute pass; anything with account specifics is redirected to a ticket. SLA promises
   live only on tickets.
3. **Safety by default:** new members can't DM for 7 days; `#is-this-legit` is the hero channel — a
   bot runs the same `@kiwiply/scam-rules` on pasted text and replies with the score card and the
   `/safety` link; humans add context. Recruiters may not post jobs (prevents the scam vector
   the FTC and LinkedIn data describe).
4. **Minimal bridges to product:** changelog "Shipped" posts via webhook (S5.4); `/feedback` board
   links; monthly office hours (voice, recorded, posted to `/help`); campus ambassador role (G34
   decision belongs to `mkt`/`pay`; the server supports the role either way).
5. **Kill criteria:** if after 90 days fewer than 100 weekly-active members or moderation load
   > 3 h/week, archive the server to read-only and keep `#is-this-legit` as a web-only feature.

## 1. Structure

```
#start-here (rules, 16+, no job posts by recruiters, no DMs for 7 days) · #announcements (webhook)
#is-this-legit (bot + humans) · #site-didnt-fill (redirect to the drawer button; engineers lurk)
#wins (interview/offer posts; share cards) · #feedback (links to /feedback) · #help (redirect bot)
#campus-<school> (created by ambassadors) · #off-topic
Roles: Team · Moderator · Ambassador · Member · Verified (linked Kiwiply account via OAuth later, P3)
```

## 2. Moderation playbook (one page in `web/content/support-playbooks/community.md`)

Code of conduct (short, plain, no legalese) · report flow (Discord report + `#mod-mail`) · scam
poster handling (ban + add to `scam_blocklist` as `template` source `report` after a second mod
confirms) · harassment (one warning then ban; minors involved ⇒ immediate ban + report to Discord)
· data requests (we store nothing beyond Discord's own; the bot keeps no logs) · escalation to
the trust area for legal questions.

## 3. Bot (`scripts/discord-legit-bot.mjs`, ≤ 200 lines, no DB)

Reads messages in `#is-this-legit` only (message-content intent limited to that channel), runs the
rules, replies with the band + top 3 signals + link, deletes nothing, stores nothing. Hosted as one
more container in the compose file behind the shared edge (plat area); fails closed (silent).

## 4. Failure modes

| Failure | Behaviour |
|---|---|
| Scammers join to DM members | DM cooldown, recruiter-post ban, report button, `#is-this-legit` pin |
| Support leaks into Discord | redirect bot + staff policy; no account help in public |
| Low activity | kill criteria; archive honestly ("we're small") |
| A minor joins | 16+ gate text; ban on discovery; no age verification beyond Discord's |

## 5. Privacy

Discord is a separate controller; `/community` says so and links Discord's policy. We never link a
Discord id to a Kiwiply account at launch (Verified role is P3 and would need consent).

## 6. Cost

Moderator time (≈ 2 h/week at launch) + one tiny container. No AI.

## 7. Tests

`discord-legit-bot.test.mjs` (channel filter, reply format from fixtures, no persistence);
`/community` page render test. Everything else is process.

## 8. 390 px wireframe

```
┌──────────────────────────────┐
│ Kiwiply community            │
│ A small, moderated Discord   │
│ for people job hunting now.  │
│ • Ask "is this legit?" and   │
│   get an answer in minutes   │
│ • Share wins, not résumés    │
│ • 16+ · no recruiters posting│
│   jobs · DMs off for 7 days  │
│ [ Join on Discord ↗ ]        │
│ Need account help? Message   │
│ us in the app instead ›      │
│ Code of conduct ›            │
└──────────────────────────────┘
```
