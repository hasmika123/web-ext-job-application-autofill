# Resume templates — design (ten templates, build-ready)

Branch `resume-templates` · written 2026-10-17 · design only (no code on this branch yet).
Companion files: `stories.md` (build sequence), `sample-resume.json` (the shared fixture),
`decisions-for-user.md` (fifteen decisions — all **decided** per the user's "don't wait for my
decision"; the engineer builds without asking).

The parent contract is `docs/RESUME-BUILDER-DESIGN.md` §6 (capabilities), §7 (registry, parse-check
gate, thumbnails), §10.3.2 (Pick Template panel) and §10.17 (My Resumes / gallery). This document
only adds to it; where it changes a rule it says so in §3 and the change is one story.

---

## 0. The ten at a glance

| # | id | Name | Category | Profile | ATS rating (honest) | Default font · spacing | Pages |
|---|---|---|---|---|---|---|---|
| 1 | `modern` | Modern | ATS | `ATS_STRICT` | ATS-safe (strict) | inter · normal | ≤ 2 |
| 2 | `classic` | Classic | ATS | `ATS_STRICT` | ATS-safe (strict) | source-serif · normal | ≤ 2 |
| 3 | `compact` | Compact | ATS | `ATS_STRICT` | ATS-safe (strict) | inter · compact | ≤ 2 |
| 4 | `simple` | Simple | ATS | `ATS_STRICT` | ATS-safe (strict) | georgia-arial · normal | ≤ 2 |
| 5 | `engineer` | Engineer | Employer format | `ATS_STRICT` | ATS-safe (strict) | plex · compact | ≤ 2 |
| 6 | `consultant` | Consulting & Finance | Employer format | `ATS_STRICT` tightened (`maxPages: 1`, `pageLength: false`) | ATS-safe (strict) | garamond · compact | 1 |
| 7 | `scholar` | Academic | Employer format | `ATS_STRICT` | ATS-safe (strict) | source-serif · normal | ≤ 2 |
| 8 | `executive` | Executive | Employer format | `ATS_STRICT` | ATS-safe (strict) | georgia-arial · spacious | ≤ 2 |
| 9 | `statement` | Statement | Styled | `HYBRID` (new) | Mostly ATS-safe | inter · normal | ≤ 2 |
| 10 | `sidebar` | Sidebar | Styled | `DESIGN_FREE` tightened (`graphics: false`) | Design first — less ATS-safe | inter · normal | ≤ 2 |

Registry order = gallery order = the table order. Eight of ten are single-column, real-text,
standard-heading documents and carry the "ATS Friendly" chip; the two styled ones are labelled
honestly and never carry it. No template uses icons, tables, text-in-SVG, images for text, or
contact details in page headers/footers.

What is new to the platform (each its own story in `stories.md`): two self-hosted OFL fonts
(IBM Plex Sans, EB Garamond); one middle capability profile (`HYBRID`); `ATS_STRICT.theme.fontPairs`
widened to every bundled font; three small shared-renderer options (two-line item heads, skills as a
tag list, contact line separators / stacked); `meta.category` + `meta.atsNote`; a shared sample resume;
a thumbnail generator; gallery category chips; and the API id list brought in step with the web.

---

## 1. Research: what the market ships, what parsers want, what employers expect

### 1.1 Builders (benchmark)

| Builder | What they ship | Source |
|---|---|---|
| Rezi | 18 named templates in four tabs (Simple, Modern, Compact, Creative); "Every Rezi format is engineered for ATS compatibility"; includes a Harvard and a "Jake's Resume" clone; only Jake's is described as single-column high-density | https://www.rezi.ai/resume-templates |
| Kickresume | "40+" templates; categories ATS-friendly (5), Professional, Simple, Creative, Free; "All of our resume templates are optimized for ATS softwares" (vendor claim, no method) | https://www.kickresume.com/en/resume-templates/ |
| Novoresume | 16 template ids (Functional, Modern, Simple, Creative, Basic, Professional, College, Executive, Tech, …); one-page by default; "all our resume templates are entirely ATS-friendly" (vendor claim) | https://novoresume.com/resume-templates |
| Resume.io | ~38 cards; categories Simple / Professional / Modern / Creative / ATS; two-column sold as "fit more onto one page"; Word templates are "clean, single-column" | https://resume.io/resume-templates |
| Enhancv | 23 in the main grid plus a long catalogue; explicit Single column vs Double column categories; claims "a 99% parse rate" against "major ATS vendors" (unverified) | https://enhancv.com/resume-templates/ |
| FlowCV | "100+" free templates; Simple / Modern / Creative / Photo / Compact / First Job; FAQ: a one-column template is "the safest option for older systems" | https://flowcv.com/resume-templates |
| Zety | "18+" to "20+" depending on page; at least one two-column (Enfold); markets all as ATS-friendly | https://zety.com/lp/resume-templates · https://zety.com/blog/two-column-resume |
| Teal | Template pages block fetches (403); 2026 reviews describe clean single-column templates plus some two-column ones that are "hit-or-miss with ATS"; a free tier of roughly ten templates | https://www.rezi.ai/posts/teal-review · https://atsverification.com/blog/ai-resume-builders-tested-2026/ |

Pattern: everyone claims "ATS-friendly" for the whole catalogue, including two-column and photo
layouts; nobody labels per template which parts are risky; counts are inflated by colour variants.

### 1.2 Parser and recruiter guidance

- Jobscan: avoid "multi-column layouts, tables, and text boxes"; keep name/email/phone out of
  headers and footers; "web-safe fonts like Arial, Calibri, Garamond, Georgia, or Times New Roman";
  body 10–12 pt, headings 14–16 pt; standard bullets; conventional section titles ("Custom headings
  are nonsensical to the ATS"); text-based PDF or .docx; one-inch margins, 0.5 in minimum.
  https://jobscan.co/blog/20-ats-friendly-resume-templates/
- Greenhouse (support): failed parses come from "graphics or word art, columned layouts, tables, and
  contact details in headers, footers, or text boxes"; resumes over 2.5 MB are not parsed; image
  uploads are not parsed. https://support.greenhouse.io/hc/en-us/articles/200989175-Unsuccessful-resume-parse
- Lever (help): parses Word, PDF, RTF, HTML, ODF; "If you cannot highlight text, the document is
  likely not parseable"; the parser fills name, organisation and contact fields.
  https://help.lever.co/hc/en-us/articles/20087345054749
- Workday: no official formatting page; practitioner guides consistently report left-to-right
  parsing that shuffles multi-column layouts and weak header/footer handling.
  https://atsverification.com/ats/workday/ · https://softwaretestpilot.com/blog/career-interview-prep/how-workday-greenhouse-lever-ats-parse-resumes

Conclusion the ten follow: one column, DOM order = reading order, real text, standard headings, no
icons or images, contact in the body, dates in one consistent format, bullets as `<ul>`/`<li>`,
embedded fonts (any OFL font is fine — the text layer is what parsers read, not the glyphs).

### 1.3 Employer formats

- **Big Tech / product engineering — "Jake's Resume."** `\documentclass[letterpaper,11pt]`, ~0.5 in
  margins, centred `\Huge\scshape` name, contact line with `|` separators and underlined links,
  `\scshape\large` section titles with a full-width rule, two-line entries (bold left + right text,
  then italic small left + right), Education → Experience → Projects → Technical Skills, projects as
  "Title | tech stack" with dates right, skills as "Label: a, b, c" lines.
  https://github.com/jakegut/resume (archived, MIT; `resume.tex`).
- **Impact bullets — the X-Y-Z formula.** "Accomplished [X] as measured by [Y] by doing [Z]": start
  with an active verb, measure numerically, give a baseline, say how. Laszlo Bock, "My Personal
  Formula for a Winning Resume", LinkedIn, 29 Sep 2014 (copy hosted at
  https://www.calstatela.edu/sites/default/files/formula_for_a_winning_resume.docx; coverage
  https://www.inc.com/bill-murphy-jr/google-recruiters-say-these-5-resume-tips-including-x-y-z-formula-will-improve-your-odds-of-getting-hired-at-google.html).
  Our sample resume's bullets are written in it, and the Engineer template's description points to it.
- **Harvard College (Mignone Center) resume.** Current sample (2026): centred name; centred contact
  line with `•` separators; centred bold section headings with no rule; Education first; each entry
  has the organisation in bold with the location right-aligned, then the title in bold with the dates
  right-aligned; action-verb bullets, no pronouns, quantify. Guide:
  https://careerservices.fas.harvard.edu/resources/create-a-strong-resume/ · sample PDF:
  https://cdn-careerservices.fas.harvard.edu/wp-content/uploads/sites/161/2026/07/resume-sample.pdf
  (layout read from the PDF text layer). Harvard's 2016 HSPH guide names Times New Roman, Arial,
  Helvetica, Verdana, Calibri at 10–12 pt, 11 recommended:
  https://content.sph.harvard.edu/wwwhsph/sites/36/2016/06/Resume-Guide-June-2016.pdf
- **Consulting / banking / MBA.** One page, single column, Calibri / Garamond / Times at 10–11 pt,
  "no colors, graphics, logos, or creative layouts", Education / Experience / Additional sections,
  Education first for students and recent graduates, deal values and measurable results first.
  https://mbbprep.com/community/what-font-format-and-layout-does-mbb-expect-for-a-consulting-resume-264 ·
  https://www.hackingthecaseinterview.com/pages/mba-consulting-resume ·
  https://fe.training/free-resources/templates/free-investment-banking-resume-template ·
  https://careers.rhsmith.umd.edu/resources/mba-resume-guidelines-and-template-for-working-professionals/
- **Executive.** Two pages for 10+ years; page one = summary, core competencies (10–15), most recent
  impact; quantified results; focus on the last 10–15 years.
  https://www.resumeble.com/career-advice/two-page-resume · https://resumegeni.com/blog/two-page-resume-guide
- **Federal (USAJOBS) — researched and dropped.** Every role needs hours per week, supervisor name
  and phone, series/grade, and the documents run 2–5 pages; our schema has none of those fields and
  `maxPages` is 2. Building it would mean inventing fields. See `decisions-for-user.md` #5.
  https://career.fsu.edu/sites/g/files/upcbnu746/files/FederalResumeGuide_FINAL.pdf ·
  https://www.jobs.irs.gov/sites/default/files/wysiwyg-uploads/files/Updated%20IRS%20Resume%20Tips%20with%20National%20Service%20(4-2017).pdf

### 1.4 Why ours match or beat them

1. **Per-template honesty.** Each card carries a derived rating (§9.3) and a one-line `atsNote`
   instead of a catalogue-wide "ATS-friendly" claim. The chip is only on templates whose profile is
   at least as strict as `ATS_STRICT`, enforced by `registry.test.ts`, and every ATS template has a
   structural compliance test (§12.2) that fails on a `<table>`, `<img>`, `<svg>`, a second column or
   an icon. When R3.6's parse-check gate lands it iterates `listTemplates().filter(ats)` and gets all
   eight for free.
2. **The formats people actually copy, as data-driven templates.** Jake's-style, Harvard-style and
   the one-page consulting classic are the three most-copied formats on Overleaf, Google Docs and
   Reddit; Rezi clones two of them. Ours render the user's single `ResumeDocument`, so switching
   between them is lossless and reversible (DESIGN §6.5), which no LaTeX template can do.
3. **Impact-first by construction.** The sample resume, the Engineer description and the Insights
   tips point to the X-Y-Z formula; AI rewrite already enforces "no invented numbers" (DESIGN §13).
4. **Fewer, better.** Ten templates with real layout differences beats "100+" colour variants; the
   accent palette and font menu already give the variants.
5. **Fonts embedded, no web-safe superstition.** Every bundled font is OFL and inlined in the PDF, so
   the text layer is identical whichever font is picked; we widen the ATS font menu rather than
   pretend Georgia parses better than Source Serif.

---

## 2. Design principles (binding for every template story)

1. A template is `(doc, theme, caps) -> markup` with only `.rz-*` classes, no hooks, no inline
   styles, no `next/*` imports, survives `renderToStaticMarkup` (packages/ui/README "Resume templates").
2. The shared renderer (`templates/shared.tsx`) applies every data and capability rule; a template
   decides placement and passes layout options (§5). It never re-implements dates, marks, hiding or
   headings.
3. DOM order is reading order: header, main, then sidebar (only `sidebar` has one).
4. All vertical rhythm is `calc(<em> * var(--rz-density))` so the fit ladder bites on every template.
   Sizes are `em` of `--rz-size`; the table in each spec gives the pt value at the template's default
   preset.
5. ATS templates reference `var(--rz-accent)` freely: under `theme.accent: false` the renderer
   resolves it to ink (`#111827`), so one stylesheet serves both.
6. Text transforms (`uppercase`, `small-caps`) are CSS only; the DOM keeps "Experience".
7. Page size (Letter / A4) and margins come from the theme (`pageSize`, spacing preset + ladder); a
   template never sets them.
8. No template draws an icon, an image (other than the permitted photo in `sidebar`), a table, a
   text box, a skill bar, or anything positioned absolutely.

---

## 3. Capability profiles — what changes

### 3.1 `ATS_STRICT.theme.fontPairs` widens to every bundled font

Today `["inter", "georgia-arial"]`. New: `["inter", "source-serif", "georgia-arial", "plex", "garamond"]`
(the `FONT_PAIRS` order). Reason: fonts are embedded as real text in the PDF; Jobscan's own
web-safe list includes Garamond and Georgia; restricting the menu hid a user's font on every switch
for no parsing benefit. The Java twin, `__fixtures__/capabilities.json` (both copies), the
`capabilities.test.ts` expectations, `TemplateCapabilitiesTest`, and the DESIGN §6.6 vector row
"font" (the `caps-doc` `hiddenContent()` list drops `font`: 8 → 7 items; "Editor: Font Family options
2 / 3" → 5 / 5) all change in the same story. Admin overrides can still narrow the list per template.

### 3.2 New profile `HYBRID` (TS + Java + fixture)

Single column, no photo, no graphics, but colour, rich text, lists, free headings, both date styles:

```ts
export const HYBRID: TemplateCapabilities = freeze({
  ats: false,
  columns: 1,
  sidebarSections: [],
  photo: false,
  photoDefault: false,
  marks: ["b", "i", "u", "a"],
  lists: true,
  graphics: false,
  theme: { accent: true, fontPairs: ["inter", "source-serif", "georgia-arial", "plex", "garamond"], spacing: true, pageLength: true },
  maxPages: 2,
  sections: [...SECTION_KINDS],
  custom: "any",
  customLimit: 99,
  headings: "free",
  dateStyles: ["range", "year"],
  maxSkillGroups: 0,
});
```

Invariants (tested): `isAtLeastAsStrictAs(HYBRID, DESIGN_FREE) === true`,
`isAtLeastAsStrictAs(ATS_STRICT, HYBRID) === true` except for `ats` (so the test asserts
`isAtLeastAsStrictAs({...ATS_STRICT, ats: false}, HYBRID)`), `isAtLeastAsStrictAs(HYBRID, ATS_STRICT)
=== false`. Java: `TemplateCapabilities.HYBRID` with the same values; `capabilities.json` gains a
third key `"HYBRID"` and both parity tests read it. The registry rule is unchanged: `ats: true` ⇒ ≤
`ATS_STRICT`; `ats: false` ⇒ ≤ `DESIGN_FREE`. `HYBRID` is a convenience constant, not a new rule.

### 3.3 `DESIGN_FREE.theme.fontPairs`

Same five entries (it lists every bundled font by definition).

### 3.4 Template-level tightenings (declared as frozen spreads, never `tightenCapabilities` at load)

- `consultant`: `{ ...ATS_STRICT, maxPages: 1, theme: { ...ATS_STRICT.theme, pageLength: false } }` —
  the Page Length control shows "(fixed by this template)", "Two Pages" is not offered, the ladder's
  "Still 2 pages" message appears when content overflows.
- `sidebar`: `{ ...DESIGN_FREE, graphics: false }` — no icons anywhere.

The registry test (`registry.test.ts`) already proves each declared object is inside its reference
profile; §12.3 adds the per-template expectations.

### 3.5 `TemplateMeta` additions (TypeScript only)

```ts
export type TemplateCategory = "ats" | "employer" | "styled";
export interface TemplateMeta {
  // existing: id, name, description, capabilities, thumb, defaults?
  /** Gallery group and filter chip (§9). */
  category: TemplateCategory;
  /** One honest sentence about parsing risk, shown under the rating on the gallery card. */
  atsNote: string;
}
```

Java does not mirror these (the API never reads them). `designFree.tsx` (test-only) gets
`category: "styled"`, `atsNote: "Test only."`.

---

## 4. Fonts — two new self-hosted stacks

### 4.1 Which and why

| `FontPair` id | Family | Used by default in | Licence | Why |
|---|---|---|---|---|
| `plex` | IBM Plex Sans (variable, wght 100–700) | `engineer` | SIL OFL 1.1 | The engineering/tech sans; `types.ts` already reserved it ("IBM Plex is not offered until it is bundled") |
| `garamond` | EB Garamond (variable, wght 400–800) + italic | `consultant` | SIL OFL 1.1 | Garamond is on every banking/consulting font list (Jobscan, mbbprep, Harvard HSPH list Times/Garamond-class serifs) and is the only one with an OFL cut |

Sources: https://github.com/google/fonts/tree/main/ofl/ibmplexsans (files
`IBMPlexSans[wdth,wght].ttf`, `IBMPlexSans-Italic[wdth,wght].ttf`, `OFL.txt`) and
https://github.com/google/fonts/tree/main/ofl/ebgaramond (files `EBGaramond[wght].ttf`,
`EBGaramond-Italic[wght].ttf`, `OFL.txt`). IBM licenses Plex "only under the SIL Open Font License"
(https://en.wikipedia.org/wiki/IBM_Plex); EB Garamond is OFL 1.1 (https://github.com/octaviopardo/EBGaramond12).
The reserved font names are kept as is (we do not rename or restyle the families).

### 4.2 Files (all under `packages/ui/fonts/`, next to `inter-latin-var.woff2`)

```
ibm-plex-sans-latin-var.woff2           from IBMPlexSans[wdth,wght].ttf, wdth pinned to 100, wght kept variable
ibm-plex-sans-italic-latin-var.woff2    from IBMPlexSans-Italic[wdth,wght].ttf, same
eb-garamond-latin-var.woff2             from EBGaramond[wght].ttf
eb-garamond-italic-latin-var.woff2      from EBGaramond-Italic[wght].ttf
OFL-IBMPlexSans.txt                     verbatim copy of ofl/ibmplexsans/OFL.txt
OFL-EBGaramond.txt                      verbatim copy of ofl/ebgaramond/OFL.txt
```

Italics are bundled for the two new families because `engineer`, `consultant` and `scholar` set
italic lines by CSS (synthesised oblique Garamond is not acceptable). Inter and Source Serif stay as
they are (upright only; the browser synthesises, as today).

Build recipe (documented in `packages/ui/fonts/README.md`, new, 20 lines; no script is checked in —
the existing two files have none either):

```
pip install fonttools brotli
fonttools varLib.instancer "IBMPlexSans[wdth,wght].ttf" wdth=100 -o plex.ttf
pyftsubset plex.ttf --flavor=woff2 --layout-features='*' \
  --unicodes="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" \
  --output-file=ibm-plex-sans-latin-var.woff2
```

(the unicode range is Google Fonts' `latin` subset). Repeat for the italic and for the two
Garamond files (no instancer step: they have only `wght`). Expected sizes 30–70 KB each; the PDF HTML
inlines all six faces as data URIs (≈ 350 KB of CSS per print — within the 2.5 MB parse limits by
a wide margin, and the PDF itself embeds only the used subsets).

**Update 2026-10-17 (static instances).** Chromium embeds a variable font in a PDF as a Type 3 font, which
is unusual for ATS pipelines. The six `*-latin-var.woff2` files above were therefore replaced by static
instances, one file per weight and style (`inter-latin-{400,600,700}`, `source-serif-4-latin-{400,600,700}`,
`ibm-plex-sans-latin-{400,600,700}` + `ibm-plex-sans-italic-latin-{400,700}`, `eb-garamond-latin-{400,600,700}` +
`eb-garamond-italic-latin-{400,700}`), each with its own `@font-face` weight; the exported PDF now embeds normal
subsetted TrueType (Type 0) fonts. The file list and recipe above are the history; the current ones are in
`packages/ui/fonts/README.md`.

### 4.3 Code touch points (story T1)

- `packages/ui/styles/resume.css`: four `@font-face` rules (family "IBM Plex Sans" weights
  `100 700`, normal + italic; family "EB Garamond" weights `400 800`, normal + italic),
  `font-display: block`, `src: url("../fonts/<file>") format("woff2")` — the PDF route's regex
  already inlines any `../fonts/*.woff2`.
- `packages/ui/src/resume/types.ts`: `FontPair = "inter" | "source-serif" | "georgia-arial" | "plex" | "garamond"`;
  `FONT_PAIRS` in that order; drop the "IBM Plex is not offered" comment.
- `packages/ui/src/resume/theme.ts` `FONT_STACKS`:
  `plex: { body: '"IBM Plex Sans", "Helvetica Neue", Arial, sans-serif', display: same }`,
  `garamond: { body: '"EB Garamond", Garamond, Georgia, "Times New Roman", serif', display: same }`.
- `web/src/components/app-v3/resume-builder/themeEdit.ts` `FONT_LABELS`: `plex: "IBM Plex Sans"`,
  `garamond: "EB Garamond"`.
- `api/.../ResumeThemeValidator.FONT_PAIRS`: add `"plex", "garamond"` (same order).
- `web/next.config.ts` `outputFileTracingIncludes`: confirm it includes the whole `packages/ui/fonts`
  directory (if it lists files, add the four).
- Tests: `theme.test.ts` (sanitize accepts `plex`/`garamond`, `themeCss` emits the stacks),
  `ResumeThemeValidatorTest` (accepts both, rejects `plex-mono`), a `fonts.test.ts` in packages/ui
  that asserts each `@font-face` `src` in `resume.css` names a file that exists in `fonts/` and that
  every file in `fonts/*.woff2` is referenced (no orphans).

---

## 5. Shared renderer extensions (`templates/shared.tsx`, story T4)

All three are opt-in options with today's behaviour as the default, so `modern`'s snapshots do not
change except where §5.4 says.

### 5.1 Item head layouts

```ts
export type HeadStyle = "inline" | "title-org" | "org-title";
export interface ItemLayout {
  experience?: HeadStyle; // also CUSTOM
  education?: HeadStyle;
}
export interface RenderOptions {
  only?: (kind: SectionKind | null) => boolean;
  layout?: ItemLayout;
  skills?: "inline" | "list";
}
export function renderSections(doc: Json, theme: Pick<Theme, "dateStyle">, caps: TemplateCapabilities, opts?: RenderOptions | ((kind: SectionKind | null) => boolean)): RenderedSection[];
```

(The 4th argument keeps accepting the old `only` function for the two existing callers; a function
is treated as `{ only }`.)

| Style | Line 1 (left · right) | Line 2 (left · right) | Markup |
|---|---|---|---|
| `inline` (today) | `title — org` · dates | `location` (sub, muted) | unchanged |
| `title-org` | **title** · dates | *org* · location | two `.rz-item-head` rows |
| `org-title` | **org** · location | *title* · dates | two `.rz-item-head` rows |

Education under the same styles: `inline` = `degree in field — school` · dates, sub `location · GPA: x`;
`title-org` = **degree in field** · dates, then *school* · location, GPA appended to line 2 left as
` · GPA: x`; `org-title` = **school** · location, then *degree in field · GPA: x* · dates.

Markup for the two-line styles (real text, one reading order; the second row carries
`rz-item-head-2` so templates can size it):

```html
<div class="rz-item">
  <div class="rz-item-head"><div class="rz-item-main"><span class="rz-item-org">Harbor &amp; Vale Logistics</span></div><div class="rz-item-loc">Austin, TX</div></div>
  <div class="rz-item-head rz-item-head-2"><div class="rz-item-main"><span class="rz-item-title">Senior Software Engineer</span></div><div class="rz-item-dates">Mar 2022 – Present</div></div>
  <ul class="rz-bullets">…</ul>
</div>
```

Which element is bold or italic is CSS per template (`.rz-tpl-<id> .rz-item-org { font-style: italic }`);
the shared CSS gives `.rz-item-loc` the same look as `.rz-item-dates` (0.9em, muted, `flex: none`,
`white-space: nowrap`). Empty halves are omitted (no empty `<div>`s), so a role without a location
renders line 1 as the org alone.

### 5.2 Skills as a tag list

`skills: "list"` renders each group as
`<p class="rz-skill-row"><span class="rz-skill-group">Group</span></p><ul class="rz-skill-tags"><li>Java</li>…</ul>`
(the group label row is omitted when the group has no name). Real text; the shared CSS makes
`.rz-skill-tags` a flex-wrap list with `list-style: none`, gap `0.3em`, and each `li` a small
padded chip (`0.1em 0.5em`, border 1px `color-mix(in srgb, var(--rz-accent) 35%, transparent)`,
radius 3px). Only `sidebar` uses it; `text.ts` (ATS text export) is unaffected.

### 5.3 Contact line options

`ContactLine({ basics, sep = " | ", stacked = false })`. `sep` is the visible separator (`" | "`,
`" • "`, `" · "`). `stacked` renders `<ul class="rz-contact-list"><li>…</li></ul>` (one entry per
line, `list-style: none`, no separators) for the sidebar. `Header({ basics, sep, stacked })` forwards
both. Default output is byte-identical to today.

### 5.4 Two shared fixes that touch `modern`'s snapshots (same story, snapshots updated)

- Projects render their dates: `dateRange(item, dateStyle)` right-aligned in the head (the schema has
  `ProjectItem.start/end`; today they are silently dropped). Under `org-title`/`title-org` a project is
  one line: **title** `·` link · dates.
- Certifications under two-line styles stay one line (title — org · date; link on a sub line).

---

## 6. Template specifications

Conventions used below. "pt @ default" is the size at the template's default spacing preset
(`normal` 11 pt / `compact` 10.5 pt / `spacious` 11 pt, step 0). Colours: ink `#111827`, muted
`#4b5563`, light rule `#d1d5db`, accent `var(--rz-accent)` (= ink under `theme.accent: false`).
"Head" refers to §5.1 styles. Every template's root is `<div class="rz-page rz-tpl-<id>">`. Section
order is always document order (the user's Swap Section order); where a convention says "Education
first" the description says so and the New Resume chooser does not reorder (decision #6).

Every template renders the same section set its profile allows: SUMMARY, EXPERIENCE, EDUCATION,
SKILLS, PROJECTS, CERTIFICATIONS, LANGUAGES, ACHIEVEMENTS (+ INTERESTS and CUSTOM where the profile
allows). Rendering of the item kinds not mentioned in a spec is the shared default
(certifications: title — org · date, link below; languages: name — level; achievements: bullet with
`· date`; interests: comma line).

### 6.1 `modern` — Modern (existing; unchanged markup)

- **Identity:** category `ats`, `ATS_STRICT`, rating ATS-safe (strict). `atsNote`: "One column, real
  text, standard headings. Safe for every parser we know of." Description unchanged.
- **Layout (as built):** Letter/A4 from theme; margins from preset; name 2em/22 pt bold left,
  headline 1.1em muted, contact 0.9em ` | `; titles 0.95em uppercase, letter-spacing .08em, 1.5px
  accent(=ink) rule; inline head; dates right (flex), 0.9em muted; disc bullets.
- **Defaults:** `{}` (keeps the user's theme; the default template must not rewrite anything).
- **Thumbnail:** regenerated from `sample-resume.json` by the §8 generator (replaces the current
  Priya Sharma image so all ten thumbnails show the same person).

### 6.2 `classic` — Classic

- **Identity:** category `ats`, `ATS_STRICT`, ATS-safe (strict). Description: "Centred serif header,
  ruled headings. The traditional look recruiters have read for decades." `atsNote`: "One column,
  real text, standard headings."
- **Grid:** one column, full width.
- **Header:** name centred, 1.7em/18.7 pt, weight 700, `text-transform: uppercase`,
  letter-spacing .1em; headline centred 1em italic muted, margin-top .15em; contact centred 0.9em
  muted, separator ` · `, links not underlined (shared rule).
- **Sections:** title 0.9em/9.9 pt, weight 700, uppercase, letter-spacing .12em, ink, padding-bottom
  .15em, `border-bottom: 1px solid #111827`, margin-bottom `.5em·d`; section gap `1em·d`.
- **Items:** head `inline`; title weight 700; org weight 400; dates 0.9em muted right; sub (location)
  0.9em muted; entry gap `.65em·d`.
- **Bullets:** disc, marker ink, indent 1.2em, gap `.18em·d`.
- **Skills:** "Group: a, b, c" rows (shared), group label bold.
- **Body:** 1em, line-height 1.4 (page default).
- **Defaults:** `{ fontPair: "source-serif", spacing: "normal" }`.
- **Fit ladder:** no template CSS fixed in pt; all gaps are `·d`, so steps 2–6 shrink them 8–28 %.
- **Thumbnail:** must show the centred uppercase serif name, the italic headline and the ruled
  SUMMARY / EXPERIENCE headings.

### 6.3 `compact` — Compact

- **Identity:** category `ats`, `ATS_STRICT`, ATS-safe (strict). Description: "Tight sans layout
  that fits a full career on one page without shrinking the font below 9 pt." `atsNote`: "One
  column, real text, standard headings. Dense but every line is parseable."
- **Grid:** one column.
- **Header:** name left 1.6em/16.8 pt weight 700; headline 1em muted on its own line; contact 0.85em
  muted ` | `; header margin-bottom `.7em·d`.
- **Sections:** title 0.85em uppercase letter-spacing .06em weight 700 ink, `border-bottom: 1px solid #d1d5db`,
  padding-bottom .1em, margin-bottom `.35em·d`; section gap `.7em·d`.
- **Items:** head `inline`; entry gap `.45em·d`; dates/sub 0.85em muted.
- **Bullets:** disc, margin-top `.15em·d`, gap `.1em·d`, indent 1.1em.
- **Body:** `line-height: 1.3` on `.rz-page.rz-tpl-compact`.
- **Defaults:** `{ fontPair: "inter", spacing: "compact" }` (10.5 pt, density .88, 0.6 in).
- **Fit ladder:** from the compact preset the ladder reaches 9 pt / .6 density / .3 in at step 6;
  the page-fit test (§12.4) requires the one-page sample at step ≤ 4.
- **Thumbnail:** dense page, nearly filled; thin grey rules visible.

### 6.4 `simple` — Simple

- **Identity:** category `ats`, `ATS_STRICT`, ATS-safe (strict). Description: "Plain and quiet, like
  a well-made Word document. Nothing between the reader and the words." `atsNote`: "One column, no
  rules or colour, standard headings. The most conservative choice."
- **Header:** name left 1.5em/16.5 pt weight 700 (display font: Georgia under the default pair);
  headline 1em regular ink; contact 0.9em muted ` | `; header margin-bottom `.9em·d`.
- **Sections:** title 1em weight 700, no transform, no rule, no letter-spacing, margin-bottom
  `.3em·d`; section gap `.9em·d`.
- **Items:** head `inline`; title bold, org regular; dates 0.9em right, **ink** (not muted); sub
  0.9em muted.
- **Bullets:** disc, indent 1.2em, gap `.18em·d`.
- **Defaults:** `{ fontPair: "georgia-arial", spacing: "normal" }`.
- **Thumbnail:** visibly unadorned; headings in sentence case.

### 6.5 `engineer` — Engineer (the Jake's-style one-pager)

- **Identity:** category `employer`, `ATS_STRICT`, ATS-safe (strict). Description: "The one-page
  format tech recruiters see most: centred header, ruled small-cap headings, two-line roles,
  impact-first bullets (Accomplished X, measured by Y, by doing Z)." `atsNote`: "One column, real
  text, standard headings. Keep it to one page for product and engineering roles."
- **Header:** name centred 2.1em/22 pt weight 700 `font-variant-caps: small-caps`, letter-spacing
  .02em; headline centred 1em muted; contact centred 0.85em, separator ` | `, links **underlined**
  (`.rz-tpl-engineer .rz-link { text-decoration: underline; border-bottom: 0 }`); header margin-bottom
  `.8em·d`.
- **Sections:** title 1.05em/11 pt weight 600 `font-variant-caps: small-caps` (no uppercase), ink,
  padding-bottom .1em, `border-bottom: 1px solid #111827`, margin-bottom `.4em·d`; section gap `.8em·d`.
- **Items:** layout `{ experience: "title-org", education: "org-title" }` (exactly Jake's: role bold +
  dates, employer italic + location; school bold + location, degree italic + dates); line 2 is 0.92em;
  `.rz-item-org` italic on experience, `.rz-item-title` italic on education (CSS scoped by
  `.rz-section-experience` / `.rz-section-education`); entry gap `.5em·d`; dates/loc 0.9em ink.
- **Projects:** **title** `·` link (shortened url, italic) · dates right; bullets below.
- **Skills:** "Label: a, b, c" rows, label bold, rows at 0.95em, gap `.1em·d`.
- **Bullets:** disc, indent 1.1em, margin-top `.15em·d`, gap `.1em·d`; body line-height 1.3.
- **Defaults:** `{ fontPair: "plex", spacing: "compact" }`.
- **Fit ladder:** one-page sample at step ≤ 4 (§12.4).
- **Thumbnail:** centred small-cap name, `|` contact line, the full-width black rules, two-line roles.

### 6.6 `consultant` — Consulting & Finance

- **Identity:** category `employer`, profile `ATS_STRICT` tightened (`maxPages: 1`,
  `theme.pageLength: false`), ATS-safe (strict). Description: "The dense one-page classic used in
  consulting, banking and MBA recruiting: firm and school in bold, titles in italics, numbers first.
  Put Education first if you graduated in the last three years." `atsNote`: "One column, real text,
  standard headings, strictly one page."
- **Header:** name centred 1.5em/15.75 pt weight 700 uppercase letter-spacing .08em; headline
  centred 0.9em `font-variant-caps: small-caps` muted; contact centred 0.9em ` | `; header
  margin-bottom `.6em·d`.
- **Sections:** title 0.9em weight 700 uppercase letter-spacing .1em ink, `border-bottom: 1px solid #111827`,
  padding-bottom .08em, margin-bottom `.35em·d`; section gap `.65em·d`.
- **Items:** layout `{ experience: "org-title", education: "org-title" }`; `.rz-item-org` bold,
  `.rz-item-title` italic (experience) / degree italic (education); location and dates 1em ink
  (not muted, not smaller — banking resumes keep one size); entry gap `.4em·d`.
- **Bullets:** disc, indent 1em, margin-top `.08em·d`, gap `.05em·d`; body line-height 1.25.
- **Skills / languages / certifications:** one-line rows at 1em.
- **Defaults:** `{ fontPair: "garamond", spacing: "compact" }`.
- **Fit ladder:** `fit.target` is capped at 1 by `applyCapabilities`; the ladder runs to step 6 and
  then reports "Still 2 pages" — the user trims. One-page sample at step ≤ 3.
- **Thumbnail:** uppercase serif name, dense black-ruled sections, bold firm / italic title lines.

### 6.7 `scholar` — Academic (Harvard-style)

- **Identity:** category `employer`, `ATS_STRICT`, ATS-safe (strict). Description: "The university
  career-centre format: centred headings, organisation and title in bold with locations and dates on
  the right. Education first for students and new graduates." `atsNote`: "One column, real text,
  standard headings."
- **Header:** name centred 1.4em/15.4 pt weight 700; headline centred 1em (regular); contact
  centred 0.9em, separator ` • `; header margin-bottom `.7em·d`.
- **Sections:** title **centred**, 1em weight 700, no transform, no rule, margin-bottom `.3em·d`;
  section gap `.85em·d`. (Matches the 2026 Harvard sample, which centres "Education" / "Experience"
  without rules.)
- **Items:** layout `{ experience: "org-title", education: "org-title" }`; both `.rz-item-org` and
  `.rz-item-title` weight 700 (the sample bolds both); location and dates 1em ink; entry gap `.5em·d`.
- **Bullets:** disc, indent 1.2em, gap `.15em·d`; body line-height 1.35.
- **Defaults:** `{ fontPair: "source-serif", spacing: "normal" }`.
- **Thumbnail:** centred headings without rules, bold org/title pairs with right-aligned text.

### 6.8 `executive` — Executive

- **Identity:** category `employer`, `ATS_STRICT`, ATS-safe (strict). Description: "Two-page
  leadership format: summary and skills up top, roles with scope and results. For 10+ years of
  experience." `atsNote`: "One column, real text, standard headings. Comfortable on two pages."
- **Header:** name left 2em/22 pt weight 700; headline 1.05em uppercase letter-spacing .08em muted,
  margin-top .2em; contact 0.9em muted ` | `; `border-bottom: 2px solid #111827` under the header,
  padding-bottom `.5em·d`, margin-bottom `1em·d`.
- **Sections:** title 0.95em uppercase letter-spacing .12em weight 700 ink,
  `border-bottom: 1px solid #d1d5db`, padding-bottom .15em, margin-bottom `.55em·d`; section gap
  `1.1em·d`.
- **Summary:** `.rz-section-summary .rz-text` at 1.02em.
- **Items:** layout `{ experience: "title-org", education: "inline" }`; title 1.02em bold; org
  regular (not italic) on line 2 with location right; dates 0.9em muted; entry gap `.8em·d`.
- **Skills:** rows at 1em, group label bold (reads as "Core competencies" content under the standard
  "Skills" heading).
- **Bullets:** disc, indent 1.2em, gap `.2em·d`.
- **Defaults:** `{ fontPair: "georgia-arial", spacing: "spacious" }`.
- **Thumbnail:** heavy header rule, generous spacing, uppercase headline.

### 6.9 `statement` — Statement (styled, `HYBRID`)

- **Identity:** category `styled`, `HYBRID`, rating "Mostly ATS-safe". Description: "A bold colour
  band for your name, accent headings, rich text and lists. Modern without columns or icons."
  `atsNote`: "One column and real text, but colour, italics, links and lists are on and the header
  sits in a tinted band. Fine for text parsers; choose an ATS template for conservative employers."
- **Header band:** `.rz-header` has `background: var(--rz-accent); color: #fff; padding: 1.1em 1.2em;
  border-radius: 4px; margin-bottom: 1.2em·d` (inside the page margins — never bled into the
  `@page` margin, which print would clip). Name 2em weight 700 white; headline 1.05em white at 88 %
  (`color: rgba(255,255,255,.88)`); contact 0.9em white at 88 %, separator ` · `, links white with the
  shared 35 % bottom border.
- **Sections:** title 0.95em uppercase letter-spacing .1em weight 700 **accent**, no underline;
  `border-left: 3px solid var(--rz-accent); padding-left: .5em`; margin-bottom `.5em·d`; section gap
  `1em·d`.
- **Items:** head `inline`; title bold; org regular; dates 0.9em muted; entry gap `.7em·d`.
- **Bullets:** disc with **accent markers** (shared `::marker` rule), numbered lists allowed; summary
  lists allowed.
- **Marks:** b / i / u / links rendered (shared).
- **Defaults:** `{ fontPair: "inter", spacing: "normal" }` (accent not defaulted: the user's palette
  pick shows at once).
- **Thumbnail:** blue (default accent) band with white name, accent left-ruled headings.

### 6.10 `sidebar` — Sidebar (styled, `DESIGN_FREE` with `graphics: false`)

- **Identity:** category `styled`, profile `{ ...DESIGN_FREE, graphics: false }`, rating "Design
  first — less ATS-safe". Description: "Two columns with a tinted sidebar for contact, skills and
  languages, and room for a photo. Made for portfolios and direct emails." `atsNote`: "Two columns
  and a photo slot. Modern parsers usually cope, but column order and photos are the top causes of
  lost fields. Not for conservative employers."
- **Grid:** `.rz-page.rz-tpl-sidebar { display: grid; grid-template-columns: 32% minmax(0, 1fr);
  grid-template-areas: "header header" "side main"; column-gap: 1.4em; }`. DOM order stays header,
  `main.rz-main`, `aside.rz-side` (§2 rule 3); the aside is placed on the **left** by `grid-area:
  side`. Under an admin override `columns: 1` the template renders everything in `main` in document
  order and no `aside` (the same `caps.columns === 2` test as `designFree.tsx`).
- **Header:** full-width row; name 2em weight 700 ink; headline 1.05em accent; contact is **not** in
  the header (see sidebar); header margin-bottom `1em·d`.
- **Sidebar (`aside.rz-side`):** `background: color-mix(in srgb, var(--rz-accent) 8%, #fff);
  padding: .9em; border-radius: 4px; align-self: start` plus `break-inside: auto`. Contents in order:
  `Photo` (6em circle, centred, margin-bottom `.8em·d`; only when `photoShown`), then a "Contact"
  block (`<h2 class="rz-section-title">Contact</h2>` + `ContactLine stacked`), then the sections in
  `caps.sidebarSections` in document order (SKILLS as `skills: "list"` tags, LANGUAGES, CERTIFICATIONS,
  INTERESTS). Sidebar section titles 0.85em uppercase letter-spacing .1em accent, no rule; sidebar
  body 0.9em.
- **Main:** everything else (SUMMARY, EXPERIENCE, EDUCATION, PROJECTS, ACHIEVEMENTS, CUSTOM) in
  document order; titles 0.95em uppercase letter-spacing .1em accent with `border-bottom: 1.5px solid
  var(--rz-accent)`; head `inline`; title bold; dates 0.9em muted; entry gap `.7em·d`.
- **Photo rules:** drawn only when `caps.photo && (theme.showPhoto ?? photoDefault) && doc has a photo
  && photoSrc`; `photoDefault: false` (region note in DESIGN §5 applies); square crop, circle mask.
- **Defaults:** `{ fontPair: "inter", spacing: "normal" }`.
- **Pagination:** the grid row "side main" breaks across pages; both columns continue on page 2 at
  the top of their column; entries carry `break-inside: avoid` (shared).
- **Thumbnail:** tinted left column with Contact and skill chips, blue headings right; no photo (none
  in the fixture's render — the thumbnail generator passes no `photoSrc`).

---

## 7. The shared sample resume (`sample-resume.json`)

File in this folder, copied byte-for-byte to `packages/ui/src/resume/__fixtures__/sample-resume.json`
by story T3 (the Java side does not need it). Fictional person **Jordan Avery**, Senior Software
Engineer, Austin TX; `example.com` addresses, a `555-01xx` phone (the reserved fictional range),
fictional employers and schools; no date of birth, no identifiers of any kind, no photo file (a
`basics.photo.key` is present so the hidden-content vectors fire, but no URL ever resolves it).

It exercises every section kind: SUMMARY (with a `b` and an `i` mark), EXPERIENCE (three roles,
nine X-Y-Z bullets, one current role), EDUCATION (two, one with GPA and a bullet), SKILLS (five
groups), PROJECTS (two, with dates and a link mark), CERTIFICATIONS (two, one with a link), LANGUAGES
(two), ACHIEVEMENTS (two, one dated), INTERESTS (three), CUSTOM "Volunteering" (one). It passes the
validator (`validateDocument` / `ResumeDocumentValidator`) and `json.test.ts`'s canonical write.

Also used by: every template's snapshot (`sample`), the thumbnail generator, the page-fit smoke
tests, and the gallery/picker component tests (replacing ad-hoc docs).

`onePageSample()` (test helper in `packages/ui/src/resume/test-fixtures.ts`): the same document with
`hidden: true` on the third role, the second project and the Volunteering section — the input for the
one-page budgets in §12.4.

---

## 8. Thumbnails — what and how

**Spec:** 240 × 340 PNG, the first 340 px of the page rendered at 240 px wide (scale 240/816 = 0.2941
for Letter), i.e. the top 1156 CSS px of the sheet; the sheet's `min-height` is one page, the rest is
white. This is what `modern.png` already is. Every thumbnail renders `sample-resume.json` with the
template's `meta.defaults` over `DEFAULT_THEME`, `fit.step` 0, Letter, no `photoSrc`.

**Generator (story T3) — a script in the repo; the PNGs are committed.**
`web/scripts/render-template-thumbs.mjs` (plain Node, like the other `web/scripts/*.mjs`) is the
entry point, wired as `npm run thumbs:templates -w web`. Because the renderer is TypeScript/TSX
(`@kiwiply/ui` templates + `web/src/lib/pdf.ts`), the script does not import them itself: it sets
`THUMBS_GEN=1` (and passes through `PDF_BROWSER_URL` / `PDF_LOCAL_CHANNEL`) and spawns
`vitest run src/lib/template-thumbs.gen.test.tsx` with `stdio: "inherit"`, exiting with vitest's
code. That keeps it cross-platform (no shell `VAR=1` prefix, which fails on this Windows machine)
and reuses the one place that can already load the templates in Node. Optional args:
`--only <id,id>` (regenerate some), `--out <dir>` (default `packages/ui/src/resume/thumbs`).
`template-thumbs.gen.test.tsx` is guarded by `describe.skipIf(!process.env.THUMBS_GEN)` (the same
pattern as `pdf.browser.test.tsx`), so the normal `npm test` never needs a browser.

```
npm run thumbs:templates -w web                                   # local Edge/Chrome
PDF_BROWSER_URL=ws://localhost:3000 npm run thumbs:templates -w web   # the chromium sidecar
```

The generator renders every `listTemplates()` entry and calls a new export in `web/src/lib/pdf.ts`:

```ts
/** PNG of the top of the first page: `width` px wide, `height` px tall (the page scaled to `width`). */
export async function renderThumbPng(html: string, opts: { pageSize: PageSize; width: number; height: number }): Promise<Buffer>
```

which takes a print slot like `printPdf`, opens a context with
`viewport: { width: px.width, height: Math.ceil(opts.height * px.width / opts.width) }`,
`deviceScaleFactor: opts.width / px.width`, `javaScriptEnabled: false`, aborts every request, sets the
HTML, emulates `screen` media, and screenshots `clip: { x: 0, y: 0, width: px.width, height: opts.height * px.width / opts.width }`.
The test writes `packages/ui/src/resume/thumbs/<id>.png` for every `listTemplates()` entry and asserts
each file's IHDR is 240 × 340. PNGs are committed (one per template story).

**Guard test (always on):** `packages/ui/src/resume/thumbs.test.ts` reads the 8-byte signature and
IHDR of every `meta.thumb` and asserts 240 × 340 (bytes 16–23 big-endian), so a wrong export fails
CI without a browser.

`web/src/components/app-v3/resume-builder/list/templateThumbs.ts` gains one import line per
template (the existing map pattern).

---

## 9. Admin defaults, gallery and picker

### 9.1 Settings (`ResumeBuilderSettingKeys`, mirrored in `DEFAULT_BUILDER_CONFIG`)

| Key | New default | Note |
|---|---|---|
| `resume.templates.enabled` | `["modern","classic","compact","simple","engineer","consultant","scholar","executive","statement","sidebar"]` | all ten, registry order; admin may disable any |
| `resume.templates.default` | `"modern"` | unchanged |
| `resume.templates.popular` | `["modern","engineer","classic","sidebar","compact"]` | the Popular strip shows five |
| `resume.templates.overrides` | `{}` | unchanged; validators now accept the ten ids |

"Everything admin-configured": enabling, ordering, popularity and per-template tightening stay
settings; the code only ships these defaults.

### 9.2 Gallery (`TemplateGallery.tsx` + `templates/model.ts`)

- Grouped by `meta.category` in the order ATS → Employer formats → Styled; inside a group, the
  admin's `enabled` order. Group headings: "ATS-safe" / "Employer formats" / "Styled", each with a
  one-line sub-caption: "One column, real text, standard headings — safe for every parser." /
  "The layouts recruiters in tech, consulting, finance and academia expect." / "More personality;
  honestly labelled where parsers may struggle."
- Filter chips above the grid: **All (10) · ATS-safe (4) · Employer formats (4) · Styled (2)**
  (counts from the enabled list); `ChoiceGroup`-style buttons, `aria-pressed`, local state only;
  event `resume_template_gallery_filter{category}`.
- Card: thumbnail · name · description · the existing capability chips · **rating line** (§9.3) · the
  `atsNote` in 12 px muted · "Use this template".
- `galleryTemplates(enabled, defaultId)` is unchanged; a new `groupByCategory(metas): Array<{ category, label, caption, templates }>`
  and `atsRating(caps)` live in `model.ts` and are unit-tested.

### 9.3 Derived ATS rating (`model.ts`)

```ts
export type AtsRating = "strict" | "mostly" | "design";
export function atsRating(caps: TemplateCapabilities): AtsRating {
  if (caps.ats) return "strict";
  if (caps.columns === 1 && !caps.photo && !caps.graphics) return "mostly";
  return "design";
}
export const ATS_RATING_LABEL: Record<AtsRating, string> = {
  strict: "ATS-safe",
  mostly: "Mostly ATS-safe",
  design: "Design first — less ATS-safe",
};
```

It is computed from the **resolved** capabilities, so an admin override that removes the photo and
the second column promotes the label honestly; demoting `ats` demotes it. Tones: strict = the green
"ats" chip tone, mostly = amber (`bg-v2-amber-soft text-v2-amber-ink` if present, else `bg-paper-2`),
design = `bg-paper-2 text-ink-soft`.

### 9.4 Pick Template panel (editor)

Unchanged layout (2-column grid of live cards, `offeredTemplateIds` order). Two small additions: the
card's bottom-right chip stays "✓ Selected" / "ATS Friendly"; below the name, a 11.5 px muted
category word ("ATS" / "Employer format" / "Styled") so ten cards scan quickly. The "Hides: …" line
and the switch toast already handle the profile differences (photo, marks, lists, Interests, custom
sections, accent, pages).

### 9.5 Popular strip (My Resumes)

No change beyond the default list; it already orders by `resume.templates.popular`.

---

## 10. API ↔ web template ids

Today Java accepts `{"modern","classic","compact"}` and the web registers only `modern`. The fix is
to make `classic` and `compact` **real templates with those ids** (§6.2, §6.3) and to grow the set to
the ten. Consequences and safety:

- No migration. `resume_doc.template_id` rows can only hold `modern` today (the web never offered the
  other two; `getTemplate` fell back to `modern`); a stray `classic`/`compact` row would now render as
  the new Classic/Compact, which is the intent of its name. No row is rewritten.
- `ResumeDocService.KNOWN_TEMPLATE_IDS` becomes the ten ids in story T5, before any template
  exists on the web. A new Java test (`KnownTemplateIdsTest`) asserts the fixture
  `template-defaults.json`'s key set ⊆ `KNOWN_TEMPLATE_IDS` (equal once T14 lands), and the TS
  `template-defaults.test.ts` already asserts that key set equals `TEMPLATE_IDS` — so the two sides
  cannot drift (the fixture is the contract; each template story adds one key on both sides).
  The `enabled` / `popular` setting defaults grow one id per template story and reach §9.1's full
  lists in T15, so "enabled ⊆ registered" holds at every commit.
- `TemplateThemeDefaults.BUILT_IN` gains one entry per template with the §6 defaults (`Map.of` is
  fine up to ten entries; use `Map.ofEntries`).
- `ResumeBuilderSettingKeys` defaults per §9.1; `isKnownTemplate` keeps reading the service constant.
- Each template story keeps both sides green in the same commit: TS registry entry + both fixture
  copies + Java `KNOWN_TEMPLATE_IDS` + `BUILT_IN` + the setting default lists.
- An id unknown to Java still answers 422 `$.templateId`; an id known to Java but disabled by the
  admin still answers "not enabled".

---

## 11. Fit ladder and page budgets

The ladder is global (`fit.ts`): step 1 size −0.5 / margin −0.05; step 2 adds density −0.08; … step
6 density −0.28 / size −1.5 / margin −0.3 from the preset. Templates do not add rungs; they decide
**where on the ladder they start** (their `spacing` default) and **how much rhythm the density
multiplier controls** (every vertical gap in §6 is `·d`). The PDF route and Print layout re-measure
exactly as today.

| Template | Start preset | Sample at step 0 (pages) | `onePageSample()` fits 1 page by step |
|---|---|---|---|
| modern, classic, simple, scholar, statement, sidebar | normal | ≤ 2 | not required |
| executive | spacious | ≤ 2 | not required |
| compact | compact | ≤ 2 | ≤ 4 |
| engineer | compact | ≤ 2 | ≤ 4 |
| consultant | compact (target capped at 1) | ≤ 2 (reported "Still 2 pages") | ≤ 3 |

**Headroom (added 2026-10-17):** at step 0 the sample plus **two extra two-line bullets** on the last role must still print in
two pages for every template except `sidebar` (two columns, no headroom yet): an edit must not tip a document onto a third
page. `template-fit.browser.test.tsx` asserts it. `modern`, `executive` and `statement` met it by tightening their own CSS block
(line height, section gap, entry gap), not the ladder; measured extra bullets before page 3 are in the QA report.

These are the §12.4 assertions. If a template misses its budget the template's rhythm is too loose —
fix the CSS, do not change the ladder.

---

## 12. Tests — named specs and vectors

### 12.1 Fonts and profiles (T1, T2)

- `theme.test.ts` · "sanitizeTheme accepts plex and garamond; themeCss emits their stacks".
- `fonts.test.ts` (new) · "every @font-face src in resume.css exists in fonts/ and every woff2 is referenced".
- `ResumeThemeValidatorTest` · `acceptsTheFiveFontPairs`, `rejectsAnUnknownFontPair`.
- `capabilities.test.ts` · update "ATS_STRICT is DESIGN 6.2" (fontPairs = all five); add
  "HYBRID sits between the profiles" with the three `isAtLeastAsStrictAs` facts of §3.2; update the
  §6.6 vectors: `hiddenContent(caps-doc, ATS_STRICT)` = 7 items (no `font`), editor Font Family
  options 5 / 5.
- `TemplateCapabilitiesTest` · `hybridMatchesTheFixture`, `hybridIsInsideDesignFreeAndOutsideAtsStrict`.
- Golden: `__fixtures__/capabilities.json` and `api/src/test/resources/resume-doc/capabilities.json`
  byte-identical, three keys.

### 12.2 Per-template render and compliance (every template story)

For each `<id>` a `templates/<id>.test.tsx` (copy of `modern.test.tsx`) with:

- `"<id>: HTML snapshot"` × fixtures `full-v2`, `sparse`, `caps-doc`, `sample` (deterministic).
- `"uses only .rz-* classes, no inline styles, no tables"` (as today).
- `"declares its profile"` — `toEqual` the expected object (`ATS_STRICT`, the tightened spread, `HYBRID`, …), `meta.category`, non-empty `atsNote`, thumb on disk.
- **ATS structural compliance** (only when `caps.ats`), via a shared helper
  `templates/__test__/atsCompliance.ts` → `expectAtsCompliant(html, cssBlock)`:
  - html has no `<table`, `<img`, `<svg`, `<aside`, `rz-side`, `rz-photo`, `rz-skill-tags`, no `role="img"`;
  - the `.rz-section-title` texts, in order, equal `DEFAULT_SECTION_TITLES` for the kinds present (standard headings);
  - no `<em>`/`<u>` from user marks (`caps-doc` has italic + underline marks → absent);
  - the template's CSS block (the text of `resume.css` between `/* == tpl:<id> == */` and the next
    marker — each template's rules live in one marked block) contains none of
    `grid-template-columns`, `column-count`, `columns:`, `position: absolute`, `float:`, `url(`,
    `content: "` (no CSS-generated text);
  - every `.rz-page.rz-tpl-<id>` rule that sets `font-size` uses `em` or `%`, never `pt`/`px`.
- **Layout option wiring**: for two-line templates, `"experience head is org-title/title-org"` asserts
  the `rz-item-head-2` row exists and the first row's text is the org (or title).
- `"renders projects dates"` on `sample` (all templates).

### 12.3 Registry (T2 + each template)

`registry.test.ts` · replace "Modern is the only production template" with "the ten production
templates, in gallery order" (`TEMPLATE_IDS` equals the §0 order); "every ats template is ≤
ATS_STRICT and every other ≤ DESIGN_FREE" (exists); add "categories: four ats, four employer, two
styled"; "no two templates share a thumb file".

### 12.4 Page fit (T15, `PDF_SMOKE=1`)

`web/src/lib/template-fit.browser.test.tsx` (gated like `pdf.browser.test.tsx`): for every template,
print `sample` at the template defaults, step 0 → `countPdfPages ≤ 2`; for `compact`, `engineer`,
`consultant`, run `exportResumePdf` on `onePageSample()` with `maxFitSteps: 6` → `fits === true` and
`step ≤` the §11 budget. One CI job (the R6.5 sidecar job) runs it.

### 12.5 Parity (T2, T5, each template)

- TS `template-defaults.test.ts` (exists) — keys == `TEMPLATE_IDS`, defaults equal.
- Java `TemplateThemeDefaultsTest.builtInDefaultsMatchTheFixture…` (exists) — reads the same fixture.
- Java `KnownTemplateIdsTest` (new) — `KNOWN_TEMPLATE_IDS == fixture keys`; and
  `ResumeBuilderSettingKeysTest` — the `enabled`/`popular` defaults are subsets of the known ids and
  the `default` is known.
- Cross-copy test (new, TS): `fixtures-parity.test.ts` asserts `__fixtures__/capabilities.json` and
  `__fixtures__/template-defaults.json` are byte-identical to `../../../../api/src/test/resources/resume-doc/*`
  (skips when the api folder is absent, e.g. a packaged build).

### 12.6 Gallery / picker (T14)

`TemplateGallery.test.tsx` · "groups enabled templates by category in ATS → Employer → Styled
order"; "filter chips narrow the grid and keep counts"; "rating line follows resolved capabilities
(override {photo:false, columns:1} on sidebar → Mostly ATS-safe; {ats:false} on modern → Mostly)";
`model.test.ts` · `atsRating` table (3 rows) and `groupByCategory` (empty group omitted).
`PickTemplatePanel.test.tsx` · "ten cards in enabled order with category captions".

### 12.7 Thumbnails (T3 + each template)

`thumbs.test.ts` · "every registered thumb is a 240×340 PNG" (IHDR bytes).

### 12.8 Vectors (reference values the tests assert)

| Vector | Expectation |
|---|---|
| `sample` under `ATS_STRICT` | `hiddenContent` = `[photo, marks(italic 1, link 1), section(Interests), custom(0)…]` → exactly `[photo, marks, section]` (the Volunteering CUSTOM is within limit 1); `<strong>` count 1, `<em>` 0, `<a class="rz-link">` only the header links |
| `sample` under `HYBRID` | `hiddenContent` = `[photo]`; `<em>` 1, link mark rendered |
| `sample` under `sidebar` profile | `hiddenContent` = `[]`; `aside.rz-side` contains "Contact", "Skills", "Languages", "Certifications", "Interests" headings and no "Experience" |
| `sample` under `consultant` | `--rz-page-h` Letter; `fit.target` 2 in theme → rendered theme `fit.target` 1 (`applyCapabilities`) and `hiddenContent` includes `pages` |
| `scholar` + `sample` | the first `.rz-item-head` under Experience contains "Harbor & Vale Logistics" then "Austin, TX"; the `rz-item-head-2` row contains "Senior Software Engineer" then "Mar 2022 – Present" |
| `engineer` + `sample` | Experience line 1 = title + dates; Education line 1 = "University of Westbrook" + "Westbrook, OR" |
| Projects dates | `sample` Projects first head contains "Feb 2023 – Jan 2024" on every template (the second project renders "2021 – 2021" → the shared `dateRange` keeps both; no special case) |
| `atsRating` | `ATS_STRICT`→strict; `HYBRID`→mostly; `DESIGN_FREE`→design; `{...DESIGN_FREE, columns:1, photo:false, graphics:false}`→mostly |

---

## 13. Analytics (additions, no content)

`resume_template_gallery_filter{category}`. Existing `resume_template_picked{id}` and
`resume_template_switched{from,to,hidden,defaulted}` now carry the ten ids.

---

## 14. Non-goals (this track)

- No federal format (decision #5), no cover-letter templates, no DOCX layout parity (R7.3 keeps its
  single-column DOCX), no per-template section reordering on creation (decision #6), no icons, no
  skill bars or charts, no photo in ATS templates, no new editor controls (everything the templates
  need is already a theme key or a capability), no parse-check service (that is R3.6; our ATS tests
  are structural until it lands — decision #2).
