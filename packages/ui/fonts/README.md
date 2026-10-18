# Bundled resume fonts

Self-hosted Latin subsets, all SIL Open Font License 1.1 (licence texts sit next to the files).
`styles/resume.css` declares them; the PDF route inlines every `../fonts/*.woff2` as a data URI.
`src/resume/fonts.test.ts` fails if an `@font-face` points at a missing file, a file is orphaned, or
a bundled face is variable.

**Every file is a STATIC instance** (one file per weight and style, no `fvar` table). This matters for
the exported PDFs: Chromium embeds a variable font as a Type 3 font (glyph outlines drawn as little
procedures, which some ATS and PDF pipelines handle badly), but it embeds a static TrueType font as a
normal subsetted Type 0 / CIDFontType2 font. Do not reintroduce a `*-var.woff2` file.

| Files | Family | Weights / styles | Source |
|---|---|---|---|
| `inter-latin-{400,600,700}.woff2` | Inter | 400, 600, 700 (upright; italic is synthesised by the browser) | Inter, `OFL-Inter.txt` |
| `source-serif-4-latin-{400,600,700}.woff2` | Source Serif 4 (optical size pinned to 14.67) | 400, 600, 700 (upright) | Adobe, `OFL-SourceSerif4.txt` |
| `ibm-plex-sans-latin-{400,600,700}.woff2`, `ibm-plex-sans-italic-latin-{400,700}.woff2` | IBM Plex Sans (wdth 100) | 400, 600, 700 + italic 400, 700 | `google/fonts` `ofl/ibmplexsans`, `OFL-IBMPlexSans.txt` |
| `eb-garamond-latin-{400,600,700}.woff2`, `eb-garamond-italic-latin-{400,700}.woff2` | EB Garamond | 400, 600, 700 + italic 400, 700 | `google/fonts` `ofl/ebgaramond`, `OFL-EBGaramond.txt` |
| `gelasio-latin-{400,700}.woff2` | Gelasio (metric-compatible with **Georgia**) | 400, 700 (upright) | `google/fonts` `ofl/gelasio` (`Gelasio[wght].ttf`), `OFL-Gelasio.txt` |
| `arimo-latin-{400,700}.woff2`, `arimo-italic-latin-400.woff2` | Arimo (metric-compatible with **Arial**) | 400, 700 + italic 400 | `google/fonts` `ofl/arimo` (`Arimo[wght].ttf`, `Arimo-Italic[wght].ttf`), `OFL-Arimo.txt` |

**Gelasio and Arimo are not a font pair of their own.** They are the stand-ins for the system fonts of the "Georgia / Arial" pair
(Simple and Executive default to it): the stack is `Georgia, Gelasio, ...` and `Arial, Arimo, ...`, so a machine that has Georgia /
Arial (Windows, macOS) prints them, and one that does not (the Linux Chromium sidecar that prints production PDFs) prints the twin
with the same advance widths. Measured on that sidecar (browserless Chromium v2.57.0): before, `Georgia` fell back to Liberation Serif
(Times-width, 1359.7 px for the 40 px sample line against Georgia's 1476.4, about 8.6% narrower, and a different face); Gelasio measures 1476.4 and
Arimo 1483.1, exactly Georgia and Arial. `Arial` itself is answered by Liberation Sans on that image (same widths as Arial). The Windows and
Linux PDFs of the sample break onto the same two pages with the same headroom (three extra two-line bullets). Check it with
`PDF_SMOKE=1 npm run test:unit -w web -- pdf-fonts.browser template-fit.browser`. Arimo and Gelasio carry no Reserved Font Name; do not
bundle Georgia or Arial (proprietary) or Liberation (reserved name "Liberation").

The weights are the ones the resume CSS uses (400 body, 600 item titles / skill groups / Engineer
headings, 700 names / headings / bold marks). A weight with no face of its own is matched to the
nearest declared one by the browser, so add a face here before using a new weight in `resume.css`.
Italic faces exist for Plex and Garamond only (the templates that set italic lines in them).

Reserved font names are kept: the families are not renamed or restyled (`--update-name-table` only
fixes the weight words in the name table of each instance).

## Rebuild recipe (no script is checked in)

Needs fonttools with brotli. This machine's Application Control blocks compiled wheels, so install
fonttools from source:

```
python -m venv venv && venv/Scripts/pip install brotli
venv/Scripts/pip install --no-binary fonttools fonttools
```

**1. Variable masters.** Download the sources from <https://github.com/google/fonts/tree/main/ofl/ibmplexsans>
(`IBMPlexSans[wdth,wght].ttf`, `IBMPlexSans-Italic[wdth,wght].ttf`) and
<https://github.com/google/fonts/tree/main/ofl/ebgaramond> (`EBGaramond[wght].ttf`,
`EBGaramond-Italic[wght].ttf`) into an empty directory. The Inter and Source Serif 4 masters are the
Google Fonts latin subsets (`wght`, and `wght` + `opsz`) that were checked in until `ed68e1a7`. Subset each
master to Google Fonts' `latin` range, keeping all layout features, and (Plex only) pin the width axis first:

```
fonttools varLib.instancer "IBMPlexSans[wdth,wght].ttf" wdth=100 -o plex.ttf
pyftsubset plex.ttf --flavor=woff2 --layout-features='*' \
  --unicodes="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" \
  --output-file=ibm-plex-sans-latin-var.woff2
```

(the same for the other five masters: variable `*-var.woff2` intermediates, not committed; the last
commit that had them is `ed68e1a7`.)

**2. Static instances.** One instancer call per file; `--update-name-table` keeps the name table
honest (it needs the STAT table, which all six masters have):

```
fonttools varLib.instancer inter-latin-var.woff2 wght=600 --update-name-table -o inter-latin-600.woff2
fonttools varLib.instancer source-serif-4-latin-var.woff2 wght=600 opsz=14.67 -o source-serif-4-latin-600.woff2
fonttools varLib.instancer ibm-plex-sans-italic-latin-var.woff2 wght=700 --update-name-table -o ibm-plex-sans-italic-latin-700.woff2
```

Weights: 400 / 600 / 700 upright for all four families, 400 / 700 italic for Plex and Garamond. Source
Serif 4 has an optical-size axis; Chromium used to pick the size automatically (11 pt body = 14.67 px), so the
instances pin `opsz=14.67`: the pages break exactly as they did with the variable file (14 was measurably wider
and cost Classic two bullets of headroom). 14.67 is not a STAT axis value, so the name table of the three Source
Serif files is set by hand afterwards (family, subfamily, full and PostScript names, Bold bit on the 700).

**3. Check.** `fonts.test.ts` (no variable face, every file referenced); then export a PDF and list its
fonts, there must be no `Type3` (for example `fitz.open(f)[0].get_fonts()` shows `TrueType`/`Type0`).
Current sizes: Inter 24 KB, Source Serif 20 KB, Plex 23-25 KB, Garamond 59-72 KB per face (Garamond is
larger because it keeps all `'*'` layout features and its many ligature / alternate glyphs).
