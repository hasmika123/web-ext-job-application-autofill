"use client";

import { CheckIcon, Input, MoneyText, XCircleIcon, cn } from "@kiwiply/ui";
import type { PreviewSeats } from "@/lib/admin-plans";

/**
 * The organization half of the preview (04 section 9): the seat base, every preset priced as ONE seat with its "above individual"
 * result (a preset below the individual plans shows the sum it must reach), and a roster ("5 base, 3 RESUME_AI_SUPPORT" typed as
 * `[5]BASE,[3]RESUME_AI_SUPPORT`) with the organization's recurring total and the setup fee. All amounts are the API's.
 */
export default function RosterPreview({ seats, currency, roster, onRoster }: { seats: PreviewSeats; currency: string; roster: string; onRoster: (r: string) => void }) {
  return (
    <div className="space-y-3 text-[13px]">
      {seats.seatBaseMinor != null && (
        <p>
          Base seat: <MoneyText minor={seats.seatBaseMinor} currency={currency} className="font-semibold" />
        </p>
      )}
      {seats.presets.length > 0 && (
        <table className="w-full text-left">
          <caption className="sr-only">Presets as one seat</caption>
          <thead className="text-[11.5px] uppercase tracking-wide text-v2-muted">
            <tr>
              <th scope="col" className="pb-1 pr-2 font-semibold">
                Preset
              </th>
              <th scope="col" className="pb-1 pr-2 font-semibold">
                Seat total
              </th>
              <th scope="col" className="pb-1 font-semibold">
                Above individual
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {seats.presets.map((p) => (
              <tr key={p.key} data-preset={p.key} data-ok={p.aboveIndividualOk}>
                <th scope="row" className="py-1.5 pr-2 align-top font-semibold">
                  {p.key}
                </th>
                <td className="py-1.5 pr-2 align-top tabular-nums">
                  <MoneyText minor={p.seatTotalMinor} currency={currency} />
                </td>
                <td className="py-1.5 align-top">
                  <span className={cn("inline-flex items-center gap-1 font-semibold", p.aboveIndividualOk ? "text-accent-deep" : "text-danger-text")}>
                    {p.aboveIndividualOk ? <CheckIcon size={14} aria-hidden /> : <XCircleIcon size={14} aria-hidden />}
                    {p.aboveIndividualOk ? "Pass" : "Below"}
                  </span>
                  {!p.aboveIndividualOk && p.individualMonthMinor != null && (
                    <span className="block text-[12px] text-danger-text">
                      must reach <MoneyText minor={p.individualMonthMinor} currency={currency} className="font-semibold" /> (the individual plans)
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div>
        <label htmlFor="roster-input" className="mb-1 block text-[12.5px] font-semibold text-ink">
          Sample roster
        </label>
        <Input id="roster-input" value={roster} onChange={(e) => onRoster(e.target.value)} placeholder="[5]BASE,[3]RESUME_AI_SUPPORT,[1]FULL_CAREER_SUPPORT" aria-describedby="roster-hint" />
        <p id="roster-hint" className="mt-1 text-[11.5px] text-v2-muted">
          Counts in brackets, then BASE or a preset key. Blank uses the server&apos;s sample roster.
        </p>
      </div>
      {seats.roster && (
        <div aria-live="polite">
          <ul className="space-y-0.5">
            {seats.roster.lines.map((l) => (
              <li key={l.token} className="flex justify-between gap-2 tabular-nums">
                <span>
                  {l.count} × {l.token}
                </span>
                <MoneyText minor={l.lineTotalMinor} currency={currency} />
              </li>
            ))}
          </ul>
          <p className="mt-1 flex justify-between gap-2 border-t border-line pt-1 font-semibold">
            <span>Organization recurring</span>
            <MoneyText minor={seats.roster.orgRecurringMinor} currency={currency} />
          </p>
          {seats.roster.setupFeeMinor != null && (
            <p className="flex justify-between gap-2">
              <span>Setup fee (one time)</span>
              <MoneyText minor={seats.roster.setupFeeMinor} currency={currency} />
            </p>
          )}
        </div>
      )}
    </div>
  );
}
