/**
<!-- {=repoDefaultInstallerPackagesDocs} -->

Default runtime/content packages installed by `npx @monopi/monopi`:

- `@monopi/extensions`
- `@monopi/background-tasks`
- `@monopi/diagnostics`
- `@monopi/subagents`
- `@monopi/web-remote`
- `@monopi/themes`
- `@monopi/skills`

<!-- {/repoDefaultInstallerPackagesDocs} -->
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

/**
<!-- {=repoExperimentalPackagesDocs} -->

Opt-in packages that stay separate from the default installer bundle:

- `@monopi/adaptive-routing`
- `@monopi/provider-catalog`
- `@monopi/provider-cursor`
- `@monopi/provider-ollama`
- `@monopi/bash-live-view`
- `@monopi/pretty`
- `@monopi/remote-tailscale`
- `@monopi/analytics-extension`

<!-- {/repoExperimentalPackagesDocs} -->
*/
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
