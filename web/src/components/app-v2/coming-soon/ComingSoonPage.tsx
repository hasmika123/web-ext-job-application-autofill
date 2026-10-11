import { COMING_SOON } from "../sample-data.pages";
import { HeroArt, MascotCard, PageHero } from "../local";

export type ComingSoonSlug = keyof typeof COMING_SOON;

/**
 * One component behind /ai-tools, /insights, /messages, /companies, /networking and /learning
 * (no boards exist for them): the shared hero plus a "Coming soon" mascot card. The copy lives
 * in `sample-data.pages.ts` so the six routes stay one line each.
 */
export default function ComingSoonPage({ slug }: { slug: ComingSoonSlug }) {
  const page = COMING_SOON[slug];
  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-5">
      <PageHero
        title={page.title}
        subtitle={page.subtitle}
        art={<HeroArt mascot={page.mascot} note={page.note} />}
      />
      <div className="grid gap-5 md:grid-cols-[minmax(0,420px)_1fr]">
        <MascotCard
          title="Coming soon"
          body="We're building this page. In the meantime, your job search, saved jobs and applications are ready for you."
          cta={{ label: "Go to My Applications", href: "/applications" }}
          mascot={page.mascot}
          mascotHeight={104}
        />
      </div>
    </div>
  );
}
