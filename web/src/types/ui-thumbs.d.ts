/**
 * The resume template thumbnails exported by `@kiwiply/ui` (`./resume/thumbs/*`). Next's bundler
 * returns a StaticImageData object for them. Declared here (not only via next-env.d.ts, which is
 * generated and git-ignored) so `tsc --noEmit` passes on a fresh checkout.
 */
declare module "@kiwiply/ui/resume/thumbs/*.png" {
  const image: { src: string; width?: number; height?: number };
  export default image;
}
