# Landing v2 artwork slots

Drop files here with **exactly** these names. Until a file exists, the page renders a built-in
fallback of the same size (lime mascot disc / soft gradient panel), so nothing breaks and
layout never shifts. Rendered by `src/components/marketing/media.tsx`.

Static pages read this folder at **build time**, so redeploy after adding or replacing files.

## Mascot (transparent PNG, ~800x800, subject centred)

| File | Pose |
|---|---|
| `mascot-wave.png` | waving hello |
| `mascot-laptop.png` | at a laptop |
| `mascot-headphones.png` | wearing headphones |
| `mascot-envelope.png` | holding an envelope |
| `mascot-plane.png` | riding a paper plane |

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
