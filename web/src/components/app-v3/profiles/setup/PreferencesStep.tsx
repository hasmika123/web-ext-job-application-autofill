"use client";

import PreferenceInputs, { type PreferenceQuestion } from "@/components/onboarding/preferences";

/**
 * The `/welcome` questions still unanswered, on one screen (every one optional). The self-identification
 * block is collapsed by default: it is offered, never pushed. Answers are held by the wizard and written
 * with everything else on finish, so skipping the screen costs nothing.
 */
export default function PreferencesStep({
  questions,
  answers,
  onChange,
}: {
  questions: PreferenceQuestion[];
  answers: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <div>
      <h2 className="font-display text-[20px] font-extrabold text-v2-navy">A few quick questions</h2>
      <p className="mt-1 text-[14px] text-v2-ink-soft">Only what a resume can&apos;t tell us. All optional, and Kiwiply learns the rest as you apply.</p>

      <div className="mt-5 flex flex-col gap-7">
        {questions.map((q, i) => {
          const id = `setup-q${i}`;
          const eeo = q.keys.includes("gender");
          const body = <PreferenceInputs question={q} answers={answers} onChange={onChange} labelledBy={id} idPrefix={`setup-${i}`} />;
          return eeo ? (
            <details key={q.title} className="rounded-2xl border border-v2-line/70 p-4">
              <summary id={id} className="cursor-pointer text-[15px] font-bold text-v2-navy max-sm:min-h-11">
                {q.title} <span className="font-normal text-v2-muted">(optional)</span>
              </summary>
              <p className="mt-2 text-[13px] text-v2-muted">{q.why}</p>
              <div className="mt-3">{body}</div>
            </details>
          ) : (
            <section key={q.title} aria-labelledby={id}>
              <h3 id={id} className="text-[15px] font-bold text-v2-navy">
                {q.title}
              </h3>
              <p className="mt-0.5 text-[13px] text-v2-muted">{q.why}</p>
              <div className="mt-3">{body}</div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
