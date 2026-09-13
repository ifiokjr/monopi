---
monopi-group: minor
---

# Add OpenCode Go quotas and accurate session pricing

Adds an `opencode` provider probe to the usage tracker that queries the OpenCode Go usage endpoint (`GET https://opencode.ai/zen/go/v1/usage`) with the workspace API key, surfacing the subscription's rolling 5-hour, weekly (7d), and monthly (30d) quota windows as percentage-left bars with reset countdowns. Keys are read from pi's `opencode-go`/`opencode` auth entries or `OPENCODE_API_KEY`; a 403 (Zen-only workspace) is reported as "Go subscription required" instead of an auth failure, and `opencode-go/*` models now attribute quota usage to the OpenCode card in the widget, dashboard, and `usage_report` output. Persisted Z.AI windows also survive restarts now that the rate-limit cache validator accepts them.

Fixes provider-catalog per-token pricing so session costs are accurate: `models.dev` rates were passed through an integer-only helper, rounding sub-dollar prices (e.g. `$0.60` input, `$0.003` cache reads) to `$0` and whole-dollar rates down to integers. Costs now keep their fractional values, `models.dev` context tiers are mapped onto pi's request-wide pricing tiers, and persisted model catalogs are re-priced from the catalog whenever a refresh runs.
