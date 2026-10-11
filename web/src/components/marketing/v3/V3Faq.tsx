import { ChatIcon, XIcon } from "@kiwiply/ui";

/**
 * "Frequently asked questions" (phone board): the five questions as a native `<details>` accordion
 * (keyboard and screen-reader support for free, no JS). Answers keep to what the product does:
 * Kiwiply fills applications and the person reviews and submits.
 */
const FAQS: { q: string; a: string }[] = [
  {
    q: "Is Kiwiply free to use?",
    a: "Yes. The Free plan includes core autofill. You can upgrade any time for more resumes and AI tools; see Pricing for the details.",
  },
  {
    q: "Which job sites does it work on?",
    a: "Kiwiply works on the major applicant-tracking systems, including Workday, Greenhouse, Lever, Ashby and Workable, and on many company career pages built on them.",
  },
  {
    q: "How does AI autofill work?",
    a: "Kiwiply reads the application form, matches each field to your profile and the best resume, and fills it in. You review everything and press submit yourself.",
  },
  {
    q: "Can I use my own resume?",
    a: "Yes. Upload your resume and Kiwiply builds your profile from it. You can keep several resumes and it picks the best fit for each job.",
  },
  {
    q: "Is there an organization plan?",
    a: "Yes. Organizations can support many people's job searches in one place, with team tracking and reporting. Get in touch for a demo.",
  },
];

export default function V3Faq() {
  return (
    <section id="faq" aria-labelledby="v3-faq-title" className="scroll-mt-20 px-5 py-12 lg:px-8 lg:py-16">
      <div className="mx-auto max-w-[760px]">
        <h2 id="v3-faq-title" className="flex items-center gap-3 text-[28px] text-v2-navy md:text-[34px]">
          <ChatIcon aria-hidden className="h-8 w-8 flex-none text-v2-green" />
          Frequently asked questions
        </h2>
        <div className="mt-7 space-y-3">
          {FAQS.map((f) => (
            <details key={f.q} className="group rounded-[16px] border border-v2-line/70 bg-white shadow-sm open:shadow-v2-card">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-[16px] px-5 py-3 text-[15px] font-semibold text-v2-navy marker:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-green [&::-webkit-details-marker]:hidden">
                {f.q}
                <XIcon aria-hidden className="h-4 w-4 flex-none rotate-45 text-v2-navy transition-transform group-open:rotate-0" />
              </summary>
              <p className="px-5 pb-5 text-[14.5px] leading-relaxed text-v2-ink-soft">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
