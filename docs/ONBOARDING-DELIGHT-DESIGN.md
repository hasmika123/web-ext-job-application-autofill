# Onboarding v2.1 — the delight layer (build-ready)

Written 2026-10-12 on `resume-builder`, after the user looked at the built review screen ("Does this look
right? 1 / 3", one card, Skip / Keep, a lot of empty space on desktop) and said: *"this page seems plain..
dont we need any entertainments here :)"*. This is the answer: a layer of play over every screen of
`docs/ONBOARDING-V2-DESIGN.md` (v2, R1.7–R1.12), the review screen first. Stories **R1.14–R1.20** in
`docs/resume-builder/stories.json` (epic R1b); decisions #34 and sub-rows in `docs/RESUME-BUILDER-DECISIONS.md`.

**How to read this.** Written for a Sonnet agent building one story per session. Every section is a
decision; if a story and this document disagree, this document wins; if something is unspecified, the
implementer **stops and asks**. Nothing in v2 is rebuilt: the shell, the draft, the confirm points, the
parse pipeline, `SwipeCard`, `ConfettiBurst`, `ProgressBar`, `Toast`, `useReducedMotion` all stay and are
**extended**, never replaced. R1.12 (the motion + a11y pass, Playwright + axe) is being built in parallel:
R1.14 waits for it, so the two never edit the same file in the same hour.

The bar: **Duolingo / Notion / Canva-level** onboarding for Gen Z and Gen Alpha first. Fun and alive —
but fast, honest and accessible. Nothing here ever slows a tap, invents a fact, shames a skip, or moves
for someone who asked the OS for less motion.

---

## 0. Summary

| # | What | Where it shows | Setting (§8) |
|---|---|---|---|
| 1 | **Mascot companion** — one persistent mascot that reacts to what you do (idle, peek, cheer, shrug, think, look, celebrate) with a short speech bubble, persona-aware, rotating | every screen; a companion column at ≥ 1280, a 104 px mascot with a bubble in the heading row at 768–1279 (§2.3a), a 44 px head with a bubble under it on phones | `onboarding.mascot.enabled` + `onboarding.delight.enabled` |
| 2 | **Review as a game** — card stack with two cards peeking, tilt + KEEP ✓ / SKIP stamp, fly-off, spring-up, animated counter, a quiet "🔥 3 in a row" combo, a haptic tap, ← → E Z keys | `review` | `delight.enabled`, `delight.combo`, `delight.haptics` |
| 3 | **Honest highlights** — rule-based ✨ chip on one bullet per card ("Numbers stand out to recruiters"), and a tip when a card has no numbers; no AI, nothing invented | `review` cards | `delight.highlights` |
| 4 | **Progress delight** — milestone pops at 25 / 50 / 75 %, a shine on the bar, the time-left digits animate down, a ~1.2 s skippable interstitial ("3 jobs, 1 school, 14 skills — let's check them 👀") | the bar; between parse and card 1 | `delight.milestones`, `delight.interstitialMs`, `delight.barRider` |
| 5 | **Micro-interactions** — button squish, Keep sparkles, chip pops, skills flying in, emoji glyphs on the natural answer options, a bigger payoff (count-up, mascot dance, more confetti) and a shareable "Profile ready ✨" card | everywhere; `skills`, `prefs`, `done` | `delight.enabled`, `delight.share` |
| 6 | **Guardrails** — `prefers-reduced-motion` static twins for everything, no layout shift, 120–300 ms, nothing blocks input, no new dependencies, no sound, no content in analytics, every switch and string admin-configurable | — | all of `onboarding.delight.*` |

---

## 1. Principles (added to v2's seven)

8. **Delight is a layer, not a step.** Remove every setting in §8 and the v2 flow is exactly what it was.
   Nothing new is required to finish; nothing new has a wait the user cannot skip.
9. **Honest fun.** A highlight names something that is literally in the text. A milestone states a
   computed percentage. The combo counts real taps. No fake scarcity, no "you're almost there!!!",
   no guilt on Skip — a Skip gets "No worries." and the mascot moves on.
10. **Respect the hand and the eye.** Tap feedback 120–180 ms, transitions 200–300 ms, one skippable
    1.2 s interstitial — and under `prefers-reduced-motion` every effect has a static twin that carries
    the same information (or is simply absent when it carried none).
11. **The mascot is a companion, never a narrator.** It reacts; it does not explain, nag, or announce.
    Screen readers already hear "Kept Acme. Education 2 of 8." — the bubble is for the eye (§2.6).

---

## 2. The mascot companion

### 2.1 Poses and the art we have

Art in `web/public/v2/` (board extractions, 150–250 px, soft on high-DPI — `web/public/v2/README.md`).
What each file actually shows, and the pose it serves:

| Pose | Meaning | File (existing) | What is in the picture | Motion class (§2.4) |
|---|---|---|---|---|
| `wave` | hello, welcome back | `/v2/mascot-wave.png` 210×221 | winking, headphones, one paw raised | `ob-m-wave` |
| `idle` | the base pose of the screen, breathing | the screen's pose (table §2.5) | — | `ob-m-idle` |
| `peek` | appearing from behind an edge | `/v2/mascot-peek.png` 172×214 | paws on a ledge, big eyes (top-left clipped) | `ob-m-peek` |
| `cheer` | Keep, chip added, answer saved | `/v2/mascot-clap.png` 221×246 | eyes closed, clapping (left edge clipped) | `ob-m-cheer` |
| `shrug` | Skip, "no worries" | `/v2/mascot-wave.png` (no shrug art yet) | the wink reads as "all good" | `ob-m-shrug` |
| `think` | parsing, saving | `/v2/app/mascot-books.png` 149×154 | sitting on books | `ob-m-think` |
| `look` | the interstitial, "let's check them" | `/v2/app/mascot-binoculars.png` 171×162 | binoculars | `ob-m-look` |
| `read` | the upload hero, paste | `/v2/app/mascot-resume.png` 154×159 | holding a resume | `ob-m-idle` |
| `grad` | student persona chosen | `/v2/app/mascot-grad-big.png` 147×120 | graduation cap | `ob-m-cheer` |
| `laptop` | skills, about you | `/v2/app/mascot-wave-laptop.png` 145×142 | waving at a laptop | `ob-m-idle` |
| `celebrate` | milestones, payoff | `/v2/mascot-clap.png` | clapping | `ob-m-dance` |

The two clipped files (`clap` left edge, `peek` top-left) are **always drawn on the companion's disc**
(§2.2): a 120 px soft lime circle behind the art hides any cut edge, so no pose is unusable. The phone
head (§2.3) is an `object-cover` crop of the top 60 % of the art, which also hides the cuts.

`StepMascot`'s `ART` map (`parts.tsx`) gains the missing names (`peek`, `binoculars`, `grad`,
`laptopWave`) with their native sizes; the companion reads poses through one `POSE_ART: Record<MascotPose,
MascotName>` in `delight/poses.ts`, so swapping in new art is one line per pose.

### 2.2 Placement at 1440 — the companion column

```
1440 ────────────────────────────────────────────────────────────────────────────────────────
                      ┌────────────────── 560 ──────────────────┐   ┌──── 200 ────┐
                      │ ‹ Back            Saved ✓      ⋯   ✕    │   │             │
                      │ ▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱▱▱  about 1 min left │   │             │
                      │                                         │   │   ╭──────╮  │  ← disc 120, art 104
                      │ Does this look right?      🔥 3   3 / 8 │   │   │ (o o)│  │     tall, bottom-aligned
                      │                                         │   │   ╰──────╯  │
                      │ ┌─────────────────────────────────────┐ │   │ ╭─────────╮ │  ← bubble, 13.5px,
                      │ │ 💼 Work experience                  │ │   │ │ That's a│ │     max 2 lines,
                      │ │ Product Design Intern               │ │   │ │ keeper. │ │     box reserved 48px
                      │ │ Acme · Austin, TX · Jun–Aug 2025    │ │   │ ╰─╲───────╯ │
                      │ │ • Shipped onboarding redesign       │ │   └─────────────┘
                      │ │ • Ran 12 usability sessions         │ │
                      │ │   ✨ Numbers stand out to recruiters│ │
                      │ │                              Edit ✎ │ │
                      │ └─────────────────────────────────────┘ │
                      │  └───────────── ghost 1 ─────────────┘  │
                      │    └─────────── ghost 2 ───────────┘    │
                      │ ┌───────────────┐ ┌───────────────────┐ │
                      │ │     Skip      │ │     Keep  ✓       │ │
                      │ └───────────────┘ └───────────────────┘ │
                      │           Keep all the rest             │
                      │     ← Skip · → Keep · E Edit · Z Undo   │  ← kbd legend, desktop only
                      └─────────────────────────────────────────┘
```

