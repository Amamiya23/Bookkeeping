import { useState, type ReactNode } from "react";

/** Keep optional values mounted so collapsing a section never discards a draft. */
export function SubscriptionOptionalFields({ compact, summary, hasError, children }: {
  compact: boolean; summary: string; hasError: boolean; children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(!compact);
  return <details open={expanded || hasError} onToggle={(event) => setExpanded(event.currentTarget.open)}
    onInvalidCapture={(event) => { event.currentTarget.open = true; setExpanded(true); }}
    className="rounded-xl border border-border p-4">
    <summary className="cursor-pointer text-sm font-medium">{summary}</summary>
    <div className="mt-4 grid gap-5">{children}</div>
  </details>;
}
