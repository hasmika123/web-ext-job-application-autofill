import Image from "next/image";

/**
 * Landing trust strip: the ATS platforms the autofill engine actually supports (spec sections 1
 * and 7.2). Static row, no marquee; wraps on mobile. The PNGs in /public/ats are white-on-
 * transparent (made for dark surfaces), so they are flattened to a soft navy-grey silhouette here.
 */
const ATS = [
  { name: "Workday", src: "/ats/workday.png", w: 204 },
  { name: "Greenhouse", src: "/ats/greenhouse.png", w: 130 },
  { name: "Lever", src: "/ats/lever.png", w: 304 },
  { name: "Ashby", src: "/ats/ashby.png", w: 320 },
  { name: "Workable", src: "/ats/workable.png", w: 477 },
] as const;

export default function TrustStrip() {
  return (
    <section aria-label="Supported application systems" className="border-y border-v2-line bg-white/70">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-x-10 gap-y-4 px-5 py-6 md:flex-row md:justify-center md:px-6">
        <p className="text-[13px] font-semibold text-v2-muted">Fills applications on</p>
        <ul className="flex flex-wrap items-center justify-center gap-x-9 gap-y-4">
          {ATS.map((a) => (
            <li key={a.name} className="flex-none">
              <Image
                src={a.src}
                alt={a.name}
                width={a.w}
                height={88}
                className="h-6 w-auto opacity-60 brightness-0"
              />
            </li>
          ))}
        </ul>
        <p className="text-[13px] text-v2-muted">and every form the engine recognises</p>
      </div>
    </section>
  );
}