- `CompanionDock` renders inside `OnboardingShell` as `absolute left-full top-[52px] ml-8 w-[200px]
  hidden xl:flex flex-col items-center` — outside the 560 column, aligned with the `<h1>` row. 560 + 32 +
  200 = 792 px, so it fits from `xl` (1280) and sits in the empty space the user noticed at 1440.
  Below `xl` the phone dock (§2.3) is used. The shell's wrapper becomes `relative` (it already is
  `mx-auto max-w-[560px]`); `overflow-x-clip` on the page root keeps the dock from ever causing a
  horizontal scrollbar (`main` of the `(app)` layout already clips; the story verifies at 1024–1279).
- **Disc:** 120 px circle, `bg-v2-lime-soft/60`; the art is `h-[104px] w-auto`, bottom-aligned, drawn
  with `next/image`, `alt=""`, `aria-hidden`.
- **Bubble:** `SpeechBubble` (new `@kiwiply/ui` primitive, §9.1): accent-tinted surface (`tone="tint"`, amended 2026-10-12; `paper`
  is the plain variant), 1 px accent/40 border, 12 px radius, a 10 px tail pointing up to the disc (it was up-left; the disc is centred), 13.5 px `v2-navy`, `max-w-[180px]`,
  **the box is always reserved at 48 px min-height** (two lines) so the column never shifts when a line
  changes or clears. Text swaps with a 120 ms crossfade (static under reduced motion).
- The dock is `aria-hidden` as a whole (§2.6). It never receives focus or pointer events
  (`pointer-events-none`), so it can never sit between the user and a control.

### 2.3a Placement at 768–1279 — the mid tier (amended 2026-10-12, user feedback)

The user opened the built review screen in a ~810 px pane and saw only a 44 px head and a grey line under the heading: "plain".
A laptop with a side panel open, or a tablet, has no room for the 200 px column (the 560 px column is already nearly the whole
main area), but it has plenty of room for more than a phone. So there are **three tiers**, not two, and **every tier's speech is
a real tinted bubble with a tail — never grey subtitle text**:

| Window | Mascot | Speech | Where |
|---|---|---|---|
| `xl` ≥ 1280 | the 200 px column of §2.2 (120 px disc, art 104 px) | `SpeechBubble tone="tint"` under the disc, tail up | right of the 560 column |
| **`md`–`xl` 768–1279** | **`CompanionMid`: a 104 px disc (art 90 px, bottom-aligned)** | **a 158 px tinted bubble on its left, tail pointing right at the mascot, up to 3 lines inside the reserved 104 px height** | **the end of the heading row (right of the title, left of nothing); `flex-none`, row height reserved so a longer line never moves anything** |
| `< md` < 768 | the 44 px head of §2.3 | a one-line tinted bubble under the heading row, right-aligned, tail up-right toward the head, 42 px reserved (`.phone` copy, truncates) | the heading row / under it |

The mid tier's bubble text is the same line the column and the phone caption show; the caption (`md:hidden`) is not drawn from `md`
up, so the line never appears twice. Nothing in the mid companion overlaps the top bar (Back, Saved pill, ⋯, ✕), the
counter or combo chip (they stay in the title's column, which wraps), the card or the sticky bar. Reactions (cheer bounce, shrug
tilt, the art swap and the new line) play on whichever tier is showing; under reduced motion only the art and the line change.

### 2.3 Placement at 390 — the head in the heading row

```
390 ──────────────────────────────────┐
│ ‹ Back        Saved ✓     ⋯    ✕    │
│ ▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱  about 1 min    │
│                                     │
│ Does this look right?   🔥 3  3/8 ◯ │  ← 44 px head, right of the counter
│ That's a keeper.                    │  ← 1-line caption, 12.5px muted, reserved 18 px
│ ┌─────────────────────────────────┐ │
│ │ 💼 Work experience              │ │
│ │ Product Design Intern           │ │
│ │ …                               │ │
│ └─────────────────────────────────┘ │
│  └──────────── ghost 1 ──────────┘  │
│    └────────── ghost 2 ────────┘    │
│  Swipe right to keep, left to skip  │
│ ┌──────────────┐ ┌────────────────┐ │  ← sticky footer, untouched
│ │     Skip     │ │    Keep  ✓     │ │
│ └──────────────┘ └────────────────┘ │
│          Keep all the rest          │
└─────────────────────────────────────┘
```

- `CompanionDock` variant `phone` (`xl:hidden`): a **44 px round head** (`rounded-full overflow-hidden
  bg-v2-lime-soft/60`, the art `object-cover object-top` scaled so the face fills the circle) placed as
  the last item of the heading row, after the counter, `flex-none`. The row already wraps (`flex-wrap
  items-end`); the head's 44 px matches the row's existing height so nothing moves.
- The bubble becomes a **one-line tinted caption bubble** under the heading row (amended 2026-10-12: a bubble with a tail pointing at
  the head, not grey text; `text-[12.5px]`, truncating, 42 px always reserved, `aria-hidden`, below 768 only). Same copy, same rotation; lines over
  ~40 characters are given a phone variant in the deck (§7) so nothing truncates in practice.
- Never inside the sticky footer; never over the card; never over a toast (toasts are bottom-right
  fixed; the head is in the top third). At 360 the row still fits: h1 wraps to two lines, the chips
  (`🔥 3`, `3/8`, head) stay on the h1's last line or wrap below it, both fine.
- On screens without a counter row (hello, source, prefs…) the head sits at the right of the `<h1>` the
  same way (`StepHeading` gains an optional `aside` slot), the caption under it.

### 2.4 Motion vocabulary (CSS keyframes in `globals.css`; nothing under `prefers-reduced-motion: reduce`)

| Class | Keyframes | Duration | When |
|---|---|---|---|
| `ob-m-idle` | `scale(1) → scale(1.02) → scale(1)`, transform-origin bottom | 3 s, loop, `ease-in-out` | always, as the resting breath |
| `ob-m-peek` | `translateY(12px) opacity 0 → translateY(0) opacity 1` | 240 ms `ease-out` | the dock mounts; a screen change |
| `ob-m-cheer` | `translateY(0) → -10px → 0 → -6px → 0` | 480 ms `ease-out` | Keep, chip added, answer saved |
| `ob-m-shrug` | `rotate(0) → rotate(-5deg) → rotate(0)` | 300 ms `ease-in-out` | Skip |
| `ob-m-think` | `rotate(-3deg) ↔ rotate(3deg)` | 1.6 s, loop, `ease-in-out` | parsing, saving |
| `ob-m-look` | `translateX(-3px) ↔ translateX(3px)` ×2 | 800 ms | the interstitial |
| `ob-m-wave` | `rotate(0) → 6deg → -4deg → 6deg → 0`, origin bottom-left | 600 ms | hello, welcome back |
| `ob-m-dance` | three bounces (`translateY -12/-8/-4`) with `rotate ±5deg` | 900 ms, once | milestones, payoff |

Reactions are one-shot: the component sets `data-react="cheer"` for the class duration (a `setTimeout`
matching the keyframe, cleared on unmount), then returns to `idle`. A reaction that arrives while one
plays replaces it (no queue — the user taps fast, the mascot keeps up). `will-change` is not set
(the art is one small image; compositor promotion is not needed).

**This is the fallback that ships.** Real "shrug", "think" and unclipped "cheer"/"peek" art (§2.7) make
it better; the layer never waits for it.

### 2.5 What the companion does on each screen (pose · trigger → reaction · bubble key)

