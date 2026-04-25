#!/usr/bin/env bash
# Spin up 3 worker worktrees for parallel hackathon execution.
# Run from the TradeFish repo root.
#
# After this completes:
#   1. Open 4 Claude Code sessions, one in each of these directories:
#        head: /Users/ggoma/Projects/TradeFish        (this dir, on main)
#        be:   /Users/ggoma/Projects/tradefish-be     (branch be/main)
#        fe:   /Users/ggoma/Projects/tradefish-fe     (branch fe/main)
#        ag:   /Users/ggoma/Projects/tradefish-ag     (branch ag/main)
#   2. In each session, paste the matching /loop command from agents/LOOP.md.

set -euo pipefail

ROOT=$(git rev-parse --show-toplevel)
PARENT=$(dirname "$ROOT")

cd "$ROOT"

# Ensure docs/DESIGN.md is a fresh copy of the design doc so each worktree has it
mkdir -p docs
cp /Users/ggoma/.gstack/projects/tonymfer-TradeFish/ggoma-main-design-20260424-204210.md docs/DESIGN.md
echo "✓ docs/DESIGN.md updated"

# Commit current state so worktrees branch from a known point
git add -A
git diff --cached --quiet || git commit -m "chore: hackathon kickoff — TICKETS.md, agents/, docs/DESIGN.md"
git push -u origin main 2>/dev/null || true

# Create the 3 worker branches + worktrees
for AGENT in be fe ag; do
  WT_PATH="$PARENT/tradefish-$AGENT"
  BRANCH="$AGENT/main"

  if [ -d "$WT_PATH" ]; then
    echo "⚠  $WT_PATH already exists — skipping"
    continue
  fi

  git branch "$BRANCH" main 2>/dev/null || true
  git worktree add "$WT_PATH" "$BRANCH"
  echo "✓ $AGENT worktree at $WT_PATH on branch $BRANCH"
done

echo ""
echo "═══════════════════════════════════════════════════════════"
echo " Worktrees ready. Open 4 Claude Code sessions:"
echo ""
echo "   head: $ROOT"
echo "   be:   $PARENT/tradefish-be"
echo "   fe:   $PARENT/tradefish-fe"
echo "   ag:   $PARENT/tradefish-ag"
echo ""
echo " Then paste the matching /loop command from agents/LOOP.md."
echo "═══════════════════════════════════════════════════════════"
