import Image from "next/image";

/** Native pixel sizes of the extracted board artwork in `public/v2/app/`. */
const SIZES = {
  "calendar-note": [425, 163],
  "home-woman": [181, 185],
  "mascot-apps": [126, 130],
  "mascot-binoculars": [171, 162],
  "mascot-books": [149, 154],
  "mascot-grad": [151, 106],
  "mascot-heart": [148, 150],
  "mascot-help": [87, 78],
  "mascot-resume": [154, 159],
  "mascot-search": [138, 132],
  "mascot-wave-laptop": [145, 142],
} as const;

export type AppArtName = keyof typeof SIZES;

/** A board mascot / illustration from `public/v2/app/`, rendered at `height` CSS px (decorative). */
export default function AppArt({ name, height, className }: { name: AppArtName; height: number; className?: string }) {
  const [w, h] = SIZES[name];
  return (
    <Image
      src={`/v2/app/${name}.png`}
      alt=""
      aria-hidden
      width={Math.round((w / h) * height)}
      height={height}
      className={className}
      style={{ width: "auto", height }}
    />
  );
}
