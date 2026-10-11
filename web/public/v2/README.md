# Landing v2 artwork

Everything here is rendered by `src/components/marketing/media.tsx` (`Mascot`, `Photo`) and
`BrandLogo.tsx`. Static pages read this folder at **build time**, so redeploy after adding or
replacing a file. If a file is missing, its slot falls back to a built-in placeholder (lime mascot
disc / soft gradient panel) of the same size, so nothing breaks.

**Status (V2.6): every file below is a board extraction.** They were cut out of the design boards
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
| `hero-team.png` | 689x400 | three people at laptops, full heads (the V2.3b re-cut; the earlier 683x347 cut lost the top of their heads). Hero slide 4, /about "Who we serve", landing "for organisations" |
| `about-portrait.png` | 435x499 | same image as `hero-copilot.png`. /about hero (right edge faded with `edgeFade`, the jeans are a hard crop). The /organizations CTA band uses `hero-copilot.png` |
| `about-team.png` | 689x400 | copy of the re-cut `hero-team.png`. /about "Why we built Kiwiply" |
| `org-team.png` | 689x400 | copy of the re-cut `hero-team.png`. /organizations hero (sits under the Organization Overview card) |

`about-team.png` and `org-team.png` must be refreshed together with `hero-team.png` (they are
byte-for-byte copies today). After replacing any file, clear `.next/dev/cache/images` in dev or the
image optimizer keeps serving the old, differently sized version.

**Wanted:** at least 1200px wide transparent cutouts (people looking toward the headline, i.e. to the
left on hero slides), cleanly cut at the bottom with no leftover fragments from the source board, and
distinct images for the about / organisations pages instead of reusing the hero ones. Real, licensed
or commissioned imagery only. `.webp` / `.jpg` are still accepted by `Photo` (checked in the order
png, webp, jpg); those render as a cropped, rounded photo rather than a cutout.

## Backdrop (JPEG)

| File | Size | Use |
|---|---|---|
| `cta-backdrop.jpg` | 1920x198 | wide soft sky / foliage strip behind the landing final CTA band (`FinalCta.tsx`). Cleaned board crop with the baked-in copy painted out. **Wanted:** a clean 2400x300 render with no text. |

## App v2 cutouts (`app/`, signed-in app, auth, org admin and landing v3)

Board extractions (transparent PNG) cut from `design/app-v2/*.webp`, used by the "Kiwiply Bright" app
surfaces (spec `web/APP-V2-SPEC.md`). Board art is drawn through `AppArt` / `HeroArt` / `MascotCard`
in `src/components/app-v2/common/` (decorative, `alt=""`), the auth screens in
`src/components/auth/AuthScreen.tsx`, the org shell in `src/components/org-v2/shell/` and landing v3
in `src/components/marketing/v3/`. `AppArt` carries the native pixel size of each name, so a
replacement must keep the same file name and aspect ratio (or update `SIZES` in `AppArt.tsx`).

| File | Size | Used on |
|---|---|---|
| `mascot-grad.png` | 151x106 | graduation-cap mascot on a laptop: the "Upgrade to Kiwiply Pro" sidebar card (`AppShell`); landing v3 stats band (small) |
| `mascot-grad-big.png` | 147x120 | graduation-cap mascot, close crop: landing v3 stats band |
| `mascot-help.png` | 87x78 | headset mascot: org "Need Help?" sidebar card (`OrgShell`) |
| `mascot-wave-laptop.png` | 145x142 | waving with a laptop: AI Apply hero, job detail / jobs rail cards |
| `mascot-binoculars.png` | 171x162 | binoculars: Job Search hero |
| `mascot-search.png` | 138x132 | magnifier: Job Search hero (alt) |
| `mascot-heart.png` | 148x150 | holding a heart: Saved Jobs hero |
| `mascot-apps.png` | 126x130 | holding documents: My Applications hero |
| `mascot-resume.png` | 154x159 | holding a resume: Resume Builder hero |
| `mascot-books.png` | 149x154 | on a stack of books: signup mobile panel, "Coming soon" cards |
| `mascot-laptop-big.png` | 270x254 | large laptop mascot: landing v3 hero, CTA band and "Apply with AI" |
| `home-woman.png` | 181x185 | woman with a laptop: Home hero (right rail art) |
| `calendar-note.png` | 425x163 | calendar + sticky note: Interviews hero |
| `org-team-banner.png` | 260x151 | two people at a laptop: org admin hero banner (every `/org` page) |
| `auth-trio.png` | 900x582 | three students with a laptop: login panel (desktop + mobile) |
| `auth-trio-signup.png` | 701x440 | same trio, signup crop: signup panel |

These are small board crops (soft on high-DPI screens), same caveat as the landing v2 set above.
**Wanted:** high-res transparent renders of each, same names and proportions. Third-party brand marks
are not shipped as files: Apple / LinkedIn live in `@kiwiply/ui` (`AppleIcon`, `LinkedInIcon`), other
job-site and ATS marks are lettered tiles.

## Full inventory (18 files here + 16 under `app/`)

`about-portrait.png`, `about-team.png`, `cta-backdrop.jpg`, `hero-copilot.png`, `hero-headphones.png`,
`hero-individual.png`, `hero-student.png`, `hero-team.png`, `logo-v2.png`, `logo-v2-dark.png`,
`mascot-{clap,envelope,headphones,laptop,peek,plane,wave}.png`, `org-team.png`.

## High-res replacements wanted (summary)

1. Seven mascot poses, transparent, >= 600x600 (today five are one image; `clap` and `peek` are clipped).
2. Six people cutouts at >= 1200px wide, with distinct subjects for /about and /organizations.
3. Logo lockup as SVG (or >= 4x PNG) in light and dark.
4. `cta-backdrop.jpg` at 2400x300.
5. A real product screenshot set is a separate ask (spec section 13); mocks are pure HTML today.
