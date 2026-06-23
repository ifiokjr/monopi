/**
 * Runtime-compatible package list for the monopi installer.
 *
 * Keep this file in sync with ./package-list.mts. The TypeScript source remains the canonical
 * authoring surface for repo tooling, while this `.mjs` bridge preserves direct Node execution for
 * `packages/monopi__monopi/bin/monopi.mjs` on Node 20.
 */
export const INSTALLER_PACKAGES = [
	"@monopi/extensions",
	"@monopi/background-tasks",
	"@monopi/diagnostics",
	"@monopi/subagents",
	"@monopi/themes",
	"@monopi/skills",
	"@monopi/web-remote",
];

export const EXPERIMENTAL_PACKAGES = [
	"@monopi/adaptive-routing",
	"@monopi/provider-catalog",
	"@monopi/provider-cursor",
	"@monopi/provider-ollama",
	"@monopi/bash-live-view",
	"@monopi/pretty",
	"@monopi/remote-tailscale",
	"@monopi/analytics-extension",
];

export const SWITCHER_PACKAGES = [...INSTALLER_PACKAGES, ...EXPERIMENTAL_PACKAGES];
