# W5.7 — Visual QA & walkthrough checklist

The one manual gate for **Phase W5** (the extension UI overhaul). Everything else in W5 is
build-verified; this is the part that needs a real Chrome (the surfaces call `chrome.*`, so they
can't render in a plain web preview). Walk every surface in **light AND dark**, confirm behavior +
visual consistency with the web app (kiwiply.com), and capture before/after screenshots for PR #22.

Tick a box when a surface passes in **both** themes. Note anything off under **Findings** at the
bottom → those become fix commits (`w5.7: fix …`), then re-check.

## 0. Load it
- [ ] `cd job-autofill && npm run build` → load `job-autofill/.output/chrome-mv3` **unpacked**
      (`chrome://extensions` → Developer mode → Load unpacked). The ID is stable (manifest `key`).
- [ ] Sign in / connect once on **kiwiply.com/connect** so the mirror has a profile + resumes
      (needed for the picker, account card, attach flow).
- [ ] Set OS appearance to light for the first pass; you'll flip to dark in §6.

## 1. Popup (`popup.html`) — light, then dark
- [ ] **Header**: logo crisp; **Manage** opens the dashboard; **gear** opens options.
- [ ] **Loading**: on first open the picker shows the **skeleton** briefly (not an empty box), then
      real content — no layout jump.
- [ ] **Resume picker**: `Select` lists resumes; **meta badges** read `N skills · N roles · file ✓`
      (or `no file` in warn colour). Switching resumes updates the badges + persists as the default.
- [ ] **Not-connected state** (sign out first): the brown **connect banner** shows; picker shows the
      empty hint ("Add a resume on kiwiply.com…").
- [ ] **Auto-advance** is a real **toggle switch**; flipping it persists (reopen to confirm).
- [ ] **Actions**: **Scan & fill this page** is the accent CTA (disabled with no resume; shows a
      spinner while scanning); **Save this job** is the ghost button.
- [ ] **Status line** announces (e.g. "Scanning page…", "Saved …") and is colour-tokened
      (accent-deep = ok, danger = error).
- [ ] **Footer**: trust line ("Reviews before filling · never submits") + **Report a bug** link
      (opens options `#bug` and focuses the message box).
- [ ] Fills the popup **edge-to-edge** on paper (no transparent corners / white gap).

## 2. Options (`options.html`) — light, then dark
- [ ] Opens in a **full tab** (not the embedded dialog).
- [ ] **Sectioned nav rail**: clicking a link scrolls to the section; the **active link highlights**
      as you scroll (scroll-spy). On a narrow window it collapses to one column (rail hidden).
- [ ] **Account** card: shows a **Connected / Not connected** badge; connected → Manage + Sign out;
      not connected → Connect button.
- [ ] **Appearance** card: segmented **Light / System / Dark** (sun / monitor / moon). Selecting one
      is reflected instantly (see §6). The selected option is visibly the active pill.
- [ ] **AI drafting**: two `Switch`es + the API-key `Input` (password); copy intact.
- [ ] **Filling**: three `Switch`es; **Save settings** → "Saved ✓" appears (and announces), settings
      persist (reopen).
- [ ] **Feedback**: `Select` type + textarea + consent `Switch`; **Send report** shows a status.
- [ ] Deep-link: from the popup's **Report a bug** → lands on this card with the textarea focused.

## 3. Side-panel review (`sidepanel.html`) — light, then dark
Open via the popup's **+ Upload a resume** on a real ATS job page.
- [ ] **Save mode** ("Parse & add to my resumes"): panel opens → parses → the review editor shows
      the shared `ResumeUpload`; **Save button reads "Save to my account"**; on save a **toast**
      appears ("Saved …") and the resume shows up in the popup picker.
- [ ] **Attach mode** ("Parse & attach to this job only"): **Save button reads "Fill page &
      attach"**; on save the toast reads "Filling this page… / Attaching your PDF…"; the job page
      gets filled (see §4) + the PDF is attached to the application.
- [ ] **State screens** (they **fade in**): loading (spinner), empty (opened with no handoff),
      error, done ("All set" / "Closed"). **Esc** dismisses the review.

## 4. On-page overlay (injected `filler.js`) — real ATS
- [ ] After **Scan & fill**, the right-side review overlay appears; values look right; the checkboxes
      work; **it never clicks Submit**.
- [ ] The overlay **stays LIGHT even when the extension theme is Dark** (it lives on the ATS page —
      this is intended). Confirm it's readable and on-brand (kiwi accent border, charcoal text).

## 5. W0 parity re-confirm (didn't regress under the redesign)
- [ ] Autofill on ≥1 real ATS (Workday/Greenhouse/Lever/Ashby/etc.).
- [ ] **Save this job** creates a tracked application.
- [ ] **/connect** handoff still works (extension picks up the session).
- [ ] Bug report submits.

## 6. Dark mode specifics
- [ ] In options → Appearance → **Dark**: options flips immediately; **open the popup → it's dark
      too** (cross-surface sync); open the side panel → dark.
- [ ] **System**: matches the OS; change the OS light/dark setting → surfaces follow **without
      reopening** (matchMedia listener).
- [ ] **Light**: forces light even if the OS is dark.
- [ ] No **flash** of the wrong theme on open (esp. on System).
- [ ] Dark contrast is comfortable: body text, muted labels, badges, the accent CTA (charcoal text
      on lime), danger text, borders. Nothing invisible or low-contrast.

## 7. Accessibility
- [ ] **Keyboard only**: Tab through each surface — every control is reachable and shows a visible
      **focus ring**; the options nav, switches, radiogroup, and buttons all operate via keyboard
      (Space/Enter; arrows where applicable).
- [ ] **Screen reader** (optional but ideal): status changes announce (popup status, "Saved ✓", bug
      status are `aria-live`); the theme control reads as a radio group.
- [ ] **Reduced motion**: enable the OS "reduce motion" setting → fade-ins / skeleton pulse stop
      (no essential info lost).

## 8. Visual QA vs the web app + screenshots for the PR
- [ ] Side-by-side with kiwiply.com: same tokens/typography/spacing language — the extension reads as
      the same product.
- [ ] Capture **before/after** (or just after) screenshots, **light + dark**, of: popup · options ·
      side-panel review · on-page overlay. Attach to PR #22.

---

## Findings
_(log issues here as you go; each becomes a `w5.7: fix …` commit, then re-check the box)_

- **FIXED** — On first load every React surface crashed with `Cannot read properties of null
  (reading 'useId')` (React **invalid hook call**), then briefly `Minified React error #527`
  (react/react-dom version mismatch) mid-fix. Root cause: the workspace had **two physical React
  copies** — the extension resolved `job-autofill/node_modules/react` while `@kiwiply/ui` (at
  `packages/ui`) resolved the root copy → two dispatchers. **Fix = Vite `resolve.dedupe`**
  (`react`, `react-dom`, `jsx-runtime`) in `wxt.config.ts` so the bundle collapses app + package onto
  one React. `job-autofill` react/react-dom stay pinned to **exactly `19.2.4`** (matching `web`) so
  the deduped copy is a matched pair — verified: the built chunks contain only `19.2.4`, no `19.2.7`.
  (A detour that relaxed the pins to `^19` created a temporary `react 19.2.7` / `react-dom 19.2.4`
  skew → #527; reverted.) Reload `.output/chrome-mv3` and the surfaces render.
