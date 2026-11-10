import { getImageProps } from "next/image";

/** The scene (design/enterprise-login: bee, cat, desk and a sunlit window, sharp, no text and no card). The glass card blurs it live. */
const SCENE = { src: "/ent/login/bg-scene.webp", width: 1672, height: 941 };

/** One decorative image: a tall crop around the bee that fades into the sky on a phone, full-bleed cover on a desktop. */
export function LoginBackdrop() {
  const img = getImageProps({ ...SCENE, alt: "", sizes: "(min-width: 768px) 100vw, 160vw", quality: 85 });
  return (
    <img
      {...img.props}
      alt=""
      data-tenant-plate
      loading="eager"
      fetchPriority="high"
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 block h-[150vw] w-full select-none object-cover [object-position:24%_40%] [mask-image:linear-gradient(to_bottom,black_72%,transparent)] sm:h-[min(150vw,900px)] md:inset-0 md:h-full md:[mask-image:none] md:[object-position:30%_14%] lg:[object-position:42%_14%]"
    />
  );
}

/**
 * The frame every signed-out tenant page shares with the sign-in: the scene behind, the card on the right from a tablet up (centred under the
 * bee on a phone). `AUTH_CARD_COLUMN` goes on the column that holds the card.
 */
export const AUTH_CARD_COLUMN = "pt-[min(70vw,273px)] md:items-end md:pr-[clamp(12px,5vw,96px)] md:pt-10";
