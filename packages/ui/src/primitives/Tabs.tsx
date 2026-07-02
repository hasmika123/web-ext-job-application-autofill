import { createContext, useContext, useId } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { cn } from "./cn";

/**
 * Tabs — an accessible, controlled tab set (roving-tabindex, arrow/Home/End nav, proper
 * tablist/tab/tabpanel roles). Controlled by design (`value` + `onValueChange`) so the host
 * owns state. Compose:
 *
 *   <Tabs value={tab} onValueChange={setTab}>
 *     <TabList>
 *       <Tab value="account">Account</Tab>
 *       <Tab value="ai">AI</Tab>
 *     </TabList>
 *     <TabPanel value="account">…</TabPanel>
 *     <TabPanel value="ai">…</TabPanel>
 *   </Tabs>
 */
interface TabsCtx {
  value: string;
  setValue: (v: string) => void;
  baseId: string;
}
const Ctx = createContext<TabsCtx | null>(null);

function useTabs(part: string): TabsCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error(`<${part}> must be used inside <Tabs>`);
  return ctx;
}

export interface TabsProps {
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}

export default function Tabs({ value, onValueChange, children, className }: TabsProps) {
  const baseId = useId();
  return (
    <Ctx.Provider value={{ value, setValue: onValueChange, baseId }}>
      <div className={className}>{children}</div>
    </Ctx.Provider>
  );
}

export function TabList({ children, className, "aria-label": ariaLabel }: {
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(e.key)) return;
    const tabs = Array.from(
      e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])'),
    );
    const current = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (current === -1) return;
    e.preventDefault();
    let next = current;
    if (e.key === "ArrowRight") next = (current + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (current - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    tabs[next]?.focus();
    tabs[next]?.click();
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn("inline-flex items-center gap-1 rounded-[var(--radius)] bg-paper-2 p-1", className)}
    >
      {children}
    </div>
  );
}

export function Tab({ value, children, disabled, className }: {
  value: string;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const { value: active, setValue, baseId } = useTabs("Tab");
  const selected = active === value;
  return (
    <button
      type="button"
      role="tab"
      id={`${baseId}-tab-${value}`}
      aria-selected={selected}
      aria-controls={`${baseId}-panel-${value}`}
      tabIndex={selected ? 0 : -1}
      disabled={disabled}
      onClick={() => setValue(value)}
      className={cn(
        "rounded-[var(--radius-sm)] px-3 py-1.5 text-[13px] font-semibold transition-colors " +
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
          "disabled:opacity-50 disabled:pointer-events-none",
        selected ? "bg-paper text-ink shadow-[var(--shadow-sm)]" : "text-muted hover:text-ink",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function TabPanel({ value, children, className }: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  const { value: active, baseId } = useTabs("TabPanel");
  if (active !== value) return null;
  return (
    <div
      role="tabpanel"
      id={`${baseId}-panel-${value}`}
      aria-labelledby={`${baseId}-tab-${value}`}
      tabIndex={0}
      className={cn("focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent", className)}
    >
      {children}
    </div>
  );
}
