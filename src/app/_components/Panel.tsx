import type { ReactNode } from "react";

type PanelProps = {
  title: string;
  badge?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function Panel({
  title,
  badge,
  right,
  children,
  className = "",
}: PanelProps) {
  return (
    <section
      className={`flex flex-col rounded border border-zinc-800/80 bg-zinc-950/70 ${className}`}
    >
      <header className="flex items-center justify-between border-b border-zinc-800/80 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
            {title}
          </span>
          {badge}
        </div>
        {right ? (
          <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
            {right}
          </div>
        ) : null}
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </section>
  );
}

export function DirectionBadge({
  direction,
}: {
  direction: "LONG" | "SHORT" | "HOLD";
}) {
  const styles =
    direction === "LONG"
      ? "border-lime-400/40 bg-lime-400/10 text-lime-300"
      : direction === "SHORT"
        ? "border-rose-400/40 bg-rose-400/10 text-rose-300"
        : "border-amber-400/40 bg-amber-400/10 text-amber-300";
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.18em] ${styles}`}
    >
      {direction}
    </span>
  );
}

export function LiveDot({ on = true }: { on?: boolean }) {
  return (
    <span
      className={`inline-block h-1.5 w-1.5 rounded-full ${
        on ? "bg-lime-400 pulse-dot" : "bg-zinc-600"
      }`}
    />
  );
}
