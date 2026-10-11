# Landing v2 artwork

Everything here is rendered by `src/components/marketing/media.tsx` (`Mascot`, `Photo`) and
`BrandLogo.tsx`. Static pages read this folder at **build time**, so redeploy after adding or
replacing a file. If a file is missing, its slot falls back to a built-in placeholder (lime mascot
disc / soft gradient panel) of the same size, so nothing breaks.

**Status (V2.3b): every file below is a board extraction.** They were cut out of the design boards
in `design/landing-v2/` at modest resolution (see the sizes). That is fine for the page as built
(people render at most ~520 CSS px wide, the mascot at most ~220 px, and `Photo` caps a cutout at its
native width so nothing is upscaled), but it will look soft on high-DPI screens. Replace each file in
place with a high-res transparent render of the same subject, same name.

## Logo lockup (header + footer)

| File | Use |
|---|---|
| `logo-v2.png` | mascot bird + black "kiwiply" wordmark, transparent, 764x234, for light surfaces (header) |
| `logo-v2-dark.png` | same lockup with a white wordmark, for the navy footer |

Board extractions at roughly 4x, crisp only up to ~36px tall. **Wanted:** a vector (SVG) or high-res
transparent lockup, keeping the 764:234 ratio (or update the constants in `BrandLogo.tsx`).

## Mascot (transparent PNG)

| File | Size | Pose / used on |
|---|---|---|
| `mascot-wave.png` | 210x221 | winking, one paw raised. About CTA, organisations CTA band |
| `mascot-laptop.png` | 210x221 | same image. Landing final CTA, hero slide 2, About "Different" |
| `mascot-headphones.png` | 210x221 | same image. Hero slide 1, About hero, organisations hero |
| `mascot-envelope.png` | 210x221 | same image. Landing inbox section |
| `mascot-plane.png` | 210x221 | same image. Hero slide 4, landing organisations + how-it-works |
| `mascot-clap.png` | 221x246 | eyes closed, clapping. **Left edge slightly clipped**: only use where a card or photo hides it. Not placed yet |
| `mascot-peek.png` | 172x214 | peeking, paws on a ledge. **Top-left clipped**: only use peeking from behind something. Landing dashboard (behind the mock's lower-right corner) |

The five named poses are currently **one image** (the winking full-body bird), so wave / laptop /
headphones / envelope / plane all look identical. **Wanted:** a real transparent render per pose, at
least 600x600 with the subject centred, plus unclipped `clap` and `peek`. Mascot boxes in the code are
sized by class (`h-* w-*`), so a bigger or differently proportioned file just drops in.

## People cutouts (transparent PNG)

Rendered by `Photo` as a cutout: no rounded panel, no background, `object-contain`, bottom-anchored,
never wider than the file. The flat bottom edge is meant to sit on something (the hero's bottom edge,
a section edge, a card), so the person looks cut off like a sticker.

| File | Size | Subject / used on |
|---|---|---|
| `hero-headphones.png` | 441x343 | head-and-shoulders man, hand on chin, headphones round his neck. **Hero slide 1** (V2.2x board with the feature strip) |
| `hero-copilot.png` | 435x499 | woman, lime hoodie, laptop. Alternate slide 1 (`HERO_SLIDE_COPILOT_ALT`), /about hero |
| `hero-individual.png` | 580x554 | man, green hoodie, laptop (a sliver of the mascot's headphones remains at the right edge, hidden behind the mascot). Hero slide 2, landing job matches |
| `hero-student.png` | 611x516 | woman, purple hoodie, thinking at a laptop, **with the mascot already peeking in at her right**, so no separate mascot is rendered next to her. Hero slide 3, landing "for individuals". Faint ghost shape above the mascot; left and right edges are hard crops, so the code fades them (`edgeFade`) |
| `hero-team.png` | 689x400 | three people at laptops, full heads. Hero slide 4, landing "for organisations" |
| `about-portrait.png` | 435x499 | same image as `hero-copilot.png`. /about hero |
| `about-team.png` | 683x347 | same image as `hero-team.png`. /about "Why we built Kiwiply" |
| `org-team.png` | 683x347 | same image as `hero-team.png`. /organizations hero |

**Wanted:** at least 1200px wide transparent cutouts (people looking toward the headline, i.e. to the
left on hero slides), cleanly cut at the bottom with no leftover fragments from the source board, and
distinct images for the about / organisations pages instead of reusing the hero ones. Real, licensed
or commissioned imagery only. `.webp` / `.jpg` are still accepted by `Photo` (checked in the order
png, webp, jpg); those render as a cropped, rounded photo rather than a cutout.
