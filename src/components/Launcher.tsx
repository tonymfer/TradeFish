"use client";

import { useState, type FormEvent } from "react";

/**
 * Hero prompt launcher: market-question input + try-this examples.
 * On submit, POSTs to `/api/rounds/create` and navigates to
 * `/arena?fresh=1` so the arena entrance plays the round-intro overlay.
 */

const EXAMPLES = [
  {
    label: "BTC 60s direction",
    query: "BTC up or down in the next 60 seconds?",
  },
  {
    label: "SOL $200 break",
    query: "Will SOL break $200 by minute close?",
  },
  {
    label: "ETH momentum",
    query: "ETH next minute — momentum or reversion?",
  },
  {
    label: "BTC vs ETH",
    query: "BTC vs ETH next 60s — which wins?",
  },
];

export function Launcher() {
  const [query, setQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      setError("Type a market question to launch a round.");
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/rounds/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionText: trimmed }),
      });

      if (!res.ok) {
        throw new Error(`create failed (${res.status})`);
      }

      window.location.href = "/arena?fresh=1";
    } catch (err) {
      console.error("[launcher] create round failed", err);
      setError("Couldn't launch the round. Try again in a moment.");
      setSubmitting(false);
    }
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
          placeholder="ask the swarm anything — e.g. BTC up or down in the next 60 seconds?"
          autoComplete="off"
          aria-label="Market question"
          maxLength={280}
          disabled={submitting}
        />
        <button type="submit" disabled={submitting}>
          {submitting ? "LAUNCHING…" : "LAUNCH ROUND"}{" "}
          <span className="arr">→</span>
        </button>
      </form>

      {error ? <p className="launcher-error">{error}</p> : null}

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
    </div>
  );
}