| Screen | Base pose | Reactions | Bubble keys (§7) |
|---|---|---|---|
| `hello` | `wave` (plays `ob-m-wave` on mount) | chip picked → `cheer`; persona `student` → `grad` | `hello.idle`, `hello.{persona}` |
| `source` | `read` | drag-over → `peek`; file chosen → `think` + `source.reading` (then `source.reading.long` after 8 s, `source.reading.longer` after 15 s); error → `shrug` + `source.error` | `source.idle`, `source.reading*`, `source.error` |
| `paste` | `read` | text ≥ 80 chars → `cheer` once; Read it → `think` | `paste.idle`, `paste.ready` |
| `fresh` | `laptop` | each sub-step answered → `cheer` | `fresh.idle` |
| interstitial | `look` (`ob-m-look`) | — | (the h1 is the line) |
| `review` card | `idle` (`wave` art) | Keep → `cheer` + `review.keep.*`; Skip → `shrug` + `review.skip.*`; Edit saved → `cheer` + `review.edited`; Undo → `peek` + `review.undo`; combo ≥ 3 → `cheer` with `review.combo` | `review.idle.*`, persona flavour on card 1 |
| `review` recap | `cheer` | — | `recap.idle` |
| `skills` | `laptop` | 5th skill → `cheer` + `skills.five` | `skills.idle`, `skills.five` |
| `you` | `laptop` | Save my profile pressed → `think`; success → `cheer` | `you.idle`, `you.saving`, `you.saved` |
| so-far | `cheer` | — | `sofar.idle` |
| `prefs` | `idle` | answer chip tapped → `cheer`; 3rd answered → `prefs.three` | `prefs.first`, `prefs.idle.*`, `prefs.three`, `prefs.eeo` |
| `done` | `celebrate` (`ob-m-dance` once, then idle) | — | `done.idle` |
| resume banner | `wave` on mount | — | `resume.back` (same device), `resume.other` |
| milestone (any) | `celebrate` for 900 ms | — | `milestone.{25,50,75}` in the bar pop, not the bubble |

Bubble rotation: `pick(key, seed)` = `lines[seed % lines.length]`, seed = the card index on `review`, the
question index on `prefs`, 0 elsewhere. **Deterministic** (no `Math.random`) so tests and screenshots
are stable, and the same card shows the same line after a Back.

### 2.6 Accessibility of the companion — decided: **not announced**

