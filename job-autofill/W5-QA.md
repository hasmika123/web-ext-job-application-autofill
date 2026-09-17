# W5.7 — Visual QA & walkthrough checklist

The one manual gate for **Phase W5** (the extension UI overhaul), and the last thing to walk
before a Chrome Web Store submission. Everything else in W5 is build-verified; this needs a real
Chrome, because every surface calls `chrome.*` and can't render in a plain web preview.

Walk every surface in **light AND dark**, confirm behaviour + visual consistency with the web app
(kiwiply.com), and capture screenshots as you go — the good ones double as the store listing's
screenshots (see `STORE-LISTING.md` for sizes and the shot list).

Tick a box when a surface passes in **both** themes. Note anything off under **Findings** at the
bottom → those become fix commits (`w5.7: fix …`), then re-check.

> **Surfaces, as actually shipped.** There is **no popup** and **no native side panel** — both were
> removed in v0.30.0/0.31.0. Clicking the toolbar icon injects `panel.html` into the current tab as
> a floating right-edge **drawer** (an iframe over the page, which is never resized). The surfaces
> are: **the drawer's home view**, **the drawer's review view** (the shared `ResumeUpload` form),
> **the options tab**, and **the on-page fill overlay** (shadow DOM, drawn by `filler.js`).

## 0. Load it
- [ ] `cd job-autofill && npm run build` → load `job-autofill/.output/chrome-mv3` **unpacked**
      (`chrome://extensions` → Developer mode → Load unpacked). The ID is stable (manifest `key`).
- [ ] Sign in / connect once on **kiwiply.com/connect** so the mirror has a profile + resumes
      (needed for the picker, the account chip, and the attach flow).
- [ ] Have a real ATS application form open in another tab — Greenhouse or Lever is the easiest
      (`job-boards.greenhouse.io/…/jobs/…`). Several checks below need a genuine form.
- [ ] Set the extension theme to **Light** for the first pass (options → Appearance); you'll flip
      to Dark in §5.

## 1. The drawer — home view (toolbar icon), light then dark
- [ ] **Opens as a floating drawer**: right-edge, accent left border, rounded left corners, drop
      shadow — and the **page underneath does NOT reflow or resize**. Clicking the icon again
      closes it.
- [ ] **Header row**: logo (24px, crisp) · **account chip** (lime avatar with your initial +
      truncated username) · **gear** · **✕**. The chip opens **kiwiply.com/dashboard**; the gear
      opens the options tab; ✕ closes the drawer.
- [ ] **Loading**: the picker shows a **skeleton** briefly (`aria-busy`) while the mirror pulls,
      then real content — no layout jump, no empty box.
- [ ] **Resume picker**: labelled "Choose a resume"; the `Select` spans the full width and lists
      your resumes with meta badges (`N skills · N roles · file ✓`, or `no file` in the warn
      colour). Switching resumes persists as the default (close and reopen to confirm).
- [ ] **No resumes**: the picker shows "No resumes yet" + the hint "Add one on kiwiply.com, or
      upload below."
- [ ] **Signed-out state** (sign out in options first): the brown **connect prompt** appears —
      "Sign in on kiwiply.com to connect the extension and sync your resumes →" with a link icon
      (no emoji). It disappears the moment you connect, without reopening the drawer.
- [ ] **Upload entry**: the **+ Upload** ghost pill with an upload icon. Picking a file shows
      the `Use "<filename>"…` strip with **both** choices — "Save to my account" and the
      attach action.
- [ ] **Primary actions**: **Scan & fill this page** is the accent CTA (disabled with no resume
      selected; shows a spinner while scanning); **Save this job for later** is the ghost button.
- [ ] **Not-a-job-page warning**: open the drawer on an ordinary page (not an ATS form) and hit
      Scan & fill → the brown "This doesn't look like a job application page. Fill it anyway?"
      block appears with **Fill anyway** / **Cancel**. Cancel dismisses it and fills nothing.
- [ ] **Auto-advance** is a real toggle switch above the divider; flipping it persists (reopen to
      confirm) and matches the same setting in options.
- [ ] **Status line** announces (`role=status`, `aria-live`) and is colour-tokened: accent-deep for
      ok, danger for errors, muted otherwise.
- [ ] **Trust footer**: "Reviews before filling · never submits" with a check icon, plus
      **Report a bug** → opens the options tab at `#bug` **with the message box focused**.
- [ ] **Toasts** render inside the drawer (top), are readable in both themes, and dismiss.
- [ ] The drawer paints its canvas edge-to-edge — no white gap, no transparent corners, no flash
      of unstyled background when it opens.

## 2. The drawer — review view (shared `ResumeUpload`), light then dark
Reach it from home via **+ Upload** → pick a PDF/DOCX.
- [ ] The drawer **stays open** and swaps home → review in place (no new tab, no second window).
- [ ] The header shows a left **"‹ Back"** (not a corner ✕) and returns to home without losing the
      picker's selection.
- [ ] Parsing runs on mount with a **`Spinner`**, then the parsed fields render; a parse failure
      shows the `EmptyState` error, not a blank panel.
