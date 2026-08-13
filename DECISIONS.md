# DECISIONS

> Lightweight decision log for product direction and architecture trade-offs.

## D-001: Re-center product identity (oh-pi first, subagents for complex tasks)

- **Date:** 2026-02-24
- **Status:** Accepted

### Context

- subagents provide chains, parallel execution, and built-in agents.
- New users mostly arrive for "one-command setup", not multi-agent orchestration.
- Current risk is positioning drift: users may confuse installer value with advanced swarm value.

### Decision

1. Keep **oh-pi** as the primary product identity: setup, onboarding, and immediate usability.

### Consequences

- Better first-run clarity and lower cognitive load for new users.
- Complex tasks use subagent chains and parallel execution, but through explicit opt-in mental model.
- Short-term downside: some deep architecture content becomes less prominent on the first screen.

### Follow-ups

- Add explicit anti-corruption layer plan for pi SDK coupling in `spawner` path.
- Revisit this decision after early growth metrics (activation + retention) are stable.

---

## D-002: Growth focus on one language community first

- **Date:** 2026-02-24
- **Status:** Accepted

### Context

- Documentation is already multi-language, but community traction is still early.
- Spreading effort across many channels too soon risks shallow outcomes.

### Decision

- Prioritize one core developer community first (currently Chinese developer channels), while keeping multilingual docs available.

### Consequences

- Better signal concentration and tighter feedback loop.
- Non-priority language communities may get slower narrative updates initially.

---

## D-003: Introduce an SDK boundary before deeper optimization

- **Date:** 2026-02-24
- **Status:** Accepted

### Context

- `spawner` directly depends on multiple pi SDK APIs, increasing upstream change risk.
- Further optimization without a clear boundary would amplify maintenance cost.

### Decision

Introduce a narrow adapter between subagent execution and the pi SDK before adding deeper scheduling optimizations.

### Consequences

- Near-term refactor overhead increases, but change risk is localized long-term.
- SDK upgrades should mostly be absorbed in the adapter layer, not subagent scheduling logic.
