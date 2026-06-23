export const compiledPackages = [
	{ dir: "packages/monopi__core", name: "@monopi/core" },
	{ dir: "packages/monopi__cli", name: "@monopi/cli" },
	{ dir: "packages/monopi__web-client", name: "@monopi/web-client" },
	{ dir: "packages/monopi__web-server", name: "@monopi/web-server" },
];

export const publishedPackages = [
	...compiledPackages,
	{
		dir: "packages/monopi__adaptive-routing",
		name: "@monopi/adaptive-routing",
	},
	{ dir: "packages/monopi__agents", name: "@monopi/agents" },
	{ dir: "packages/monopi__analytics-db", name: "@monopi/analytics-db" },
	{ dir: "packages/monopi__analytics-extension", name: "@monopi/analytics-extension" },
	{ dir: "packages/monopi__background-tasks", name: "@monopi/background-tasks" },
	{ dir: "packages/monopi__provider-cursor", name: "@monopi/provider-cursor" },
	{ dir: "packages/monopi__diagnostics", name: "@monopi/diagnostics" },
	{ dir: "packages/monopi__extensions", name: "@monopi/extensions" },
	{ dir: "packages/monopi__monopi", name: "@monopi/monopi" },
	{ dir: "packages/monopi__provider-ollama", name: "@monopi/provider-ollama" },
	{ dir: "packages/monopi__bash-live-view", name: "@monopi/bash-live-view" },
	{ dir: "packages/monopi__pretty", name: "@monopi/pretty" },
	{ dir: "packages/monopi__remote-tailscale", name: "@monopi/remote-tailscale" },
	{ dir: "packages/monopi__provider-catalog", name: "@monopi/provider-catalog" },
	{ dir: "packages/monopi__shared-qna", name: "@monopi/shared-qna" },
	{ dir: "packages/monopi__skills", name: "@monopi/skills" },
	{ dir: "packages/monopi__subagents", name: "@monopi/subagents" },
	{ dir: "packages/monopi__themes", name: "@monopi/themes" },
	{ dir: "packages/monopi__web-remote", name: "@monopi/web-remote" },
];