- [ ] **Save mode** (from home, no ATS context): the primary button reads **"Save to my account"**
      and the success toast reads "Resume added".
- [ ] **Attach mode** (from an ATS page): the primary button reads **"Fill page & attach"** and the
      toast reads "Filling this page…". The page then actually fills and the PDF is attached.
- [ ] Typography matches the web app — headings in **Fraunces**, body in **Inter** (both bundled;
      no system-serif fallback).
- [ ] Cancelling returns to home and saves nothing.

## 3. The on-page fill overlay (`filler.js`), light only
The overlay lives on the ATS page, so it is **intentionally light in both themes** — confirm that,
don't file it as a bug. Trigger it with **Scan & fill this page** on a real form.
- [ ] Appears as a 400px right-edge panel matching the drawer's geometry (accent left border,
      rounded left corners, same shadow), over the page without resizing it.
- [ ] Header: 24px logo + "…detected · N fields ready" sub-line + the shared SVG **✕**.
- [ ] A **lime salary pill** shows under the sub-line when the posting states a salary (and is
      absent when it doesn't) — don't force it.
- [ ] Grouped field list with uppercase group titles; every row is reviewable and **uncheckable
      before filling**. EEO / self-identification values appear here too, and unchecking one keeps
      it out of the fill.
- [ ] Buttons are pills: **Fill selected** (accent/lime) · **Cancel** (ghost) · **↻ regen** (small).
- [ ] **Fill selected** fills the form and the drawer closes so the overlay isn't obscured.
- [ ] **Nothing is ever submitted** — confirm no Submit/Apply button is clicked, with auto-advance
      both off and on (on = Next/Continue only).
- [ ] The overlay survives a page that uses shadow DOM (SmartRecruiters is the known hard case).

## 4. Options tab, light then dark
- [ ] Opens in a **full tab** (not a dialog, not a popup).
- [ ] **Nav rail** (hidden below `md`): clicking a link scrolls to its section and the active link
      highlights as you scroll (scroll-spy, `aria-current`). Narrow the window → one column.
- [ ] **Account** card: **Connected / Not connected** badge; connected → "Manage profile &
      resumes →" + Sign out; not connected → "Connect to kiwiply.com".
- [ ] **Appearance** card: segmented **Light / System / Dark** (sun / monitor / moon) as a
      `radiogroup`; selecting one applies instantly and to the open drawer too (see §5).
- [ ] **AI answer drafting** card, three blocks: *Bring your own key* (switch + password `Input`),
      *Kiwiply AI · no key needed* (switch + the Gemini **consent** switch), *Job-detail
      enrichment* (switch). All three default **OFF** on a fresh profile — verify on a clean
      install, this is a privacy claim in `PRIVACY.md`.
- [ ] The consent copy names **Google Gemini** and is legible, not clipped, in both themes.
- [ ] **Filling** card: auto-advance · auto-add rows (Workday) · **Share anonymous usage
      analytics**. **Save settings** → "Saved ✓" appears, is announced, and persists across reopen.
- [ ] **Report a bug or idea** card: type `Select` + message textarea + the include-version switch;
      **Send report** shows a status. Arriving via the drawer's footer link lands here **focused**.

## 5. Dark mode + the theme switch
- [ ] Options → Appearance → **Dark**: the options tab repaints immediately, and an **already-open
      drawer** follows without being reopened.
- [ ] **System** follows the OS setting (flip the OS theme and watch both surfaces).
- [ ] The **logo swaps to its dark variant on the `.dark` class**, not on the OS setting — with the
      extension on **Light** and the OS on **Dark**, the light logo must stay (this was a real bug).
- [ ] No unreadable text anywhere: check the muted greys, the badges, the brown connect prompt, the
      danger status colour, and the disabled button states.
- [ ] The on-page overlay stays **light** (see §3) — expected, not a finding.

## 6. Accessibility + interaction polish
- [ ] **Keyboard only**: Tab through the drawer and the options tab — every control is reachable,
      the focus ring is clearly visible on both canvases, and nothing traps focus.
- [ ] The drawer's status line and the options "Saved ✓" are announced by a screen reader
      (both are live regions).
- [ ] `prefers-reduced-motion` is honoured: enable it in Chrome DevTools → Rendering, then reopen
      the drawer — fade/slide animations and the skeleton shimmer must stop.
- [ ] Controls have accessible names (the Select, the icon buttons, the theme radiogroup) — spot
      check with DevTools' accessibility pane.

## 7. Resilience
- [ ] **Reload the extension while the drawer is open** (`chrome://extensions` → reload): the
      orphaned drawer **auto-closes** instead of throwing "Extension context invalidated", and
      reopening from the toolbar works on the fresh context.
- [ ] Open the drawer on a **restricted page** (`chrome://extensions`, the Web Store, a PDF): it
      simply doesn't open — no error toast, no console exception.
- [ ] Sign out on the web while the drawer is open → the drawer returns to the connect prompt
      rather than showing a stale account chip.

---

## Findings
> One line each: surface · theme · what's wrong · (fix commit once done).

- _(none yet)_
