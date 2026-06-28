# brand/ — source brand assets

High-resolution **source** art (logos + partner/ATS marks). These are the originals to edit
or re-export from; **nothing in the build references this folder.** The copies the apps
actually serve live elsewhere and are derived from these:

| Source (here) | Used copy (served) | Where |
|---|---|---|
| `logo.{svg,png}`, `logo-dark-mode.{svg,png}`, `logo-icon.{svg,png}` | `web/public/logo*.png`, `web/public/mark.svg`, `web/public/icon.png` + `web/src/app/icon.png` | web app (favicon, headers, auth, OG) |
| same logos | `job-autofill/icons/icon{16,48,128}.png`, `job-autofill/icons/logo*.png` | extension |
| `{ashby,greenhouse,lever,workable,workday}-dark-mode.svg` | `web/public/ats/*.png` (rasterized ~88px) | marketing hero marquee |

If you change a logo: edit the source here, then regenerate the served copies (the web ones
were produced with `sharp` — `fit: contain`, transparent bg; the ATS marks rasterized to
small transparent PNGs). Keep the extension icon set + `manifest.json` version in sync per
the version-bump ritual in `CLAUDE.md`.
