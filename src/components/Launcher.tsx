"use client";

import { useState, type FormEvent } from "react";

/**
 * Hero prompt launcher: market-question input + 6-agent roster picker
 * + try-this examples. On submit, navigates to `/arena?q=...&agents=...`
 * (the arena route is built in a later commit).
 */

interface RosterAgent {
  id: string;
  name: string;
  tier: "WHALE" | "SHARK" | "TUNA" | "MINNOW";
  color: string;
}

const ROSTER: readonly RosterAgent[] = [
  { id: "nansen", name: "NANSEN", tier: "WHALE", color: "#a8d8e8" },
  { id: "bngun", name: "BNGUN", tier: "SHARK", color: "#c4ecf5" },
  { id: "flock", name: "FLOCK", tier: "SHARK", color: "#92c8e0" },
  { id: "pcs", name: "PCS", tier: "TUNA", color: "#7ab2cc" },
  { id: "risk", name: "RISK", tier: "TUNA", color: "#ffb84a" },
  { id: "virtuals", name: "VIRTUALS", tier: "MINNOW", color: "#e07560" },
];

const EXAMPLES = [
  {
    label: "BTC 60m direction",
    query: "BTC next 60 minutes — direction & size?",
  },
  { label: "ETH/BTC cross", query: "ETH/BTC ratio — long or short the cross?" },
  { label: "SOL breakout", query: "SOL breakout above $180 — fade or follow?" },
  { label: "Memecoin 4h", query: "Best memecoin trade for the next 4 hours?" },
];

const DEFAULT_QUERY = "BTC next 60 minutes — direction & size?";

export function Launcher() {
  const [query, setQuery] = useState("");
  const [enlisted, setEnlisted] = useState<Set<string>>(
    () => new Set(ROSTER.map((agent) => agent.id)),
  );

  const toggleAgent = (id: string) => {
    setEnlisted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      // Never empty — keep at least one
      if (next.size === 0) next.add(id);
      return next;
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const finalQuery = query.trim() || DEFAULT_QUERY;
    const agents = Array.from(enlisted).join(",");
    const url = `/arena?q=${encodeURIComponent(finalQuery)}&agents=${encodeURIComponent(agents)}`;
    window.location.href = url;
  };

  return (
    <div className="launcher">
      <form className="prompt-box" onSubmit={handleSubmit}>
        <span className="caret" aria-hidden="true">
          ▸
        </span>
        <span className="label">PROMPT</span>
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="ask the swarm anything — e.g. BTC next 60 minutes, direction & size?"
          autoComplete="off"
          aria-label="Market question"
        />
        <button type="submit">
          LAUNCH ARENA <span className="arr">→</span>
        </button>
      </form>

      <div className="examples">
        <span className="lbl">▸ TRY</span>
        {EXAMPLES.map((example) => (
          <button
            key={example.label}
            className="ex"
            type="button"
            onClick={() => setQuery(example.query)}
          >
            {example.label}
          </button>
        ))}
      </div>

      <div className="roster">
        <div className="head">
          <span className="ttl">▸ DRAFT YOUR SWARM</span>
          <span>
            <span className="cnt">{enlisted.size}</span> / {ROSTER.length}{" "}
            ENLISTED
          </span>
        </div>
        <div className="roster-grid">
          {ROSTER.map((agent) => {
            const active = enlisted.has(agent.id);
            return (
              <button
                key={agent.id}
                type="button"
                className={`agent-pill${active ? " active" : ""}`}
                onClick={() => toggleAgent(agent.id)}
                aria-pressed={active}
              >
                <span className="check" aria-hidden="true">
                  ✓
                </span>
                <span
                  className="swatch"
                  style={{ background: agent.color }}
                  aria-hidden="true"
                />
                <span className="name">{agent.name}</span>
                <span className="tier">{agent.tier}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
