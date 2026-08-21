# @monopi/extension-usage-tracker

<!-- {=extensionsUsageTrackerOverview} -->

The usage-tracker extension is a CodexBar-inspired provider quota and cost monitor for pi. It shows provider-level rate limits for Anthropic, OpenAI, and Google using pi-managed auth, while also tracking per-model token usage and session costs locally.

<!-- {/extensionsUsageTrackerOverview} -->

## Install

```bash
pi install npm:@monopi/extension-usage-tracker
```

<!-- {=extensionsUsageTrackerPersistenceDocs} -->

Usage-tracker persists rolling 30-day cost history and the last known provider rate-limit snapshot under the pi agent directory. That lets the widget and dashboard survive restarts and keep showing recent subscription windows when a live provider probe is temporarily rate-limited or unavailable.

<!-- {/extensionsUsageTrackerPersistenceDocs} -->

<!-- {=extensionsUsageTrackerCommandsDocs} -->

Key usage-tracker surfaces:

- widget above the editor for at-a-glance quotas and session totals
- `/usage` for the full dashboard overlay
- `Ctrl+Shift+U` as a shortcut for the same overlay
- `/usage-toggle` to show or hide the widget
- `/usage-refresh` to force fresh provider probes
- `usage_report` so the agent can answer quota and spend questions directly

<!-- {/extensionsUsageTrackerCommandsDocs} -->

## Attribution

This extension is inspired by [CodexBar](https://github.com/jamesmoriarty/codexbar) and adapted from the upstream usage tracker in [`mitsuhiko/agent-stuff`](https://github.com/mitsuhiko/agent-stuff). Adapted upstream code is Copyright Armin Ronacher and contributors and licensed under Apache-2.0. Monopi package metadata and surrounding repository files remain MIT licensed.
