import type { ReactNode } from "react";
import Link from "next/link";
import { parsePolicy, type Block, type Inline } from "@/lib/ent/policy-markdown";

/**
 * Renders a tenant policy's Markdown subset (see `lib/ent/policy-markdown.ts`) to React elements: no `dangerouslySetInnerHTML`, no raw HTML,
 * links only where the parser allowed them. Colours come from the tenant CSS variables, so the text takes the organization's branding.
 */
function inline(nodes: Inline[]): ReactNode[] {
  return nodes.map((n, i) => {
    switch (n.t) {
      case "text":
        return n.v;
      case "bold":
        return <strong key={i}>{inline(n.c)}</strong>;
      case "italic":
        return <em key={i}>{inline(n.c)}</em>;
      case "link": {
        const external = n.href.startsWith("https://");
        const mail = n.href.toLowerCase().startsWith("mailto:");
        const cls = "font-medium text-accent-deep underline underline-offset-2 hover:opacity-80";
        if (external || mail || n.href.startsWith("#")) {
          return (
            <a key={i} href={n.href} className={cls} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
              {inline(n.c)}
            </a>
          );
        }
        return (
          <Link key={i} href={n.href} className={cls}>
            {inline(n.c)}
          </Link>
        );
      }
    }
  });
}

function block(b: Block, i: number): ReactNode {
  switch (b.t) {
    case "heading": {
      if (b.level === 1 && i === 0) return <h1 key={i} className="text-[28px] font-extrabold leading-tight tracking-tight text-ink">{inline(b.c)}</h1>;
      if (b.level === 1) return <h2 key={i} className="mt-8 text-[22px] font-bold leading-tight text-ink first:mt-0">{inline(b.c)}</h2>;
      if (b.level === 2) return <h3 key={i} className="mt-7 text-[17px] font-bold text-ink">{inline(b.c)}</h3>;
      return <h4 key={i} className="mt-5 text-[15px] font-bold text-ink">{inline(b.c)}</h4>;
    }
    case "p":
      return <p key={i} className="mt-3 text-[15px] leading-relaxed text-ink-soft">{inline(b.c)}</p>;
    case "ul":
      return (
        <ul key={i} className="mt-3 list-disc space-y-1.5 pl-6 text-[15px] leading-relaxed text-ink-soft">
          {b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}
        </ul>
      );
    case "ol":
      return (
        <ol key={i} className="mt-3 list-decimal space-y-1.5 pl-6 text-[15px] leading-relaxed text-ink-soft">
          {b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}
        </ol>
      );
  }
}

export default function PolicyMarkdown({ markdown, className }: { markdown: string; className?: string }) {
  return <div className={className} data-policy-body>{parsePolicy(markdown).map(block)}</div>;
}
