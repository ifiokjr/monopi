---
monopi-group: minor
---

# Add quota failover for mirrored models to adaptive routing

Adds a `quotaFailover` section to adaptive routing that switches to the *same* model on another provider when the active provider's quota runs out. Mirror sets (e.g. `ollama-cloud/glm-5.3-flash` ↔ `zai/glm-5.3-flash` ↔ `opencode-go/glm-5.3-flash`) are declared explicitly in config or auto-derived from identical model ids across providers, and the resolver picks the healthiest mirror once the active provider's most-constrained window (5h or weekly, from the usage tracker's broadcast) drops to `switchBelowPct`, returning home when it recovers. Switches apply at turn start in `auto` mode (notify-only in `shadow`), respect manual `/route lock`, and a new `/route failover` command shows each set's live quota and the current decision. Also fixes the `usage:limits` consumer to read `windows[].percentLeft` (with `probedAt` staleness), which previously left provider quota permanently "unknown" to the router.
