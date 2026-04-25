import type { ReactNode } from "react";

/**
 * Generic terminal-chrome panel wrapper. Used by sub-views that need a
 * box with a header strip; for the question.html layout (timeline +
 * side rail), prefer `panel-hd` class directly.
 */
interface PanelProps {
  title: string;
  badge?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Panel({
  title,
  badge,
  right,
  children,
  className = "",
}: PanelProps) {
  return (
    <section className={`tf-card flex flex-col ${className}`.trim()}>
      <header className="panel-hd flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="ttl">{title}</span>
          {badge}
        </div>
        {right ? <div className="meta">{right}</div> : null}
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </section>
  );
}

interface DirectionBadgeProps {
  direction: "LONG" | "SHORT" | "HOLD";
}

export function DirectionBadge({ direction }: DirectionBadgeProps) {
  const cls = direction === "LONG" ? "l" : direction === "SHORT" ? "s" : "h";
  return <span className={`pcard-badge pchip ${cls}`}>{direction}</span>;
}

interface LiveDotProps {
  on?: boolean;
  state?: "live" | "connecting" | "degraded";
}

export function LiveDot({ on = true, state }: LiveDotProps) {
  // When `state` is provided, render an inline dot whose color reflects
  // the connection status; otherwise fall back to the legacy boolean.
  if (state) {
    const color =
      state === "live"
        ? "var(--cyan)"
        : state === "connecting"
          ? "var(--fg-faint)"
          : "var(--amber)";
    return (
      <span
        aria-hidden="true"
        style={{
          display: "inline-block",
          width: 6,
          height: 6,
          borderRadius: "var(--r-pill)",
          background: color,
          boxShadow: state === "live" ? "0 0 8px var(--cyan)" : "none",
        }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: 6,
        height: 6,
        borderRadius: "var(--r-pill)",
        background: on ? "var(--cyan)" : "var(--fg-faintest)",
        boxShadow: on ? "0 0 8px var(--cyan)" : "none",
      }}
    />
  );
}
