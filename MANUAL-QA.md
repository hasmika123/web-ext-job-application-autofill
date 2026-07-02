# Manual QA — validation checklist

> Running checklist of things to **manually verify in a real browser** for changes that can't be
> fully proven by the automated tests (extension drawer on live ATS pages, web resume review, etc.).
> Each batch of fixes appends a new dated section. Work top-to-bottom; check the boxes as you go.
>
> Automated coverage already run for every batch below: extension `npm test`, extension `tsc` +
> `wxt build`, web `tsc` + `eslint`. This doc is only the **human-eyes** part.

## One-time setup (per test session)

- [ ] Build the extension: `cd job-autofill && npm run build` (deps hoist to the repo root — if
      `npm` misbehaves, run `node ../node_modules/wxt/bin/wxt.mjs build`).
- [ ] Load **unpacked** `job-autofill/.output/chrome-mv3` in `chrome://extensions` (Developer mode).
      Reload it after every rebuild.
- [ ] Confirm the extension is **connected** to a kiwiply account (open the drawer → the account
      chip shows your name; if not, use "Sign in on kiwiply.com" → `/connect`).
- [ ] Have these tabs handy:
  - A **real job posting / application** page on a supported ATS (Workday, Greenhouse, Lever, Ashby,
    Workable, Indeed) **or** a job board (LinkedIn/Indeed/Dice).
  - A **non-job** page (e.g. a news article or `example.com`) to test the soft warning.
  - A sample **resume file** (PDF and/or DOCX).
- [ ] For the web checks: sign in at kiwiply.com and open **Resumes** and **Board**.

---

## Batch 1 — Cross-site QA fixes (2026-07-01) · extension v0.38.0

### 1. Resume PDF is stored *and* usable after an on-the-fly add
- [ ] In the drawer, click **Upload** → pick a resume → **Parse & add to my resumes**.
- [ ] Review opens; click **Save to my account**. A success toast **"Resume added"** appears.
- [ ] Back on home, open the resume picker and select the resume you just added → it shows the
      **"PDF"** badge (not "no file").
- [ ] Click **Scan & fill this page** on a job form → the résumé file **attaches** (the fill overlay
      says "résumé attached").
- [ ] Confirm on kiwiply.com → **Resumes**: the new resume is listed and its file downloads.
- [ ] (Failure path, optional) If an upload ever fails, the toast reads **"Resume added — with a
      warning"** and tells you to re-upload from kiwiply.com (the resume still appears).

### 2. Collapsible review sections
**Extension (minimized by default):**
- [ ] Upload a resume in the drawer and open the review. Every section (Detected contact — web only,
      Summary, Skills, Experience, Projects, Education) is **collapsed** on open.
- [ ] Click a section header → it **expands**; click again → it **collapses** (chevron rotates).
- [ ] **Expand all** opens every section; **Collapse all** closes every section.
- [ ] The **Resume name + Save** row is always visible (never hidden by collapsing).

**Web (expanded by default):**
- [ ] kiwiply.com → **Resumes** → upload/edit a resume. Sections are **expanded** on open.
- [ ] The chevrons still collapse/expand individual sections, and **Expand/Collapse all** still work.
- [ ] Same expanded default in the Board's **Add application → review** flow.

### 3. Soft warning on non-job pages (warn, never block)
- [ ] On the **non-job** tab, open the drawer → **Save this job for later**. The save modal opens
      with a banner: *"This doesn't look like a job posting — you can still save it."* Saving still works.
- [ ] On the **non-job** tab → select a resume → **Scan & fill this page**. An inline warning appears:
      *"This doesn't look like a job application page. Fill it anyway?"* with **Fill anyway** / **Cancel**.
  - [ ] **Cancel** dismisses it and does nothing.
  - [ ] **Fill anyway** proceeds to the normal fill overlay.
- [ ] On a **real job** page, neither the save modal warning nor the fill warning appears (it goes
      straight through).

### 4. Save-a-job confirmation modal
- [ ] On a real job page → **Save this job for later** opens a modal titled **"Save this job"** with
      editable **Company, Role, Location, Salary, Job URL**, pre-filled from the page.
- [ ] Edit a field (e.g. change the Role), click **Save to board**.
- [ ] A success toast **"Saved to your board"** appears (showing the company/role).
- [ ] On kiwiply.com → **Board**: a **SAVED** entry exists with your **edited** values.
- [ ] **Cancel** closes the modal without saving.
- [ ] If not signed in, saving shows the "connect on kiwiply.com" error inside the modal.