The dock (disc, art, bubble, caption) is `aria-hidden="true"` and `pointer-events-none`. Reasons:
(1) the review screen already has a polite live region that says "Kept Acme. Education 2 of 8." and
the shell says "Step 3 of 7" — a second region saying "That's a keeper." would double-announce every
tap and bury the useful line; (2) bubble copy never carries information that is not elsewhere on the
screen (the honest highlight and the tip are *in the card*, not in the bubble; the milestone text is
appended to the shell's existing announcement once, §4.1); (3) a companion that talks to a screen
reader every three seconds is the opposite of a companion. The one exception is the interstitial,
which is a real screen with an `<h1>` and a button (§4.4).

### 2.7 Asset list — new art the user can produce or approve (never blocking)

Transparent PNG (or SVG), subject centred, **≥ 600×600**, same character (lime bird, headphones), no
board leftovers, bottom edge clean. Replacing a file keeps its name; adding a pose is one row in
`POSE_ART`.

| # | Pose | Description | Replaces / adds |
|---|---|---|---|
| A1 | `cheer` | both paws up, eyes closed, big smile — **unclipped** | replaces `mascot-clap.png` |
| A2 | `peek` | peeking from the **right** edge (half body visible, paws on the edge) — unclipped | replaces `mascot-peek.png` |
| A3 | `shrug` | paws out, palms up, head tilted, small smile | new `mascot-shrug.png` |
| A4 | `think` | one paw on chin, eyes up-right, headphones | new `mascot-think.png` |
| A5 | `celebrate` | mid-jump with two confetti bits, mouth open | new `mascot-celebrate.png` |
| A6 | `wave` | one paw raised, two eyes open (today's wink is fine; this is the hi-res twin) | replaces `mascot-wave.png` |
| A7 | `head` | face only, square 512×512, for the phone head + the bar rider | new `mascot-head.png` (today: `object-cover` crop of A6) |
| A8 | `look` | binoculars (today's art is good; hi-res twin) | replaces `app/mascot-binoculars.png` |

Until any of these exist the fallback of §2.1 + §2.4 ships as is.

---

## 3. Review cards as a game

### 3.1 The stack (`CardStack`, new `@kiwiply/ui` primitive, §9.2)

```
┌─────────────────────────────┐  ← the live SwipeCard (z 3)
│                             │
└─────────────────────────────┘
 └───────────────────────────┘   ← ghost 1: scale .96, translateY 10px, opacity .75 (z 2)
   └───────────────────────┘     ← ghost 2: scale .92, translateY 20px, opacity .45 (z 1)
```

- `CardStack` wraps the live card in a `relative` box with **`pb-5` reserved** (20 px for the two
  offsets), so the stack's height equals the card's height + 20 px always — no layout shift as ghosts
  come and go. Ghosts are `absolute inset-0` blank "paper" (`rounded-2xl border border-v2-line/70
  bg-paper shadow-v2-soft`), `aria-hidden`, no content (no next-card info leaks into the DOM before the
  user reaches it; nothing extra to render). `ghosts = min(2, cardsLeft − 1)`.
- **Fly-off:** on a decision the live card gets `data-fling="keep" | "skip"` → keyframe `ob-fling-right`
  / `ob-fling-left`: `translateX(±140%) rotate(±14deg)`, opacity 1 → 0, **240 ms** `cubic-bezier(.2,.8,.4,1)`.
  The decision is dispatched **immediately** on press (state and draft move on at once); the screen keeps
  a `leaving` snapshot `{id, dir}` and renders the outgoing card **on top, `pointer-events-none`,
  `aria-hidden`**, for 240 ms, then drops it. The incoming card is interactive underneath from the first
  frame — a fast user can decide the next card before the previous one has left.
- **Spring-up:** the new live card plays `ob-spring-up`: from ghost 1's place (`scale(.96)
  translateY(10px)`) to rest, **200 ms** `cubic-bezier(.34,1.4,.64,1)` (one soft overshoot); ghost 2 slides
  into ghost 1's place with the same timing. Continuity: it reads as the stack advancing.
- **Reduced motion:** no fling, no spring; the outgoing card is removed at once; the incoming card
  crossfades 120 ms; ghosts are static (still drawn — they carry the "more to come" meaning).
- `SwipeCard` drag: tilt stays (`rotate(dx / 24)`, as built) with `will-change: transform` **only while
  dragging**; release past the threshold triggers the same fling in the drag's direction instead of the
  built snap-back.

### 3.2 The stamp

`SwipeCard`'s hint pill becomes a **stamp**: `KEEP ✓` (accent border + accent-deep text on accent-soft)
top-right, `SKIP` (danger border/text on paper) top-left; `rotate(-12deg)`, 2.5 px border, 16 px,
extrabold, uppercase, `tracking-[.08em]`, 12 px padding, 8 px radius. On drag its opacity tracks
`progress` (as built). On a **button or keyboard** decision the stamp snaps to opacity 1 (120 ms) and
rides the fling. Under reduced motion it still appears (opacity only), 120 ms, then the card is removed.
New `SwipeCard` props: `stamp?: boolean` (the stamp look; default keeps today's pill), `fling?: "keep" |
"skip" | null` (play the fling now), `onFlingEnd?()`.

### 3.3 The counter animates (`AnimatedNumber`, new `@kiwiply/ui` primitive, §9.3)

"3 / 8": the **3** is an `AnimatedNumber` — the old digit slides up and fades (`translateY(-100%)`),
the new slides in from below, **180 ms** `ease-out`, inside an `overflow-hidden` box of one line-height;
`tabular-nums` so widths never jump. The `aria-label="Card 3 of 8"` on the `<p>` is unchanged. Reduced
motion: instant swap. The same primitive drives the "about **1** min left" digit (§4.3) and the payoff
count-up (§5.6, mode `countUp`).

### 3.4 The combo — "🔥 3 in a row" (not a streak)

A **session-only count of consecutive Keeps** on this review. Edit-then-keep counts as a Keep. It never
persists, never leaves the screen, never appears in the recap, is never announced, and carries no
reward. DECISIONS #33i ("no streaks") stands for anything daily, persistent or loss-framed; this is a
combo chip, recorded as #34a.

- Appears at **≥ 3**: a pill `🔥 3 in a row` left of the counter (`bg-warn-soft text-warn-deep` or the
  nearest existing tokens; 11.5 px, semibold), `aria-hidden`, pops in 150 ms (`ob-chip-pop`). Each further
  Keep re-pops it (number via `AnimatedNumber`).
- On Skip it **fades out over 200 ms**, no text, no "lost", no colour change. On Undo of a Skip the
  count is **not** restored (keeping the rule simple and the chip honest: it counts taps in a row).
- The chip's width is reserved by `min-w` of its widest state (`🔥 12 in a row`) only while shown; the
  heading row wraps, so its appearance never pushes the h1 (verified at 360 in the story's test).
- Companion: at 3 → `cheer` with `review.combo` ("Three in a row 🔥"); every 5th thereafter → the same.
- Analytics: `onboarding_delight_combo{max}` once at the recap.

### 3.5 Haptics

`tap(kind)` in `lib/onboarding/delight.ts`: `navigator.vibrate(pattern)` where `decision = 10`,
`milestone = 20`, `payoff = [10, 40, 10]`; guarded by **all** of: `config.onboarding.delight.haptics`,
`!useReducedMotion()`, `"vibrate" in navigator`, `matchMedia("(pointer: coarse)").matches`; wrapped in
`try/catch`; a no-op everywhere else (iOS Safari has no `vibrate` — it is simply silent there). Fired on
Keep / Skip (button, swipe or key), on a milestone, once on the payoff. Never on hover, never on a
screen change.

### 3.6 Keyboard

On the review screen's container (`onKeyDown`, bubbling), ignored when the event target is an `input`,
`textarea`, `select`, `[contenteditable]`, when a modifier is held, or while editing:

| Key | Action | Note |
|---|---|---|
| `←` | Skip | as built on the focused card; now also from anywhere on the screen |
| `→` | Keep | same |
| `E` | Edit | opens `ItemForm` for the card on show |
| `Z` | Undo | takes back the **last decision** (the previous card: `onUndecide(prevId)` + cursor back — exactly the toast's Undo), only when the cursor is > 0 and the previous card has a decision; otherwise no-op |

The card keeps `aria-keyshortcuts="ArrowRight ArrowLeft e z"`. A **kbd legend** under "Keep all the
rest" from `sm` up: `← Skip · → Keep · E Edit · Z Undo` as four `<kbd>` in 12 px muted (hidden on
phones; the swipe hint line stays there). `E` and `Z` must not fire while `ItemForm` is open.

### 3.7 Keep → sparkles (`SparkleBurst`, new `@kiwiply/ui` primitive, §9.4)

Eight 6 px dots (accent, accent-deep, warn, two of them 4 px stars drawn with the existing `StarDoodle`)
burst from the centre of the Keep button, radius 48 px, **320 ms**, scale 1 → 0, opacity 1 → 0, WAAPI
like `ConfettiBurst` (deterministic angles), `aria-hidden`, `pointer-events-none`, absolutely positioned
inside the button's `relative` wrapper (it never affects layout; `overflow` of the footer is visible).
On a swipe-keep it bursts from the card's centre instead. Nothing under reduced motion.

### 3.8 Review wireframes (the whole thing together)

**1440** — see §2.2. **390** — see §2.3. The recap:

```
1440                                                        390
┌──────────────── 560 ────────────────┐ ┌── 200 ──┐        ┌────────────────────────────┐
│ ‹ Back          Saved ✓      ⋯  ✕   │ │  ╭────╮ │        │ ‹ Back   Saved ✓    ⋯   ✕  │
│ ▰▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱ about 1 min left │ │  │clap│ │        │ ▰▰▰▰▰▰▰▰▱▱▱▱▱▱ about 1 min │
│                                     │ │  ╰────╯ │        │ Nice. Here's what     ◯    │
│ Nice. Here's what we'll add.        │ │ ╭──────╮│        │ we'll add.                 │
│ Adding 3 roles, 1 school, 14 skills.│ │ │You   ││        │ You just saved some typing.│
│                                     │ │ │just  ││        │ Adding 3 roles, 1 school…  │
│ ┌─────────────────────────────────┐ │ │ │saved ││        │ ┌────────────────────────┐ │
│ │ ✓ Product Design Intern · Acme  │ │ │ │some  ││        │ │ ✓ Product Design Intern│ │
│ │ ✓ Barista · Blue Bottle         │ │ │ │typing││        │ │ ✓ Barista · Blue Bottle│ │
│ │ ✓ UT Austin · BS Design         │ │ │ ╰──────╯│        │ │ ✓ UT Austin            │ │
│ └─────────────────────────────────┘ │ └─────────┘        │ └────────────────────────┘ │
│ [           Continue  →           ] │                    │ [      Continue  →       ] │
└─────────────────────────────────────┘                    └────────────────────────────┘
```

Recap: the rows **stagger in** (`ob-fly-in`, 30 ms apart, first 12 only), each with a `CheckIcon` that
draws in 200 ms (`SavedTick`'s look); the mascot-clap of v2 (behind the card, desktop) is **replaced**
by the companion column (one mascot per screen, never two).

---

## 4. Progress delight

### 4.1 Milestones at 25 / 50 / 75 %

- Thresholds `[0.25, 0.5, 0.75]` on the **whole bar's** `progress` (`(stepsDone + subProgress) /
  stepsTotal`). `useMilestones(progress)` keeps `prevRef`; on mount `prevRef = progress` (a resumed run
  does not replay old ones); a milestone fires when `prev < t ≤ next`, once each per run (set in UI
  state, not in the draft).
- **Pop:** `MilestonePop` — a pill anchored at the bar's filled end: `absolute`, `top: -34px`, `left:
  clamp(8%, pct, 92%)`, `translateX(-50%)`, paper surface, 12.5 px semibold `v2-navy`, 1 px line, 8 px
  radius, a 6 px down-tail; enters 200 ms (`translateY(6px)` + fade), holds **1.2 s**, leaves 200 ms;
  `aria-hidden`, `pointer-events-none`; the bar's wrapper is `relative`. It overlaps the top-bar row
  above it transiently (nothing there is a target during that 1.6 s besides ✕, which stays clickable
  because the pop is `pointer-events-none`). Reduced motion: appears and disappears, no transform.
- **Copy:** `milestone.25` "Quarter there 🌱", `milestone.50` "Halfway — you're fast ⚡", `milestone.75`
  "Almost done 🎯". Honest: the number is the bar's own.
- **Announced once:** the shell's existing polite region (`heard`) gets the milestone text appended to
  the next screen announcement (`"Step 4 of 7. Halfway — you're fast."`, emoji stripped) — or, when the
  milestone fires mid-screen (review cards), appended to the review's own `announce` string once. Never
  a new live region.
- Companion: `celebrate` 900 ms. Haptic `milestone`. Analytics `onboarding_delight_milestone{pct}`.

### 4.2 The bar's shine, and the optional rider

- `ProgressBar` gains `shine?: boolean`: the filled `div` gets `relative overflow-hidden` and an
  `::after` 48 px-wide gradient (`transparent → white/45 → transparent`, `skewX(-20deg)`) that sweeps
  left → right, keyframe `ob-shine` **1.2 s** every 4 s (`animation: ob-shine 1.2s ease-in-out 2.8s
  infinite` — the delay makes the gap), `no-preference` only, and only when `value ≥ 0.08` (a 4 px
  sliver has nothing to shine).
- `ProgressBar` gains `cap?: ReactNode`: a slot rendered at the filled end (`absolute`, `left: pct%`,
  `translate(-50%, -50%)`, `top: 50%`). The onboarding passes a **20 px round mascot head** (the phone
  head crop at 20 px) when `onboarding.delight.barRider` is on — **off by default** (#34e): at 4 px bar
  height a 20 px head sits over the top bar's row and distracts from the pill; it is there for the
  admin who wants it. It moves with the bar's own 300 ms width transition (same easing, `transition:
  left`), static under reduced motion.

### 4.3 The time-left label animates down

"about **2** min left" → "about **1** min left": the digit is an `AnimatedNumber` (§3.3), 180 ms, down
only (the estimate only ever goes down, DESIGN §5.0). "< 1 min left" is a text swap with a 120 ms
crossfade. `aria-valuetext` on the bar is unchanged.

### 4.4 The section interstitial — ~1.2 s, skippable

Shown **once per run**, right after a parse succeeds and before review card 1 (UI flag `introShown` in
`ProfileSetup` state, never in the draft; a resumed run never shows it). `screenKey = "review-intro"`;
the bar does not move; the shell focuses its `<h1>` and announces the step as usual.

```
390                                       1440 (centred column; companion `look`)
┌───────────────────────────────┐
│ ‹ Back      Saved ✓   ⋯   ✕   │
│ ▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱ about 1 min  │
│                               │
│        (mascot look, 96)      │   ← `ob-m-look`
│                               │
│  3 jobs, 1 school, 14 skills  │   ← h1, counts from the parse; zeros omitted
│  — let's check them 👀        │     ("2 projects and 9 skills — let's take a look 👀")
│                               │
│  [        Let's go  →       ] │   ← accent; Enter / Space / Esc / any tap = go now
│  (auto in a moment)           │   ← 12px muted; a thin 1.2 s `ob-drain` line under the button
└───────────────────────────────┘
```

- Auto-advance after `onboarding.delight.interstitialMs` (**1200**; `0` = never shown). The whole
  column has `onClick` → advance; `Enter`, `Space`, `Escape` and the button advance. Nothing is blocked:
  Back works, ✕ works, the ⋯ menu works. The timer is cleared on unmount.
- Reduced motion: identical, minus the mascot sway and the drain line (the "(auto in a moment)" text
  carries the meaning).
- The optional **prefs intro** ("Last stretch — 4 quick questions. All skippable.") uses the same
  component before the first question when `"prefs"` is in `onboarding.delight.interstitials`
  (default `["review"]` only — one wait is the budget).
- Analytics `onboarding_delight_interstitial{kind, skipped: bool}`.

---

## 5. Micro-interactions

### 5.1 Button press squish
Scoped CSS, no primitive change: `[data-delight="on"] button:not(:disabled):active { transform:
scale(.97); }` with `transition: transform 120ms ease-out` on `button` inside the shell, under
`no-preference` only. The shell root carries `data-delight` from `useDelight().on`.

### 5.2 Chips pop
Every selected chip (`ChoiceGroup` option, `ChipInput` chip, skills suggestion, persona chip) plays
`ob-chip-pop` (`scale(1) → 1.06 → 1`, **150 ms**) on selection — v2 §13 named this; R1.18 makes it real
in `ChoiceGroup` (`data-just-selected` for 150 ms) and `ChipInput`. Colour-only under reduced motion.

### 5.3 Skills fly in; tapping one pops
- Suggestion chips mount with `ob-fly-in` (`translateY(8px)` + fade → rest, **180 ms**), staggered
  `animationDelay = i × 30ms` for the first 12, the rest instant (a 40-chip stagger would be a wait).
- Tapping a suggestion: it pops (150 ms), is removed from the suggestions, and appears in the
  `ChipInput` with the same pop. Companion `cheer` on the 5th skill with `skills.five`.
- Reduced motion: chips just appear; the "five" bubble still shows (text).

### 5.4 Emoji glyphs on answer options — where natural (and where not)

| Question | Option → glyph | Why |
|---|---|---|
| Work arrangement | Remote 🏠 · Hybrid 🔀 · On-site 🏢 | natural, distinct |
| Relocation | Yes ✈️ · No 📍 | natural |
| Student / first-job start | Right away ⚡ · After I graduate 🎓 | natural |
| Notice period (7 options) | none | seven near-identical calendars add nothing |
| Work authorization, sponsorship | none | legal questions stay plain — no mood on a yes/no that has consequences |
| Salary | none | an input |
| Self-identification (EEO) | **never** | identity questions are never decorated |

Implementation: `ChoiceGroup` already takes `{ value, label: ReactNode }`; the glyph is `<span
aria-hidden className="text-[18px] leading-none">🏠</span>` before the text. **Stored values never
change** (the extension fills the exact words). Emoji render with the OS font (varies by platform;
acceptable). This amends v2 §5.2's "never emoji in the UI" to: *emoji are allowed in delight copy and
as option glyphs, always `aria-hidden`, never the only carrier of meaning, never on legal or EEO
questions* (#34b).

### 5.5 Other screens, briefly
- `hello`: the chosen persona chip pops; the mascot `cheer`s (or `grad` for student).
- `source`: drag-over makes the mascot `peek`; the busy card's "Reading your resume…" gets the `think`
  sway and the long-read lines (§2.5) so a 15 s parse never feels dead; the lock badge's expand gets a
  180 ms height ease (already instant under reduced motion).
- `you`: "Save my profile" → `think` while saving, `cheer` + `SavedTick` beside the button on success.
- so-far: the two ✓ rows draw in like the recap's.
- Undo toast: unchanged; the companion `peek`s with `review.undo`.

### 5.6 Payoff — bigger celebration + a shareable moment

```
390                                        1440 — same column, companion `celebrate`
┌─────────────────────────────────┐
│         (confetti, 36 pieces)   │
│         (mascot-clap, 96)       │  ← `ob-m-dance` 900 ms, once
│  You're set, Priya.             │
│  Kiwiply can now autofill       │
│  ~31 fields for you.            │  ← the 31 counts up 0 → 31 over 800 ms; "~" static
│                                 │
│  Profile strength ▰▰▰▰▰▰▰▱▱▱ 72%│
│                                 │
│ ┌─────────────────────────────┐ │  ← ShareCard, 1:1 up to 280 px, centred
│ │  (mascot-clap 56)           │ │     lime-soft → paper gradient, 16 px radius
│ │  Profile ready ✨           │ │     20 px display extrabold
│ │  ~31 fields autofill-ready  │ │     14 px
│ │  Priya · Oct 2026           │ │     12.5 px muted (first name only, or no line)
│ │  kiwiply.com                │ │     12 px, the wordmark `BrandLogo` small
│ └─────────────────────────────┘ │
│     [ Share ]   or   [ Copy ]   │  ← one button: Share when `navigator.canShare`, else Copy
│                                 │
│  What's next                    │
│  ┌ 📄 Build a resume ─────────┐ │
│  ┌ 🧩 Install the extension ──┐ │
│  ┌ 🔎 Find jobs ──────────────┐ │
│         Go to dashboard         │
└─────────────────────────────────┘
```

- **Count-up:** `AnimatedNumber mode="countUp" from={0} to={fields} duration={800}` — ease-out, updates
  every animation frame, ends exactly on `fields`; `aria-live` is not used (the `<p>` text is final from
  the first render for AT: render the final number in a visually-hidden span and the counting one
  `aria-hidden`). Reduced motion: the final number, static. `fields = 0` keeps the "ready to learn" line
  with no counter.
- **Confetti:** `ConfettiBurst count={36}` when delight is on (24 otherwise); unchanged otherwise.
- **Mascot:** `celebrate` (`ob-m-dance`, 900 ms, once) replacing v2's 400 ms pop-in; the pop-in stays
  as the reduced-motion twin? No — under reduced motion the mascot is static (v2 §13).
- **Share card** (`ShareCard`, web): shown when `onboarding.delight.share`; contains **only** the first
  name (optional), the computed `~N`, the month, "Profile ready ✨" and "kiwiply.com". Button **Share**
  → `navigator.share({ title: "Profile ready ✨", text: share.text })` (text only; no URL parameters
  with data; the text's link is the bare `kiwiply.com`); if `canShare` is missing → **Copy** →
  `navigator.clipboard.writeText(text)` + `SavedTick` "Copied" for 1 s. A refused/cancelled share is
  silent. **No image export**: a PNG would need `html2canvas` (a new dependency, not proposed) or a
  `next/og` route carrying the numbers in a URL (fine technically, but a public URL with a name + number
  needs a signed short-lived token first) — recorded as a follow-up in #34f; the text share ships.
  Analytics `onboarding_delight_share{method: share | copy}`.
- Haptic `payoff` once on mount (coarse pointers only).

### 5.7 Wireframes — skills and prefs

```
SKILLS · 1440                                              SKILLS · 390
┌──────────────── 560 ────────────────┐ ┌── 200 ──┐       ┌────────────────────────────┐
│ ‹ Back          Saved ✓      ⋯  ✕   │ │  ╭────╮ │       │ ‹ Back   Saved ✓    ⋯   ✕  │
│ ▰▰▰▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱ about 1 min left │ │  │lap │ │       │ ▰▰▰▰▰▰▰▰▰▰▱▱▱▱ about 1 min │
│ Your skills — tap to add.           │ │  ╰────╯ │       │ Your skills — tap     ◯    │
│ We found these in your resume.      │ │ ╭──────╮│       │ to add.                    │
│                                     │ │ │Tap   ││       │ Tap what's true.           │
│ Skills                              │ │ │what's││       │ We found these in your…    │
│ ┌─────────────────────────────────┐ │ │ │true. ││       │ Skills                     │
│ │ [Figma ×][React ×][SQL ×]       │ │ │ │Skip  ││       │ ┌────────────────────────┐ │
│ │ Add a skill…                    │ │ │ │what's││       │ │ [Figma ×][React ×]     │ │
│ └─────────────────────────────────┘ │ │ │not.  ││       │ │ [SQL ×]  Add a skill…  │ │
│ Five or more helps forms…           │ │ ╰──────╯│       │ └────────────────────────┘ │
│                                     │ └─────────┘       │ Five or more helps forms…  │
│ Suggested from your resume          │                   │ Suggested from your resume │
│ [+ User research] [+ A/B testing]   │  ← fly in,        │ [+ User research]          │
│ [+ Prototyping]   [+ Analytics]     │    30 ms stagger  │ [+ A/B testing] [+ Proto…] │
│                                     │                   │                            │
│ Languages  [English · Native ×]     │                   │ Languages [English · Nat…] │
│ [           Continue  →           ] │                   │ [      Continue  →       ] │
│            Skip for now             │                   │        Skip for now        │
└─────────────────────────────────────┘                   └────────────────────────────┘

PREFS · 1440                                               PREFS · 390
┌──────────────── 560 ────────────────┐ ┌── 200 ──┐       ┌────────────────────────────┐
│ ‹ Back          Saved ✓      ⋯  ✕   │ │  ╭────╮ │       │ ‹ Back   Saved ✓    ⋯   ✕  │
│ ▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▱▱▱▱  < 1 min left  │ │  │idle│ │       │ ▰▰▰▰▰▰▰▰▰▰▰▰▰▱▱ < 1 min    │
│ Where do you want to work from?     │ │  ╰────╯ │       │ Where do you want     ◯    │
│ Forms ask this a lot. Answer once,  │ │ ╭──────╮│       │ to work from?              │
│ we fill it everywhere.              │ │ │Forms ││       │ Forms ask this a lot.      │
│                                     │ │ │ask   ││       │ Forms ask this a lot. Ans… │
│ ┌──────────┐┌──────────┐┌─────────┐ │ │ │this a││       │ ┌────────────┐┌──────────┐ │
│ │ 🏠 Remote││ 🔀 Hybrid││🏢 On-site│ │ │ │lot.  ││       │ │ 🏠 Remote  ││ 🔀 Hybrid│ │
│ └──────────┘└──────────┘└─────────┘ │ │ ╰──────╯│       │ └────────────┘└──────────┘ │
│   ↑ tap → pops 150 ms, mascot cheer │ └─────────┘       │ ┌────────────┐             │
│                                     │                   │ │ 🏢 On-site │             │
│ Open to relocating?                 │                   │ └────────────┘             │
│ ┌──────────┐┌──────────┐            │                   │ Open to relocating?        │
│ │ ✈️ Yes   ││ 📍 No    │            │                   │ ┌──────────┐┌──────────┐   │
│ └──────────┘└──────────┘            │                   │ │ ✈️ Yes   ││ 📍 No    │   │
│ [           Continue  →           ] │                   │ [      Continue  →       ] │
│            Skip this one            │                   │        Skip this one       │
└─────────────────────────────────────┘                   └────────────────────────────┘
```

### 5.8 Sound — skipped, and why
Not built. (1) Browsers block audio before a gesture and the first gesture here is the one we would
want to sound — it would be inconsistent. (2) It is OFF by default per the brief, so almost nobody
hears it, for a per-tap `AudioContext` cost and an asset to ship. (3) Public places, shared laptops,
screen readers (a click over speech is hostile). (4) Haptics already give the hand its feedback on
phones. Revisit only if users ask (#34c).

---

## 6. Honest highlights — rules, exactly

Pure function `highlightFor(bullets: string[]): { index: number; rule: HighlightRule; label: string } |
null` in `web/src/lib/onboarding/highlights.ts`, with `hasNumber(text)`. **No AI, no network, nothing
invented** — a chip only ever names a thing that is literally in the text.

| Priority | Rule id | Test (case-insensitive; `text` is one bullet, trimmed) | Chip label (default copy key) |
|---|---|---|---|
| 1 | `number` | `NUMBER_RE` matches: a currency amount (`$`/`€`/`£` + digits, optional `k`/`m`/`b`), a percentage (`\d%`), a multiplier (`\d+x`), a thousands number (`\d{1,3}(,\d{3})+`), a count with a unit word (`\d+\s?(k\|m\|million\|billion\|users\|customers\|clients\|people\|students\|teams?\|countries\|stores\|hours\|days\|weeks\|months\|years\|sessions\|tickets\|orders\|requests)`), or `\d+\+` — **but not** a bare year (`(19\|20)\d{2}` alone) or a date range | `highlight.number` "Numbers stand out to recruiters" |
| 2 | `outcome` | contains one of: increased, reduced, cut, grew, improved, saved, boosted, doubled, tripled, halved, accelerated, decreased, raised, lowered, drove, generated, won, achieved, exceeded, lifted, sped up | `highlight.outcome` "Shows a result, not just a task" |
| 3 | `lead` | **starts with** one of: led, lead, managed, mentored, coached, coordinated, directed, owned, oversaw, ran, headed, founded, co-founded, organized, organised, supervised, trained, chaired, captained | `highlight.lead` "Leading something — recruiters notice" |
| 4 | `built` | **starts with** one of: built, shipped, launched, designed, created, developed, implemented, automated, delivered, engineered, released, published, deployed, wrote, prototyped, migrated | `highlight.built` "Shipped work — clear and concrete" |

- **At most one chip per card:** scan all bullets for rule 1; if none, rule 2; then 3; then 4. The chip
  goes on the **first** bullet that matches the winning rule. Cards with no bullets get nothing.
- **Chip:** inline after the bullet text, `SparklesIcon` 12 px + label, 11.5 px semibold
  `accent-deep` on `accent-soft/70`, full radius, `ml-1.5`, wraps as a unit (`inline-flex`,
  `whitespace-nowrap` on the label with `max-w-full`); plays `ob-chip-pop` when the card mounts (static
  otherwise). It is real text (**not** `aria-hidden` — it is honest information a screen-reader user
  also benefits from), read after the bullet.
- **Tip** when a card has ≥ 1 bullet and **no** bullet matches `number`: one muted line under the
  bullets, 12.5 px, `highlight.tip` "Tip: a number here (users, %, $) makes it stronger — easy to add
  later in your Resume Builder." Shown on EXPERIENCE and PROJECT cards only (never on EDUCATION); never
  with a chip of another rule? **Yes, allowed together** — a `lead` chip and the numbers tip can coexist
  (both true). Not shown when the card has 0 bullets (no nagging about empty cards).
- Never on the recap; never on a card being edited; recomputed from `edits[id]` when an edit saves.
- Analytics `onboarding_delight_highlight{rule}` once per card shown (no text).
- Tests (`highlights.test.ts`): each rule's positives and negatives (years and date ranges are not
  numbers; "led" inside a sentence is not `lead`; priority order; first-match index; empty bullets → null;
  the tip predicate).

---

## 7. Copy deck (defaults; admin overrides by key in `onboarding.delight.copy`)

All strings live in `web/src/lib/onboarding/delight-copy.ts` as `DELIGHT_COPY: Record<key, string |
string[]>`; `copy(key, vars, seed)` resolves an override, then the default, substitutes `{vars}`, and
picks `list[seed % list.length]` for lists. Phone variants (`key.phone`) are used by the caption
when present. Rules: ≤ 48 characters, one emoji at most and only at the end, no exclamation stacks,
never a judgement of the user's data, never sarcasm, never "required", never urgency.

| Key | Default (lists rotate by seed) | Phone variant | Where |
|---|---|---|---|
| `hello.idle` | "Hey there 👋" | — | hello bubble |
| `hello.student` | "Nice — let's keep it simple." | — | after the chip |
| `hello.first_job` | "First one's the big one. Let's go." | "Let's go." | after the chip |
| `hello.switching` | "New chapter. Let's get it right." | — | after the chip |
| `hello.experienced` | "Let's make this quick for you." | — | after the chip |
| `source.idle` | "Drop it in — I'll do the reading." | "I'll do the reading." | source |
| `source.student` | "No resume yet? Start fresh works." | — | source, student / first_job |
| `source.dragover` | "Yes, right here." | — | drag-over |
| `source.reading` | "Reading your resume…" | — | busy, 0–8 s |
| `source.reading.long` | "Almost there…" | — | busy, 8–15 s |
| `source.reading.longer` | "Still reading — big file." | — | busy, > 15 s |
| `source.error` | "That one's stubborn. Try another?" | — | parse error (the alert stays) |
| `paste.idle` | "Paste it — I'll sort the rest." | — | paste |
| `paste.ready` | "That'll do. Hit Read it." | — | ≥ 80 chars |
| `fresh.idle` | "No resume needed. Just answer." | — | fresh |
| `interstitial.review` | "{counts} — let's check them 👀" | — | h1; `{counts}` = "3 jobs, 1 school, 14 skills" / "2 projects and 9 skills" (zeros omitted, Oxford-free "and" before the last) |
| `interstitial.review.one` | "{counts} — let's take a look 👀" | — | when only one kind |
| `interstitial.prefs` | "Last stretch — {k} quick questions. All skippable." | "{k} quick questions, all skippable." | optional |
| `interstitial.go` | "Let's go" | — | button |
| `interstitial.auto` | "(auto in a moment)" | — | under the button |
| `review.idle` | ["Swipe or tap — your call.", "Taking it card by card.", "Only what you confirm goes in.", "Edit if something's off."] | ["Your call.", "Card by card.", "Only what you confirm.", "Edit if it's off."] | each card, seed = index |
| `review.idle.student` | "Internships and part-time count too." | "Part-time counts too." | card 1 only |
| `review.idle.first_job` | "Every bit counts here." | — | card 1 |
| `review.idle.switching` | "Transferable stuff — keep it." | — | card 1 |
| `review.idle.experienced` | "You've got plenty. Let's move." | "Let's move." | card 1 |
| `review.keep` | ["Nice one.", "That's a keeper.", "Adding that.", "Yep, that's going in.", "Solid."] | same | Keep |
| `review.skip` | ["No worries.", "Skipped — easy to add later.", "Cool, moving on.", "Your call. Next one."] | ["No worries.", "Easy to add later.", "Moving on.", "Next one."] | Skip |
| `review.edited` | "Fixed and kept." | — | Edit saved |
| `review.undo` | "Back in the list." | — | Undo |
| `review.combo` | "Three in a row 🔥" | — | combo hits 3 (bubble); the chip says `combo.chip` |
| `combo.chip` | "🔥 {n} in a row" | "🔥 {n}" | the chip |
| `review.last` | "Last one." | — | final card |
| `recap.idle` | "You just saved yourself some typing." | "Saved yourself some typing." | recap |
| `skills.idle` | "Tap what's true. Skip what's not." | "Tap what's true." | skills |
| `skills.five` | "Five already — forms love that." | "Five — forms love that." | 5th chip |
| `you.idle` | "Last check. Then it's saved." | — | you |
| `you.saving` | "Saving…" | — | pressed |
| `you.saved` | "Saved. That's the big one done." | "Saved ✓" | success |
| `sofar.idle` | "All safe. Pick up anytime." | — | so-far |
| `prefs.first` | "Quick ones. All skippable." | — | first question |
| `prefs.idle` | ["Forms ask this a lot.", "Answer once, filled everywhere.", "Skip is always fine."] | same | seed = index |
| `prefs.three` | "Three down — nearly there." | — | 3rd answered |
| `prefs.eeo` | "Optional. Your call entirely." | — | EEO screen |
| `done.idle` | "We did it, {firstName}." / no name: "We did it." | — | payoff |
| `resume.back` | "Welcome back 👋" | — | resume banner, same device |
| `resume.other` | "Picked up from your other device 👋" | "Welcome back 👋" | other device |
| `milestone.25` | "Quarter there 🌱" | — | bar pop |
| `milestone.50` | "Halfway — you're fast ⚡" | — | bar pop |
| `milestone.75` | "Almost done 🎯" | — | bar pop |
| `highlight.number` | "Numbers stand out to recruiters" | — | chip |
| `highlight.outcome` | "Shows a result, not just a task" | — | chip |
| `highlight.lead` | "Leading something — recruiters notice" | — | chip |
| `highlight.built` | "Shipped work — clear and concrete" | — | chip |
| `highlight.tip` | "Tip: a number here (users, %, $) makes it stronger — easy to add later in your Resume Builder." | — | under bullets |
| `keys.legend` | "← Skip · → Keep · E Edit · Z Undo" | — | desktop legend |
| `share.title` | "Profile ready ✨" | — | card + share title |
| `share.line` | "~{n} fields autofill-ready" | — | card |
| `share.meta` | "{firstName} · {month}" / no name: "{month}" | — | card |
| `share.site` | "kiwiply.com" | — | card |
| `share.text` | "I just set up my Kiwiply profile — ~{n} fields autofill-ready ✨ kiwiply.com" | — | Web Share / clipboard |
| `share.button.share` | "Share" | — | |
| `share.button.copy` | "Copy" | — | |
| `share.copied` | "Copied" | — | SavedTick |

The emoji strip (for the announced milestone) removes `\p{Extended_Pictographic}` and trims.

---

## 8. Settings (admin-configured; `ResumeBuilderSettingKeys` + `ResumeBuilderConfigDTO.Onboarding.Delight` + `config.onboarding.delight`)

| Key | Type | Default | Bounds / values | Gates |
|---|---|---|---|---|
| `onboarding.delight.enabled` | BOOL | true | | the whole layer (every section of this document) |
| `onboarding.delight.haptics` | BOOL | true | | §3.5 |
| `onboarding.delight.combo` | BOOL | true | | §3.4 |
| `onboarding.delight.highlights` | BOOL | true | | §6 |
| `onboarding.delight.milestones` | BOOL | true | | §4.1 |
| `onboarding.delight.interstitialMs` | INT | 1200 | 0–3000 (0 = none) | §4.4 |
| `onboarding.delight.interstitials` | JSON string[] | `["review"]` | subset of `review`, `prefs` | §4.4 |
| `onboarding.delight.barRider` | BOOL | false | | §4.2 |
| `onboarding.delight.share` | BOOL | true | | §5.6 |
| `onboarding.delight.copy` | JSON object | `{}` | key → string or string[] (§7 keys; unknown keys ignored, logged once) | §7 |
| `onboarding.mascot.enabled` (existing) | BOOL | true | | the companion (§2) needs this **and** `delight.enabled` |
| `onboarding.confetti.enabled` (existing) | BOOL | true | | the payoff confetti; delight raises the count |

Hard constants (not settings): the durations of §10, the thresholds `[0.25, 0.5, 0.75]`, the combo start at
3, the highlight regexes and word lists (they are rules, versioned in code and tests), the 12-chip
stagger cap. `useDelight()` (web, `lib/onboarding/delight.ts`) is the one reader: `{ on, mascot, haptics,
combo, highlights, milestones, interstitialMs, interstitials, barRider, share, reduced, copy(), tap() }`,
provided by `ProfileSetup` through a context so every screen and the shell read the same answer.

---

## 9. New primitives in `@kiwiply/ui` (and the two extensions)

| # | Primitive | API | Notes |
|---|---|---|---|
| 9.1 | `SpeechBubble` | `{ children; tail?: "up-left" \| "up" \| "left"; reservedLines?: 1 \| 2; className }` | paper, line border, 12 px radius, 10 px tail, text crossfade 120 ms on change (`key` on the text), `aria-hidden` by the caller; `min-height` from `reservedLines` |
| 9.2 | `CardStack` | `{ ghosts: 0 \| 1 \| 2; leaving?: { node: ReactNode; dir: "keep" \| "skip" } \| null; onLeft?(); children }` | §3.1; owns the `pb-5` reservation, the ghost layers, the leaving layer and the spring class |
| 9.3 | `AnimatedNumber` | `{ value: number; mode?: "flip" \| "countUp"; duration?: number; className }` | §3.3 / §5.6; renders the final value in an `sr-only` span and the animated one `aria-hidden`; static under reduced motion |
| 9.4 | `SparkleBurst` | `{ at?: "center"; count?: 8; className }` | §3.7; WAAPI, plays once on mount like `ConfettiBurst` |
| 9.5 | `ProgressBar` **+** `shine?: boolean; cap?: ReactNode` | | §4.2 |
| 9.6 | `SwipeCard` **+** `stamp?: boolean; fling?: "keep" \| "skip" \| null; onFlingEnd?()` | | §3.1 / §3.2; defaults keep today's behaviour byte-for-byte |
| 9.7 | `ChoiceGroup` / `ChipInput` **+** the 150 ms `data-just-selected` pop | | §5.2 |

Web-only pieces (`web/src/components/app-v3/profiles/setup/delight/`): `CompanionDock.tsx`,
`Companion.tsx` (pose + reaction state machine), `poses.ts`, `Interstitial.tsx`, `MilestonePop.tsx`,
`ComboChip.tsx`, `HighlightChip.tsx`, `ShareCard.tsx`; `web/src/lib/onboarding/{delight,delight-copy,
highlights,milestones}.ts`. The mascot art stays in `web/public/v2` (Next `Image`), which is why the
companion is a web component built from `@kiwiply/ui` parts.

---

## 10. Guardrails

### 10.1 Reduced motion — every effect and its static twin

| Effect | Default | `prefers-reduced-motion: reduce` |
|---|---|---|
| Companion reactions (§2.4) | the keyframes | **static** art swap only (pose changes still show; the bubble text still swaps, no fade) |
| Bubble text change | 120 ms crossfade | instant |
| Card fly-off + spring | 240 ms + 200 ms | outgoing removed at once; incoming 120 ms crossfade |
| Drag tilt | as built | as built (no movement, stamp fades) |
| Stamp | opacity + rides the fling | opacity only, 120 ms |
| Counter / time-left digit | 180 ms flip | instant |
| Count-up | 800 ms | final number |
| Combo chip | 150 ms pop, 200 ms fade | appears / disappears |
| Milestone pop | 200 ms in, 1.2 s hold, 200 ms out | appears 1.6 s, disappears |
| Bar shine | sweep every 4 s | none |
| Bar rider | moves with the fill (300 ms) | jumps |
| Interstitial | mascot sway + drain line | static mascot, text "(auto in a moment)"; same timer, same skip |
| Button squish | 120 ms scale | none |
| Chip pop / fly-in / stagger | 150 / 180 ms | none (colour only; chips just appear) |
| Sparkles | 320 ms | none |
| Confetti | 36 pieces | none (as built) |
| Mascot dance | 900 ms | static |
| Haptics | on (coarse pointers) | **off** |

`useReducedMotion()` is the one source; every CSS keyframe sits under `@media (prefers-reduced-motion:
no-preference)`; the Playwright suite runs both projects (R1.20).

### 10.2 No layout shift
Reserved boxes everywhere a thing can appear: the bubble (48 / 18 px), the stack's `pb-5`, the combo
chip inside a wrapping row, the milestone pop and bar rider `absolute`, sparkles `absolute`, the
interstitial is its own screen, the share card is always rendered when enabled (not after a timer).
The story's Playwright check reads `PerformanceObserver` `layout-shift` entries on the review screen
across five decisions: **CLS contribution 0** (no entry with `hadRecentInput: false` above 0.01).

### 10.3 Timings
Tap feedback 120–180 ms (squish 120, pop 150, flip 180, stamp 120). Transitions 200–300 ms (fling 240,
spring 200, pop in/out 200, bar 300 as built). Loops only for breath (3 s), think (1.6 s), shine (every
4 s). The one hold is the interstitial's 1.2 s, skippable with any tap or key. Nothing disables a
button while an animation plays; the leaving card is `pointer-events-none`.

### 10.4 Performance budget
No new dependencies. CSS keyframes + the Web Animations API already used by `ConfettiBurst`. One small
`<img>` per screen for the mascot (the phone head reuses the same file). `will-change: transform` only
on the card while dragging. The highlight scan is O(bullets) per card, memoised per card id. R1.20
asserts no long task > 50 ms during a Keep (Playwright `PerformanceObserver` `longtask`, desktop
Chromium, mock API).

### 10.5 Honesty and privacy
No string ever evaluates the user's data ("great job", "weak bullet"); chips name a property that is
in the text; the tip is a tip. Analytics events carry rule ids, percentages, counts and methods — never
text, names, titles or values. The share text contains only what the card shows. Nothing from the
layer is written to the draft, the profile, or the server.

### 10.6 Admin gating
`feature.onboarding_v2.enabled` → `onboarding.delight.enabled` → the per-feature keys of §8; the
companion also needs `onboarding.mascot.enabled`. With `delight.enabled=false` the DOM of
`/profiles/setup` is byte-for-byte the v2 (R1.12) DOM — R1.20 snapshots this.

### 10.7 Widths
360 / 390 / 1440 (and 1024–1279 for the dock switch): no element overlaps the sticky footer, no toast
is covered, no horizontal scroll (`document.documentElement.scrollWidth === clientWidth` asserted at each
width on review, recap, skills, prefs, payoff).

### 10.8 A11y
Decorative motion is `aria-hidden` (dock, ghosts, leaving card, sparkles, pop, combo, rider, confetti).
The highlight chip and the tip are real text. The interstitial is a screen with an `<h1>` and a
focusable button. Milestones are announced once through the existing region. Keyboard: `← → E Z` are
additive; Tab order unchanged; shortcuts never fire inside a field. Focus never lands on anything
animated. axe at 390 and 1440 on every screen with delight on, both motion modes: 0 serious/critical.

---

## 11. Analytics (`track`, snake_case, no content)

| Event | Props | When |
|---|---|---|
| `onboarding_delight_milestone` | `pct: 25 \| 50 \| 75` | a pop shows |
| `onboarding_delight_interstitial` | `kind: review \| prefs, skipped: bool` | it leaves |
| `onboarding_delight_highlight` | `rule: number \| outcome \| lead \| built` | once per card shown |
| `onboarding_delight_combo` | `max: number` | at the recap (0 when never ≥ 3) |
| `onboarding_delight_share` | `method: share \| copy` | the button |
| `onboarding_delight_shortcut` | `key: left \| right \| e \| z` | a keyboard decision |

Names live in `web/src/lib/onboarding/events.ts` (R1.12's constants file).

---

## 12. Build order and stories (epic R1b, "R1b delight")

| Story | Ships | Size | Deps |
|---|---|---|---|
| **R1.14** Delight foundation + mascot companion: settings keys (API + DTO + web defaults), `useDelight`, copy deck, `SpeechBubble`, `CompanionDock` (column + phone head), poses + CSS motion fallback, wired on **review first** then every screen's base pose + reactions of §2.5 | the user-visible answer to "plain" | M | R1.12 |
| **R1.15** Review as a game: `CardStack`, `SwipeCard` stamp + fling, spring-up, `AnimatedNumber` counter, combo chip, haptics, `← → E Z` + legend, `SparkleBurst` on Keep | the game | M | R1.14 |
| **R1.16** Honest highlights: `highlights.ts` rules, chip, tip, tests, event | the "nice!" that's true | S | R1.14 |
| **R1.17** Progress delight: milestones + pop + announcement, bar shine + optional rider, time-left digit flip, the interstitial(s) | the bar comes alive | M | R1.15 |
| **R1.18** Micro-interactions across screens: squish, chip pops (`ChoiceGroup`/`ChipInput`), skills fly-in + pop, emoji glyphs, hello/source/paste/you/so-far/recap reactions, resume banner | the rest of the flow | M | R1.14 |
| **R1.19** Payoff celebration + share: count-up, mascot dance, 36 confetti, `ShareCard` with Web Share / copy | the ending | S | R1.17 |
| **R1.20** Delight QA pack: Playwright both motion projects at 360/390/1440, axe, CLS = 0, long tasks, overlap checks, `delight.enabled=false` DOM parity snapshot, handoff update | the proof | S | R1.15–R1.19 |

R1.16 and R1.18 can run in parallel with R1.15 (different files). Each story bumps nothing in the
extension (web + ui + one API settings story). The design doc for every story is this file; the v2 file
is the context.

---

## 13. Non-goals
Sound · daily streaks or anything persistent/loss-framed · XP, levels, badges · image export of the share
card (follow-up, #34f) · AI anywhere (the highlights are regexes) · a mascot that talks to screen readers ·
delight on the dashboard card (it is calm on purpose) · new dependencies.
