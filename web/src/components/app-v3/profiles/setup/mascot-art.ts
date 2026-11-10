/**
 * The mascot artwork the onboarding screens draw (`public/v2`), with each file's native pixel size. One map, read by
 * `StepMascot` (the v2 slots) and by the delight companion's `POSE_ART` (R1.14), so a new picture is one line here.
 * The art is board extractions, 150-250 px: it is only ever drawn small, and `alt=""` (decorative).
 */
export const MASCOT_ART = {
  wave: ["/v2/mascot-wave.png", 210, 221],
  clap: ["/v2/mascot-clap.png", 221, 246],
  laptop: ["/v2/mascot-laptop.png", 210, 221],
  resume: ["/v2/app/mascot-resume.png", 154, 159],
  books: ["/v2/app/mascot-books.png", 149, 154],
  peek: ["/v2/mascot-peek.png", 172, 214],
  binoculars: ["/v2/app/mascot-binoculars.png", 171, 162],
  grad: ["/v2/app/mascot-grad-big.png", 147, 120],
  laptopWave: ["/v2/app/mascot-wave-laptop.png", 145, 142],
} as const;

export type MascotName = keyof typeof MASCOT_ART;
