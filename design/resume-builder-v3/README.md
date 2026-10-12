# Resume Builder v3 boards (user-supplied, 2026-10-11)

The editor screen the Resume Builder must reproduce exactly (see root memory: "exact to the boards").

| File | Left panel state | Shows |
|---|---|---|
| `editor-pick-template.webp` | Pick Template | 5 templates (Modern selected, Classic, Minimal, Executive, Creative; ATS Friendly chips), Customize Template (accent colour, font family, spacing Compact/Normal/Spacious, page length One/Two pages) |
| `editor-swap-section.webp` | Swap Section | drag-to-reorder sections and their items (Work Experience → roles, Education → degree), per-section up/down + menu + delete |
| `editor-add-section.webp` | Add Section | Already added vs "Add to resume" (Projects, Certifications, Achievements, Languages, Interests, Custom Section), mascot Pro tip |

Common to all three: top bar (logo, "Resume Builder", "Saved 2 minutes ago", Add Section, Pick Template, Swap Section, Tailor to Job, Download ▾, close); section tabs (Personal Info, Summary, Experience, Education, Skills, More ▾); live document with photo, contact row, PROFESSIONAL SUMMARY with B/I/U/list/link toolbar + "Rewrite with AI"; right rail tabs Insights / AI Suggestions (4) / Job Match: Resume Score 82% ring + checklist + "View tips", AI Suggestions carousel (Apply Suggestion / Preview), Job Match BETA (role @ company, 76% match, key-skills checklist, keyword tip).

Sample data on the boards (Priya Sharma) is SAMPLE — never ship it as a real user's data.

## What these boards are — and are not (user, 2026-10-11)
- They define the **editor layout only**: top bar, left panel states, section tabs, centre document, right rail.
- The template thumbnails/names and the document's look (photo, colours) on the boards are **not template
  specs**. Real templates, including **ATS-friendly** ones, are added separately.
- **The selected template drives the editor:** with an ATS-friendly template selected, the editor constrains its
  input elements (e.g. no photo, only allowed text marks, ATS-safe fonts, standard headings) so the result stays
  ATS-safe. Switching templates is lossless — unsupported content is kept but hidden, with a notice.
- **The left pane is dynamic:** it opens from the top-bar buttons (Add Section, Pick Template, Swap Section),
  the clicked button is highlighted (one at a time — the green button on each board), clicking another button
  switches the panel, and the panel's ✕ or clicking the active button again closes it; the document then uses
  the freed width.
- **Print layout + PDF view + Download:** the editor offers a print-layout view and a PDF view (plus
  download); both open in a **right-side pane that slides in and closes out**.