### 5. Consistent success/feedback toasts
- [ ] Resume added → toast (see #1).
- [ ] Job saved to board → toast (see #4).
- [ ] A fill that can't run (e.g. the panel can't open) surfaces an **error toast**, not just silent
      inline text.
- [ ] In-progress hints ("Scanning page…", "Reading this job…") still show inline while working.
- [ ] The on-page fill overlay still flashes **"Filled N fields… Review before submitting"** after a
      successful fill (unchanged).

---

## Batch 2 — Board redesign, resumes UX, app-shell nav, bug button (2026-07-01) · extension v0.39.0

Web-only except the extension button rename. Sign in at kiwiply.com and open **Board**, **Resumes**,
and a marketing page (`/`). Reload the unpacked extension for the button rename.

### Application board — layout
- [ ] On **/board**, **Draft** and **Saved** appear as full-width **rows** at the top; **Applied,
      Interview, Offer, Rejected** sit below in a grid that fits the page width — **no page-level
      horizontal scroll** for the columns.
- [ ] Click a Draft/Saved row header → it **collapses/expands** (chevron rotates). A long row scrolls
      **horizontally within itself**, not the whole page.
- [ ] Drag a card into a Draft/Saved row or a grid column → its status updates (drag-drop still works).

### Application board — card + preview
- [ ] Click **anywhere** on a card (not just the company name) → the side preview opens.
- [ ] Inner controls still work without opening the preview: the **×** delete, the status **dropdown**,
      and the **"Did you submit?"** Yes/Not-yet buttons.
- [ ] In the side preview, **Resume sent/attached** and **Job description** are **collapsed** by
      default; click each header to expand.
- [ ] Click **Edit details** → company, role, location, job URL, and job description become inputs.
      Change one → **Save details** → the card + preview reflect the change (persists after refresh).
      **Cancel** discards.

### Application board — duplicate warning
- [ ] **+ Add application** with a company + role that already exist on your board → **"You already
      have an application for this company and role. Add it anyway?"**; the button reads **Add anyway**
      and a second click still adds it. Editing the company/role clears the warning.

### Resumes page
- [ ] The **Archived** section is a **collapsible dropdown** (chevron), collapsed by default; click to
      reveal archived resumes.
- [ ] Click **anywhere** on an active resume card → its **edit** review opens (not only the pencil).
      The checkbox, Archive, Delete, and Edit controls still work without opening edit.
- [ ] Upload/save a resume whose **name already exists** → **"You already have a resume named X. Save
      anyway…"**; the button reads **Save anyway**; renaming clears the warning; a second Save proceeds.
      (Verify the same warning in the **extension** drawer's "Save to my resumes" review.)

### App shell + landing
- [ ] While signed in, click the **Kiwiply logo** in the left sidebar → lands on the **landing page**
      (`/`), and the top-right shows a **Dashboard** button + an **avatar** (→ Settings) instead of
      Sign in / Get started.
- [ ] While signed **out**, the landing page still shows **Sign in / Get started**.
- [ ] Click the **profile card** at the bottom of the left sidebar → opens **Settings**. **Sign out**
      (just below it) still works independently.

### Bug button
- [ ] **Drag** the floating bug button → it **snaps to the nearest corner** (any of the four).
- [ ] A plain **click** (no drag) still opens the report dialog.
- [ ] Reload the page → the button stays in the corner you left it (persisted).

### Extension
- [ ] In the drawer, upload a resume → the two buttons read **"Save to my resumes"** and **"Use once
      for this job"**.

---

## Batch 3 — Accurate job-page detection + pre-select saved resume (2026-07-01) · extension v0.40.0

Extension-only. Reload the unpacked extension first.

### Job-page detection (Scan & fill)
- [ ] On a **real Workday application** page, click **Scan & fill this page** → it goes straight to
      the fill overlay with **no** "This doesn't look like a job application page" warning.
- [ ] Same on other ATS (Greenhouse, Lever, Ashby, Workable, Indeed) and on ATS forms embedded in a
      company careers site (**iframed**) — no false warning.
- [ ] On a plain non-job page (e.g. a news article), Scan & fill **still** warns, and **Fill anyway**
      still proceeds.
- [ ] **Save this job** on a real ATS/posting no longer shows the "doesn't look like a job posting"
      banner in the save modal.

### Pre-select the saved resume
- [ ] Upload a resume → **Save to my resumes** → after the review, back on the drawer home the
      **just-saved resume is already selected** in the picker, and **Scan & fill this page** uses it
      without you having to choose it.
- [ ] The picker dropdown is responsive and lists the new resume (watch for any freeze — report if it
      recurs).

---

## Batch 4 — Avatar shows username, not "your account" (2026-07-01) · extension v0.41.0

Extension-only. Reload the unpacked extension first.

- [ ] Connect the extension (sign in on kiwiply.com → /connect). The drawer header shows **your
      username** next to the avatar.
- [ ] Keep using it past a session refresh — leave the drawer connected for ~15+ minutes (or trigger
      enough activity to force an access-token refresh), then reopen the drawer. The name **still
      shows your username**, not "your account".
- [ ] (If you can) confirm the same after the browser has been idle and the session silently refreshed
      — the username persists.

---

## Batch 5 — Job type / mode / email on applications (2026-07-01) · extension v0.42.0

Backend migration (`application.job_type`, `job_mode`, `email`) + web board + extension capture.
Deploy the API (runs the migration) before validating the web bits.

### 1. Manual add shows the new fields
- [ ] Web → **Board** → **+ Add application**. The dialog has **Job type** and **Job mode** dropdowns
      (Full-time/Part-time/Contract/Internship/Temporary/Other · In-person/Hybrid/Remote/Other) and an
      **Email** field (placeholder "Defaults to your profile email").
- [ ] Add one leaving Email blank → open the card's detail panel → **Email** shows your **profile
      (bio) email** (set one on the Profile page first). Add another with an explicit email → that one
      is kept, not overwritten.

### 2. Edit + display
- [ ] Open a card → **Edit details** → set Job type / Job mode / Email → **Save details**. The detail
      panel shows Job type, Job mode, Email.

### 3. Extension auto-capture
- [ ] On a job posting that publishes schema.org `JobPosting` with `employmentType` (many Greenhouse/
      Lever/LinkedIn posts do), fill or **Save this job** → the board entry shows a **Job type** (and
      **Remote** mode if the post is `TELECOMMUTE`). Missing/odd values simply stay blank.

---

## Batch 6 — Board declutter, favorites, bulk actions, archive, resume download + default resume (2026-07-01) · extension v0.43.0

Backend migration (`application.starred/archived`, `resume.starred/is_default`) + web board & resumes
+ extension default-resume preselect. Deploy the API before validating.

### 1. Decluttered cards
- [ ] Web → **Board**. Each card shows only **role**, **company**, and a **date** line
      (`Applied · <date>` for applied entries, otherwise `Added · <date>`). ATS/location/mode/type/resume
      details no longer clutter the card face — they live in the side detail panel (click a card).

### 2. Fixed heights + internal scroll
- [ ] The four funnel columns (Applied/Interview/Offer/Rejected) are all the **same height**; a column
      with many cards **scrolls internally** rather than stretching the page.

### 3. Star / favorite
- [ ] Click the **☆** on a card → it fills **★** and the card sorts to the **top** of its column.
- [ ] Toggle the **★ Starred** chip in the toolbar → only starred entries show.
- [ ] Reload the page → the starred state persists (saved server-side).

### 4. Per-card ⋯ menu
- [ ] Click **⋯** on a card → menu opens (not clipped, even for the bottom card of a scrolled column):
      **Star/Unstar**, **Move to** (each stage), **Archive**, **Delete**. Each works.

### 5. Multi-select bulk actions
- [ ] Tick the checkboxes on 2–3 cards → a selection toolbar appears (**N selected**).
- [ ] **Move to…** a stage → all move at once. **Star** / **Unstar** → all toggle. **Archive** →
      all move to the Archived row. **Delete** → confirm → all removed. **Clear** deselects.

### 6. Archived section
- [ ] Archive an entry (⋯ → Archive, bulk Archive, or the detail panel **Archive** button). It leaves
      its column and appears in a collapsible **Archived** row **below** the four funnel columns, with
      **greyed-out** cards.
- [ ] Expand Archived → open a card → **Unarchive** (detail panel or ⋯) returns it to its stage.

### 7. Resume download (side panel)
- [ ] Open a card that has a resume sent (or a one-off attachment) → click **Download resume sent /
      attached** → the file **downloads** (it no longer expands an inline preview).

### 8. Default / base resume
- [ ] Web → **Resumes**. Upload your **first** resume → it shows a **Default** badge automatically.
- [ ] Upload a second → it has a **Set as default** link. Click it → the **Default** badge moves to it
      and the old default loses the badge (only one default at a time). A success toast confirms.
- [ ] Star a resume (**★** icon on the row) → persists after reload.
- [ ] On the **Board** → **+ Add application**, the resume picker **preselects your default** (shown as
      "… · default").
- [ ] In the **extension** drawer (reload the unpacked build first): with no last-used resume, the
      picker **preselects your default resume**.

---

## Batch 7 — Salary on applications + "Set as default" in the upload form (2026-07-01) · extension v0.44.0

Backend migration (`application.salary`) + web board + shared upload form. Deploy the API first.

### 1. Salary shows in the side panel
- [ ] Web → **Board** → open a card whose posting had a pay range (or add one manually, below) →
      the detail panel shows a **Salary** row.

### 2. Salary is editable (add + edit)
- [ ] **+ Add application**: the dialog has a **Salary** field (next to Email). Add one with e.g.
      `$120k – $150k/yr` → it appears in the new card's detail panel.
- [ ] Open a card → **Edit details** → the edit form has a **Salary** field → change it → **Save
      details** → the detail panel reflects the new value.

### 3. Salary auto-capture (extension)
- [ ] On a job posting that publishes a schema.org `baseSalary` (many Greenhouse/Lever posts) or shows
      a clear pay range, **Save this job** or fill it → the board entry's detail panel shows the
      captured **Salary**. (Reload the unpacked v0.44.0 build first.)

### 4. "Set as my default resume" checkbox on upload
- [ ] Web → **Resumes** → drop a resume → in the review, under **Resume name**, tick **"Set as my
      default resume"** → **Save**. The saved resume shows the **Default** badge (and any previous
      default loses it).
- [ ] Leaving the box unticked saves normally (no default change) — except the very first resume,
      which still auto-defaults.
- [ ] Board → **+ Add application** → **+ Upload a new resume** → the same checkbox appears in that
      embedded review too.
- [ ] (Extension) The on-the-fly upload in the drawer does **not** show the checkbox (default
      management stays on the web) — confirm it's absent and the upload still works.
