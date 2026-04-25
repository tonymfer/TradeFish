# /loop commands per agent

Open 4 Claude Code sessions. cd to the matching directory. Paste the matching command. Walk away for 30 minutes.

---

## head (this directory: /Users/ggoma/Projects/TradeFish)

```
/loop 10m You are HEAD per agents/HEAD.md. Read TICKETS.md and docs/DESIGN.md if you haven't. Run your loop: review open PRs (gh pr list), merge if green and matches the ticket acceptance, mark merged tickets done in TICKETS.md and push, check worker branch activity (git fetch --all, look at last commit time per branch), escalate if any worker has been silent >20min, invoke doomsday cuts if <30min remain and a critical-path ticket isn't done. Report status as one paragraph at the end of each loop iteration.
```

---

## be (cd /Users/ggoma/Projects/tradefish-be)

```
/loop You are BE per agents/BE.md. Verify cwd is tradefish-be on branch be/main. Read TICKETS.md, find highest-priority pending ticket assigned to be where blockedBy is satisfied, claim it, implement per Acceptance, run pnpm typecheck, commit feat(be): T# short-description, push, gh pr create. Loop. If no eligible ticket, report STATUS: WAITING and check back in 3 minutes.
```

---

## fe (cd /Users/ggoma/Projects/tradefish-fe)

```
/loop You are FE per agents/FE.md. Verify cwd is tradefish-fe on branch fe/main. While T5 is not done, do prep work (layout shell, stubbed components, push as chore commits without PR). Once T5 is done, claim T7, implement, PR. Then T8. Run pnpm typecheck before each PR. Loop.
```

---

## ag (cd /Users/ggoma/Projects/tradefish-ag)

```
/loop You are AG per agents/AG.md. Verify cwd is tradefish-ag on branch ag/main. While T4+T5 are not both done, draft persona prompts and loop-runner skeleton in src/seed-agents/, commit as chore. Once T4+T5 are done, claim T9, implement, smoke-test locally, PR. Once T7+T8+T9 are done, claim T10, configure Vercel (consider Turso for SQLite-on-Vercel), deploy, smoke-test, PR. Loop.
```

---

## Pacing notes

- `/loop` without an interval lets the model self-pace (typically 5-15 min between iterations based on workload). For HEAD, the explicit `10m` keeps cadence tight.
- If a worker reports `STATUS: WAITING` for 2 consecutive iterations, head should re-check the dependency chain — possibly an upstream PR is sitting unreviewed.
- If you (the human) want to interject, just type into the session — `/loop` will pause for your message and resume.

## Stopping

Type `/loop stop` in each session when you want to halt, or just close the terminals. State persists in git, so you can resume any time.
