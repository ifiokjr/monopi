# @monopi/adaptive-routing

Optional adaptive routing package for pi.

## Install

```bash
pi install npm:@monopi/adaptive-routing
```

This package is intentionally separate from `@monopi/monopi` so users can opt into routing behavior explicitly.

## What it does

- adds `/route` controls for shadow and auto routing
- persists local routing telemetry
- exposes delegated routing categories that subagents can read from startup config
- lets you describe provider assignments by category instead of hard-coding Anthropic/OpenAI defaults into agents
- switches to an identical model on another provider when the active provider's quota runs out (`quotaFailover`)

## Quota failover

When the active model belongs to a mirror set and its provider's most-constrained quota window (5h or weekly, whichever is lower — from the usage tracker's `usage:limits` broadcast) drops to `switchBelowPct`, adaptive routing switches to the same model on a provider that still has at least `requireMirrorAbovePct` remaining, and returns to the home entry once it recovers. Switches apply at turn start in `auto` mode; `shadow` only suggests. A manual `/route lock` pins the model and suspends failover.

```json
{
	"quotaFailover": {
		"enabled": true,
		"autoMirror": false,
		"mirrorSets": [["ollama-cloud/glm-5.3-flash", "zai/glm-5.3-flash", "opencode-go/glm-5.3-flash"]],
		"switchBelowPct": 5,
		"requireMirrorAbovePct": 20,
		"returnHome": true,
		"onUnknownQuota": "stay",
		"staleAfterMinutes": 10
	}
}
```

- `mirrorSets` — ordered sets of full model ids; the first entry is home. With `autoMirror: true`, additional sets are derived automatically from identical model ids across authenticated providers.
- `switchBelowPct` / `requireMirrorAbovePct` — the exhaustion cliff and the minimum quota a mirror must have.
- `onUnknownQuota: "stay"` — never fail over on missing or stale quota snapshots (`staleAfterMinutes`).

Inspect the current state with `/route failover`.

## Config

Config lives at:

```text
~/.pi/agent/extensions/adaptive-routing/config.json
```

In addition to prompt routing, the config can declare delegated categories for startup model assignment:

```json
{
	"delegatedRouting": {
		"enabled": true,
		"categories": {
			"quick-discovery": {
				"preferredProviders": ["google", "openai"],
				"fallbackGroup": "cheap-router",
				"taskProfile": "planning",
				"preferFastModels": true
			},
			"implementation-default": {
				"preferredProviders": ["openai", "google"],
				"taskProfile": "coding",
				"minContextWindow": 64000
			},
			"review-critical": {
				"preferredProviders": ["openai", "google"],
				"fallbackGroup": "peak-reasoning",
				"taskProfile": "planning",
				"minContextWindow": 128000,
				"requireReasoning": true
			},
			"visual-engineering": {
				"preferredProviders": ["google", "openai"],
				"fallbackGroup": "design-premium",
				"taskProfile": "design",
				"minContextWindow": 128000
			}
		}
	},
	"delegatedModelSelection": {
		"disabledProviders": ["cursor"],
		"preferLowerUsage": true,
		"allowSmallContextForSmallTasks": true,
		"roleOverrides": {
			"subagent:planner": {
				"preferredModels": ["google/gemini-3.1-pro", "openai/gpt-5.4"]
			},
			"subagent:scout": {
				"preferredModels": ["openai/gpt-5-mini"],
				"preferFastModels": true
			}
		}
	}
}
```

Subagents use these categories only when they do not already have an explicit runtime or per-role model override. The delegated selector is runtime-aware: it filters down to currently available models, applies provider/model disable lists, prefers higher-headroom providers when usage data is available, and uses context-fit plus public benchmark metadata to rank candidates.

Use `/route why ...` to inspect a delegated pick for a specific category or role override and see the ranked reasons plus rejected candidates.

## Commands

Primary commands:

- `/route status`
- `/route shadow`
- `/route auto`
- `/route off`
- `/route explain`
- `/route assignments`
- `/route why <category|role-override> [task text]`
- `/route stats`

Alias commands are also registered in `route:<subcommand>` form, for example:

- `/route status`
- `/route shadow`
- `/route auto`
- `/route off`
- `/route explain`
- `/route assignments`
- `/route why quick-discovery scan the repo`
- `/route stats`
