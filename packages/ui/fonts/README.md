# Bundled resume fonts

Self-hosted Latin subsets, all SIL Open Font License 1.1 (licence texts sit next to the files).
`styles/resume.css` declares them; the PDF route inlines every `../fonts/*.woff2` as a data URI.
`src/resume/fonts.test.ts` fails if an `@font-face` points at a missing file or a file is orphaned.

| File | Family | Source |
|---|---|---|
| `inter-latin-var.woff2` | Inter (variable) | Inter, `OFL-Inter.txt` |
| `source-serif-4-latin-var.woff2` | Source Serif 4 (variable) | Adobe, `OFL-SourceSerif4.txt` |
| `ibm-plex-sans-latin-var.woff2`, `ibm-plex-sans-italic-latin-var.woff2` | IBM Plex Sans (wght 100-700, wdth pinned to 100) | `google/fonts` `ofl/ibmplexsans`, `OFL-IBMPlexSans.txt` |
| `eb-garamond-latin-var.woff2`, `eb-garamond-italic-latin-var.woff2` | EB Garamond (wght 400-800) | `google/fonts` `ofl/ebgaramond`, `OFL-EBGaramond.txt` |

Reserved font names are kept: the families are not renamed or restyled.

## Rebuild recipe (no script is checked in)

Download the sources from <https://github.com/google/fonts/tree/main/ofl/ibmplexsans> and
<https://github.com/google/fonts/tree/main/ofl/ebgaramond> into an empty directory, then:

```
pip install fonttools brotli
fonttools varLib.instancer "IBMPlexSans[wdth,wght].ttf" wdth=100 -o plex.ttf
pyftsubset plex.ttf --flavor=woff2 --layout-features='*'   --unicodes="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"   --output-file=ibm-plex-sans-latin-var.woff2
```

Repeat for the italic (`IBMPlexSans-Italic[wdth,wght].ttf`) and for `EBGaramond[wght].ttf` /
`EBGaramond-Italic[wght].ttf` (no instancer step: they only have `wght`). The unicode range is Google
Fonts' `latin` subset. Current sizes: Plex 48 / 54 KB, Garamond 114 / 130 KB (Garamond is larger
because it keeps all `'*'` layout features and its many ligature / alternate glyphs).
