"use client";

import { useState } from "react";
import { Button, CalendarIcon, ChevronDownIcon, Input, Popover } from "@kiwiply/ui";
import { rangeLabel, rangePresets } from "@/lib/ent/marketer-ws/activity";

/** The "Oct 1, 2024 - Oct 31, 2024" picker of the filter row: month / week presets plus a free From / To (UTC days, as the API counts them). */
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
          className="flex h-10 w-full items-center gap-2 rounded-[10px] border border-line bg-paper px-3 text-[13.5px] font-medium text-ink hover:border-accent"
        >
          <CalendarIcon size={16} className="flex-none text-ink-soft" />
          <span className="min-w-0 flex-1 truncate text-left">{rangeLabel(from, to)}</span>
          <ChevronDownIcon size={15} className="flex-none text-muted" />
        </button>
      )}
    >
      {({ close }) => (
        <Panel
          from={from}
          to={to}
          onApply={(f, t) => {
            onChange(f, t);
            close();
          }}
        />
      )}
    </Popover>
  );
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function Panel({ from, to, onApply }: { from: string; to: string; onApply: (from: string, to: string) => void }) {
  const [a, setA] = useState(from);
  const [b, setB] = useState(to);
  const presets = rangePresets(new Date());
  const ordered = DAY.test(a) && DAY.test(b) && a <= b;
  const tooLong = ordered && (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000 >= 366;
  const valid = ordered && !tooLong;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button key={p.label} type="button" onClick={() => onApply(p.from, p.to)} className="h-8 rounded-lg border border-line px-2.5 text-[12.5px] font-semibold text-accent-deep hover:bg-accent-soft">
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
      {!ordered ? <p className="text-[12px] text-muted">Pick a start date that is not after the end date.</p> : null}
      {tooLong ? <p className="text-[12px] text-muted">A range can span at most one year.</p> : null}
      <Button size="sm" variant="primary" disabled={!valid} onClick={() => onApply(a, b)}>
        Apply
      </Button>
    </div>
  );
}
