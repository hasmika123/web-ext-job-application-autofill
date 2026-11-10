"use client";

import { BriefcaseIcon, MemberAvatar, Sparkline, TrophyIcon, chartColor } from "@kiwiply/ui";
import { relativeTime } from "@/lib/ent/dashboard";
import { MONTH_PERIODS, matchTone, photoFor, rateText, type Streams, type TopConsultant } from "@/lib/ent/marketer-ws/performance";
import { CARD, CardSkeleton, Empty, HEAD_ROW, More, TH } from "../parts";
import { CardHead, Chip, INFO, PeriodSelect } from "./bits";
import { NO_NUMBERS } from "./Cards";
import Link from "next/link";

/** Results by client and Top performing consultants. */

export function StreamsCard({ data, period, onPeriod, loading }: { data: Streams | null; period: string; onPeriod: (p: string) => void; loading: boolean }) {
  return (
    <section data-perf-card="streams" className={CARD}>
      <CardHead icon={BriefcaseIcon} title="By client" info={INFO.streams}>
        <PeriodSelect value={period} onChange={onPeriod} options={MONTH_PERIODS} label="Streams period" width="w-[142px]" />
      </CardHead>
      {loading ? (
        <CardSkeleton />
      ) : !data || data.rows.length === 0 ? (
        <Empty>{NO_NUMBERS}</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[460px] text-left text-[13px]">
            <thead>
              <tr className={HEAD_ROW}>
                <th className={`${TH} rounded-l-lg`}>Client</th>
                <th className={`${TH} text-center`}>Submissions</th>
                <th className={`${TH} text-center`}>Interviews</th>
                <th className={`${TH} text-center`}>Offers</th>
                <th className={`${TH} text-center`}>Placements</th>
                <th className={`${TH} rounded-r-lg text-center`}>Offer rate</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.clientId} data-stream-row={r.client} className="border-b border-line last:border-0">
                  <td className="px-2 py-2 font-semibold text-ink">{r.client}</td>
                  <td className="px-2 text-center text-ink-soft">{r.submissions}</td>
                  <td className="px-2 text-center text-ink-soft">{r.interviews}</td>
                  <td className="px-2 text-center text-ink-soft">{r.offers}</td>
                  <td className="px-2 text-center text-ink-soft">{r.placements}</td>
                  <td className="px-2 text-center">
                    {r.offerRatePct === null ? <span className="text-muted">—</span> : <Chip tone={r.good ? "green" : "red"} data-offer-rate={r.good ? "good" : "low"}>{rateText(r.offerRatePct)}</Chip>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function TopCard({ rows, loading, viewAll, now }: { rows: TopConsultant[]; loading: boolean; viewAll: string | null; now: number }) {
  return (
    <section data-perf-card="top" className={CARD}>
      <CardHead icon={TrophyIcon} title="Top performing consultants" tint="amber" info={INFO.top}>
        {viewAll ? (
          <Link href={viewAll} className="inline-flex h-8 flex-none items-center rounded-lg border border-line bg-paper px-3 text-[12.5px] font-semibold text-accent-deep hover:bg-accent-soft">
            View all
          </Link>
        ) : null}
      </CardHead>
      {loading ? (
        <CardSkeleton rows={5} />
      ) : rows.length === 0 ? (
        <Empty>{NO_NUMBERS}</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead>
              <tr className={HEAD_ROW}>
                <th className={`${TH} w-8 rounded-l-lg`}>#</th>
                <th className={TH}>Consultant</th>
                <th className={`${TH} text-center`}>Submissions</th>
                <th className={`${TH} text-center`}>Interviews</th>
                <th className={`${TH} text-center`}>Offers</th>
                <th className={`${TH} text-center`}>Placements</th>
                <th className={`${TH} text-center`}>Match rate</th>
                <th className={TH}>Last activity</th>
                <th className={TH}>Trend</th>
                <th className={`${TH} rounded-r-lg`} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const tone = matchTone(r.matchRatePct);
                return (
                  <tr key={r.id} data-top-row={r.id} className="border-b border-line last:border-0">
                    <td className="px-2 py-2 text-ink-soft">{r.rank}</td>
                    <td className="px-2">
                      <span className="flex items-center gap-2.5 font-semibold text-ink">
                        <MemberAvatar name={r.name} src={photoFor(r.name, r.avatarUrl)} size={30} />
                        {r.name}
                      </span>
                    </td>
                    <td className="px-2 text-center text-ink-soft">{r.submissions}</td>
                    <td className="px-2 text-center text-ink-soft">{r.interviews}</td>
                    <td className="px-2 text-center text-ink-soft">{r.offers}</td>
                    <td className="px-2 text-center text-ink-soft">{r.placements}</td>
                    <td className="px-2 text-center">{tone === "none" ? <span className="text-muted">—</span> : <Chip tone={tone}>{r.matchRatePct}%</Chip>}</td>
                    <td className="whitespace-nowrap px-2 text-ink-soft">{r.lastActivityAt ? relativeTime(r.lastActivityAt, now) : "—"}</td>
                    <td className="px-2">
                      <div className="w-[84px]">
                        <Sparkline values={r.trend} color={chartColor(3)} />
                      </div>
                    </td>
                    <td className="px-1">
                      <More label={`More for ${r.name}`} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
