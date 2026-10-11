# Landing v2 artwork slots

Drop files here with **exactly** these names. Until a file exists, the page renders a built-in
fallback of the same size (lime mascot disc / soft gradient panel), so nothing breaks and
layout never shifts. Rendered by `src/components/marketing/media.tsx`.

Static pages read this folder at **build time**, so redeploy after adding or replacing files.

## Logo lockup (header + footer)

| File | Use |
|---|---|
| `logo-v2.png` | mascot bird + black "kiwiply" wordmark, transparent, 764x234, for light surfaces (header) |
| `logo-v2-dark.png` | same lockup with a white wordmark, for the navy footer |

Rendered by `src/components/marketing/BrandLogo.tsx`. **Interim:** both were extracted from the
design mockups at roughly 4x and are only crisp up to ~36px tall. Replace them with a vector
(SVG) or high-res transparent source when one is available, keeping the 764:234 ratio (or update
the constants in `BrandLogo.tsx`). The old `logo.svg` / `Logo` component still serves the
signed-in app.

## Mascot (transparent PNG, ~800x800, subject centred)

| File | Pose |
|---|---|
| `mascot-wave.png` | waving hello |
| `mascot-laptop.png` | at a laptop |
| `mascot-headphones.png` | wearing headphones |
| `mascot-envelope.png` | holding an envelope |
| `mascot-plane.png` | riding a paper plane |

**Interim:** all five files are currently the same low-res (400x360) image of the bird, so every
slot shows an identical pose. They await real transparent renders per pose; replace them in place.

## Photos (JPG, ~1600px wide; `.webp` is also accepted)

Subjects should look **toward the headline** (the text sits on the left of the hero, so people
face left / camera-left). Keep faces out of the bottom-right corner, where the mascot overlaps.

| File | Used on |
|---|---|
| `hero-copilot.jpg` | hero slide 1 (individual job seeker) |
| `hero-individual.jpg` | hero slide 2 (autopilot) and landing "For individuals" |
| `hero-student.jpg` | hero slide 3 (students and early career) |
| `hero-team.jpg` | hero slide 4 (organisations) |
| `about-portrait.jpg` | /about hero |
| `about-team.jpg` | /about "Why we built Kiwiply" |
| `org-team.jpg` | /organizations hero |

Use real, licensed or commissioned images. Do not crop artwork out of the design mockups in
`design/landing-v2/` (baked-in text, no transparency).
