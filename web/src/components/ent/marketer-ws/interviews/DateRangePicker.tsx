"use client";

import { useState } from "react";
import { Button, CalendarIcon, ChevronDownIcon, Input, Popover } from "@kiwiply/ui";
import { addDays, parseYmd, rangeLabel, weekRange, ymd } from "@/lib/ent/marketer-ws/interviews";

/** The "Apr 21 – Apr 27, 2024" picker of the Interview Schedule card: week presets plus a free From / To. */
export default function DateRangePicker({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  return (
    <Popover
      label="Date range"
      panelClassName="w-[300px] p-3"
      trigger={(t) => (
        <button
          type="button"
          ref={t.ref}
          {...t.props}
          aria-label={`Date range: ${rangeLabel(from, to)}`}
          className="flex h-10 items-center gap-2 rounded-[10px] border border-line bg-paper px-3 text-[13.5px] font-medium text-ink hover:border-accent"
        >
          <CalendarIcon size={16} className="flex-none text-ink-soft" />
          <span className="whitespace-nowrap">{rangeLabel(from, to)}</span>
          <ChevronDownIcon size={15} className="flex-none text-muted" />
        </button>
      )}
    >
      {({ close }) => <Panel from={from} to={to} onApply={(f, t) => { onChange(f, t); close(); }} />}
    </Popover>
  );
}

function Panel({ from, to, onApply }: { from: string; to: string; onApply: (from: string, to: string) => void }) {
  const [a, setA] = useState(from);
  const [b, setB] = useState(to);
  const today = new Date();
  const presets: { label: string; range: { from: string; to: string } }[] = [
    { label: "This week", range: weekRange(today) },
    { label: "Last week", range: weekRange(addDays(today, -7)) },
    { label: "Next week", range: weekRange(addDays(today, 7)) },
    { label: "Next 30 days", range: { from: ymd(today), to: ymd(addDays(today, 30)) } },
  ];
  const valid = parseYmd(a) !== null && parseYmd(b) !== null && a <= b;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button key={p.label} type="button" onClick={() => onApply(p.range.from, p.range.to)} className="h-8 rounded-lg border border-line px-2.5 text-[12.5px] font-semibold text-accent-deep hover:bg-accent-soft">
            {p.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink-soft">
          From
          <Input type="date" value={a} onChange={(e) => setA(e.target.value)} aria-label="From date" />
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink-soft">
          To
          <Input type="date" value={b} onChange={(e) => setB(e.target.value)} aria-label="To date" />
        </label>
      </div>
      {!valid ? <p className="text-[12px] text-muted">Pick a start date that is not after the end date.</p> : null}
      <Button size="sm" variant="primary" disabled={!valid} onClick={() => onApply(a, b)}>
        Apply
      </Button>
    </div>
  );
}
