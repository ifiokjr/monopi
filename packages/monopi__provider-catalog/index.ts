import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
	ProviderConfig,
} from "@earendil-works/pi-coding-agent";
/* C8 ignore file */

import { readStoredCredential } from "@earendil-works/pi-coding-agent";
import { Container, fuzzyFilter, Input, Spacer, TruncatedText } from "@earendil-works/pi-tui";

import type { ProviderCatalogCredentials, ProviderCatalogModel } from "./catalog.js";
import type { SupportedProviderDefinition } from "./config.js";

import { createApiKeyOAuthProvider, refreshProviderCredential, refreshProviderCredentialModels } from "./auth.js";
import { getCatalogModels, getCredentialModels, resolveProviderModels } from "./catalog.js";
import { getEnvApiKey, resolveApiKeyConfig, SUPPORTED_PROVIDERS } from "./config.js";

type ProviderModelRegistry = Pick<ExtensionContext["modelRegistry"], "refresh" | "registerProvider">;

interface ProviderRegistrar {
	registerProvider(name: string, config: ProviderConfig): void;
}

interface ProviderRegistryContext {
	modelRegistry: ProviderModelRegistry;
}

interface ProviderCommandContext {
	modelRegistry: ProviderModelRegistry;
	ui: Pick<ExtensionCommandContext["ui"], "custom" | "input" | "notify" | "select" | "setEditorText">;
}

interface RuntimeProviderState {
	models: Map<string, ProviderCatalogModel[]>;
	lastRefresh: Map<string, number>;
	lastError: Map<string, string | null>;
	registered: Set<string>;
}

const runtimeState: RuntimeProviderState = {
	lastError: new Map(),
	lastRefresh: new Map(),
	models: new Map(),
	registered: new Set(),
};
let testStoredCredentials: ReadonlyMap<string, unknown> | undefined;

function registerProvider(registrar: ProviderRegistrar, provider: SupportedProviderDefinition): void {
	registrar.registerProvider(provider.id, {
		api: provider.api,
		apiKey: resolveApiKeyConfig(provider),
		baseUrl: provider.baseUrl,
		models: toProviderModels(runtimeState.models.get(provider.id) ?? []),
		oauth: createApiKeyOAuthProvider(provider),
		async refreshModels(context) {
			const credential = context.credential?.type === "oauth" ? context.credential : undefined;
			const storedModels = credential ? getCredentialModels(credential as ProviderCatalogCredentials) : [];
			if (!context.allowNetwork) {
				const models = storedModels.length > 0 ? storedModels : (runtimeState.models.get(provider.id) ?? []);
				runtimeState.models.set(provider.id, models);
				return toProviderModels(models);
			}

			const apiKey = credential?.access ?? getEnvApiKey(provider);
			if (!apiKey) {
				return toProviderModels(runtimeState.models.get(provider.id) ?? storedModels);
			}

			try {
				const models = await resolveProviderModels(provider, apiKey, {
					previous: runtimeState.models.get(provider.id) ?? storedModels,
					signal: context.signal,
				});
				runtimeState.models.set(provider.id, models);
				runtimeState.lastRefresh.set(provider.id, Date.now());
				runtimeState.lastError.set(provider.id, null);
				return toProviderModels(models);
			} catch (error) {
				runtimeState.lastRefresh.set(provider.id, Date.now());
				runtimeState.lastError.set(provider.id, error instanceof Error ? error.message : String(error));
				throw error;
			}
		},
	});
	runtimeState.registered.add(provider.id);
}

function registerProvidersCommand(pi: ExtensionAPI): void {
	const providersCommand = {
		description:
			"Inspect, log in to, or refresh the OpenCode-backed multi-provider catalog: /providers, /providers status, /providers list [query], /providers info <provider>, /providers models <provider>, /providers login [provider], /providers logout [provider], /providers refresh-models [provider|all]",
		// Biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This explicit command router keeps each provider subcommand readable.
		async handler(args: string, ctx: ExtensionCommandContext) {
			const trimmed = args.trim();
			const [rawAction = "status", ...rest] = trimmed ? trimmed.split(/\s+/) : ["status"];
			const action = rawAction.toLowerCase();
			const query = rest.join(" ").trim();

			if (action === "login") {
				const provider = await resolveProviderSelection(query, ctx);
				if (!provider) {
					return;
				}
				await loginProviderFromCommand(ctx.modelRegistry, ctx, provider);
				return;
			}

			if (action === "logout") {
				const provider = await resolveProviderSelection(query, ctx);
				if (!provider) {
					return;
				}
				await logoutProviderFromCommand(ctx, provider);
				return;
			}

			if (action === "refresh-models") {
				const providers = query && query.toLowerCase() !== "all" ? findProviders(query) : SUPPORTED_PROVIDERS;
				if (providers.length === 0) {
					ctx.ui.notify(`No provider matched "${query}". Run /providers list first.`, "warning");
					return;
				}
				const refreshed = await refreshProviders(ctx, providers);
				ctx.ui.notify(renderRefreshSummary(refreshed, providers.length), "info");
				return;
			}

			if (action === "list") {
				ctx.ui.notify(renderProviderList(query), "info");
				return;
			}

			if (action === "info") {
				if (!query) {
					ctx.ui.notify("Usage: /providers info <provider>", "warning");
					return;
				}
				const provider = findProviders(query)[0];
				if (!provider) {
					ctx.ui.notify(`No provider matched "${query}". Run /providers list first.`, "warning");
					return;
				}
				ctx.ui.notify(await renderProviderInfo(provider), "info");
				return;
			}

			if (action === "models") {
				if (!query) {
					ctx.ui.notify("Usage: /providers models <provider>", "warning");
					return;
				}
				const provider = findProviders(query)[0];
				if (!provider) {
					ctx.ui.notify(`No provider matched "${query}". Run /providers list first.`, "warning");
					return;
				}
				ctx.ui.notify(await renderProviderModels(provider), "info");
				return;
			}

			ctx.ui.notify(renderStatus(), "info");
		},
	};

	pi.registerCommand("providers", providersCommand);

	const aliases: { name: string; subcommand: string; description: string }[] = [
		{
			description: "Show multi-provider catalog status.",
			name: "providers status",
			subcommand: "status",
		},
		{
			description: "List supported providers and environment variables.",
			name: "providers list",
			subcommand: "list",
		},
		{
			description: "Open the provider picker and log in with an API key.",
			name: "providers login",
			subcommand: "login",
		},
		{
			description: "Inspect one provider's API mode, URLs, env vars, and model count.",
			name: "providers info",
			subcommand: "info",
		},
		{
			description: "List the current or fallback model catalog for one provider.",
			name: "providers models",
			subcommand: "models",
		},
		{
			description: "Refresh configured providers from live discovery when possible.",
			name: "providers refresh-models",
			subcommand: "refresh-models",
		},
	];

	for (const alias of aliases) {
		pi.registerCommand(alias.name, {
			description: alias.description,
			handler: (args: string, ctx: ExtensionCommandContext) =>
				providersCommand.handler(args ? `${alias.subcommand} ${args}` : alias.subcommand, ctx),
		});
	}
}

// Biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Refresh handling branches clearly by stored credential vs env configuration paths.
async function refreshProviders(
	ctx: ProviderRegistryContext,
	providers: readonly SupportedProviderDefinition[],
): Promise<
	{
		provider: SupportedProviderDefinition;
		status: "refreshed" | "skipped" | "failed";
		models: number;
		error?: string;
	}[]
> {
	const results: {
		provider: SupportedProviderDefinition;
		status: "refreshed" | "skipped" | "failed";
		models: number;
		error?: string;
	}[] = [];

	for (const provider of providers) {
		const credential = getStoredCredential(provider.id);
		const credentialModelCount = credential ? getCredentialModels(credential).length : 0;
		if (!credential && !getEnvApiKey(provider)) {
			results.push({
				models: runtimeState.models.get(provider.id)?.length ?? 0,
				provider,
				status: "skipped",
			});
			continue;
		}

		registerProvider(ctx.modelRegistry, provider);
		const refresh = await ctx.modelRegistry.refresh({ force: true, providers: [provider.id] });
		const error = refresh.errors.get(provider.id);
		if (error) {
			results.push({
				error: error.message,
				models: runtimeState.models.get(provider.id)?.length ?? credentialModelCount,
				provider,
				status: "failed",
			});
			continue;
		}

		results.push({
			models: runtimeState.models.get(provider.id)?.length ?? credentialModelCount,
			provider,
			status: "refreshed",
		});
	}

	return results;
}

function renderStatus(): string {
	const configured = SUPPORTED_PROVIDERS.filter(
		(provider) => hasStoredCredential(provider.id) || getEnvApiKey(provider),
	);
	const lines = [`Supported providers: ${SUPPORTED_PROVIDERS.length}`, `Configured providers: ${configured.length}`];

	if (configured.length === 0) {
		lines.push("No provider from this package is configured yet.");
		lines.push("Tip: run /providers login to open the paged provider picker, then use /providers refresh-models.");
		return lines.join("\n");
	}

	for (const provider of configured.slice(0, 20)) {
		const credential = getStoredCredential(provider.id);
		const models = credential ? getCredentialModels(credential) : (runtimeState.models.get(provider.id) ?? []);
		const source = credential ? "login" : "env";
		const error = credential ? null : runtimeState.lastError.get(provider.id);
		const refreshedAt = credential?.lastModelRefresh ?? runtimeState.lastRefresh.get(provider.id);
		lines.push(
			`- ${provider.id}: ${provider.name} (${source}, ${models.length} models${formatRefreshAge(
				refreshedAt,
			)})${error ? ` · last error: ${error}` : ""}`,
		);
	}

	if (configured.length > 20) {
		lines.push(`…and ${configured.length - 20} more. Run /providers list to inspect everything.`);
	}

	return lines.join("\n");
}

function renderProviderList(query: string): string {
	const providers = query ? findProviders(query) : SUPPORTED_PROVIDERS;
	if (providers.length === 0) {
		return `No provider matched "${query}".`;
	}

	return providers
		.map((provider) => `- ${provider.id}: ${provider.name} · env: ${provider.env.join(" | ")} · api: ${provider.api}`)
		.join("\n");
}

async function renderProviderInfo(provider: SupportedProviderDefinition): Promise<string> {
	const credential = getStoredCredential(provider.id);
	const currentModels = credential ? getCredentialModels(credential) : (runtimeState.models.get(provider.id) ?? []);
	const catalogModels = currentModels.length > 0 ? currentModels : await getCatalogModels(provider).catch(() => []);
	const source = credential ? "login" : getEnvApiKey(provider) ? "env" : "not configured";
	const refreshedAt = credential?.lastModelRefresh ?? runtimeState.lastRefresh.get(provider.id);

	return [
		`${provider.id}: ${provider.name}`,
		`API: ${provider.api}`,
		`Base URL: ${provider.baseUrl}`,
		`Auth URL: ${provider.authUrl}`,
		`Environment: ${provider.env.join(" | ")}`,
		`Configured via: ${source}`,
		`Models available: ${catalogModels.length}`,
		`Last refresh: ${refreshedAt ? new Date(refreshedAt).toLocaleString() : "never"}`,
		`Last error: ${runtimeState.lastError.get(provider.id) ?? "none"}`,
	].join("\n");
}

async function renderProviderModels(provider: SupportedProviderDefinition): Promise<string> {
	const credential = getStoredCredential(provider.id);
	const currentModels = credential ? getCredentialModels(credential) : (runtimeState.models.get(provider.id) ?? []);
	const models = currentModels.length > 0 ? currentModels : await getCatalogModels(provider).catch(() => []);
	if (models.length === 0) {
		return `${provider.id} has no discovered models yet. Configure it, then run /providers refresh-models ${provider.id}.`;
	}

	return [
		`${provider.id} models:`,
		...models.slice(0, 80).map((model) => {
			const badges = [model.reasoning ? "reasoning" : undefined, model.input.includes("image") ? "vision" : undefined]
				.filter(Boolean)
				.join(" · ");
			return `  - ${model.id}: ${model.name}${
				badges ? ` [${badges}]` : ""
			} · ${model.contextWindow.toLocaleString()} ctx`;
		}),
		...(models.length > 80 ? [`  …and ${models.length - 80} more`] : []),
	].join("\n");
}

function renderRefreshSummary(
	results: readonly {
		provider: SupportedProviderDefinition;
		status: "refreshed" | "skipped" | "failed";
		models: number;
		error?: string;
	}[],
	total: number,
): string {
	const refreshed = results.filter((result) => result.status === "refreshed");
	const failed = results.filter((result) => result.status === "failed");
	const skipped = results.filter((result) => result.status === "skipped");
	const lines = [
		`Refresh complete for ${total} provider${total === 1 ? "" : "s"}.`,
		`Refreshed: ${refreshed.length}`,
		`Skipped: ${skipped.length}`,
		`Failed: ${failed.length}`,
	];

	for (const result of failed.slice(0, 8)) {
		lines.push(`- ${result.provider.id}: ${result.error ?? "unknown error"}`);
	}

	return lines.join("\n");
}

function hasStoredCredential(providerId: string): boolean {
	return getStoredCredential(providerId) !== null;
}

function getStoredCredential(providerId: string): ProviderCatalogCredentials | null {
	const credential = testStoredCredentials ? testStoredCredentials.get(providerId) : readStoredCredential(providerId);
	return credential && typeof credential === "object" && (credential as { type?: string }).type === "oauth"
		? (credential as ProviderCatalogCredentials)
		: null;
}

function findProviders(query: string): SupportedProviderDefinition[] {
	const normalized = query.trim().toLowerCase();
	if (!normalized) {
		return SUPPORTED_PROVIDERS;
	}

	const exact = SUPPORTED_PROVIDERS.find(
		(provider) => provider.id.toLowerCase() === normalized || provider.name.toLowerCase() === normalized,
	);
	if (exact) {
		return [exact];
	}

	return SUPPORTED_PROVIDERS.filter(
		(provider) => provider.id.toLowerCase().includes(normalized) || provider.name.toLowerCase().includes(normalized),
	);
}

async function resolveProviderSelection(
	query: string,
	ctx: ProviderCommandContext,
): Promise<SupportedProviderDefinition | null> {
	const matchedProviders = query ? findProviders(query) : SUPPORTED_PROVIDERS;
	if (matchedProviders.length === 0) {
		ctx.ui.notify(`No provider matched "${query}". Run /providers list first.`, "warning");
		return null;
	}

	if (matchedProviders.length === 1) {
		return matchedProviders[0] ?? null;
	}

	return await selectProviderFromScrollableList(ctx, matchedProviders);
}

const PROVIDER_MAX_VISIBLE = 8;

async function selectProviderFromScrollableList(
	ctx: ProviderCommandContext,
	providers: readonly SupportedProviderDefinition[],
): Promise<SupportedProviderDefinition | null> {
	if (typeof ctx.ui.custom !== "function") {
		return providers[0] ?? null;
	}

	return new Promise((resolve) => {
		let selectedIndex = 0;
		let filteredProviders: SupportedProviderDefinition[] = [...providers];

		const container = new Container();
		const searchInput = new Input();
		const listContainer = new Container();

		const updateList = () => {
			listContainer.clear();
			const startIndex = Math.max(
				0,
				Math.min(selectedIndex - Math.floor(PROVIDER_MAX_VISIBLE / 2), filteredProviders.length - PROVIDER_MAX_VISIBLE),
			);
			const endIndex = Math.min(startIndex + PROVIDER_MAX_VISIBLE, filteredProviders.length);

			for (let i = startIndex; i < endIndex; i++) {
				const p = filteredProviders[i];
				if (!p) continue;
				const selected = i === selectedIndex;
				const prefix = selected ? "→ " : "  ";
				const status = hasStoredCredential(p.id) ? " ✓ logged in" : getEnvApiKey(p) ? " • env key" : "";
				const line = `${prefix}${p.name}: ${p.id}${status}`;
				listContainer.addChild(new TruncatedText(line, 1, 0));
			}

			if (startIndex > 0 || endIndex < filteredProviders.length) {
				listContainer.addChild(
					new TruncatedText(`  (${selectedIndex + 1}/${filteredProviders.length}) ↑↓ scroll`, 1, 0),
				);
			}

			if (filteredProviders.length === 0) {
				listContainer.addChild(new TruncatedText("  No providers match", 1, 0));
			}
		};

		const filterProviders = (query: string) => {
			filteredProviders = query
				? fuzzyFilter([...providers], query, (p) => `${p.name} ${p.id} ${p.env.join(" ")} ${p.api}`)
				: [...providers];
			selectedIndex = Math.max(0, Math.min(selectedIndex, Math.max(0, filteredProviders.length - 1)));
			updateList();
		};

		searchInput.onSubmit = () => {
			const selected = filteredProviders[selectedIndex];
			if (selected) {
				resolve(selected);
			}
		};

		// Build the container
		container.addChild(
			new TruncatedText(`Select provider to log in (${filteredProviders.length}/${providers.length})`, 1, 0),
		);
		container.addChild(new Spacer(1));
		container.addChild(searchInput);
		container.addChild(new Spacer(1));
		container.addChild(listContainer);
		container.addChild(new Spacer(1));
		container.addChild(new TruncatedText("  Enter to select · Esc to cancel", 1, 0));

		// Initial render
		filterProviders("");

		ctx.ui.custom((_tui, _theme, _keybindings, done) => ({
			dispose() {},
			handleInput(data: string) {
				// Up arrow
				if (data === "\u001b[A" || data === "\u001bOA") {
					if (filteredProviders.length > 0) {
						selectedIndex = selectedIndex === 0 ? filteredProviders.length - 1 : selectedIndex - 1;
						updateList();
					}
					return;
				}

				// Down arrow
				if (data === "\u001b[B" || data === "\u001bOB") {
					if (filteredProviders.length > 0) {
						selectedIndex = selectedIndex === filteredProviders.length - 1 ? 0 : selectedIndex + 1;
						updateList();
					}
					return;
				}

				// Enter - confirm selection
				if (data === "\r" || data === "\n") {
					const selected = filteredProviders[selectedIndex];
					if (selected) {
						done(selected);
						resolve(selected);
					}
					return;
				}

				// Escape - cancel
				if (data === "\u001b") {
					done(null as never);
					resolve(null);
					return;
				}

				// Backspace
				if (data === "\u007f" || data === "\b") {
					const current = searchInput.getValue();
					searchInput.setValue(current.slice(0, -1));
					filterProviders(searchInput.getValue());
					return;
				}

				// Regular character input for search
				if (data.length === 1 && data >= " ") {
					searchInput.setValue(searchInput.getValue() + data);
					filterProviders(searchInput.getValue());
					return;
				}
			},
			invalidate() {
				container.invalidate();
			},
			render(width: number) {
				return container.render(width);
			},
		}));
	});
}

async function loginProviderFromCommand(
	registrar: ProviderRegistrar,
	ctx: ProviderCommandContext,
	provider: SupportedProviderDefinition,
): Promise<void> {
	registerProvider(registrar, provider);
	await ctx.modelRegistry.refresh({ allowNetwork: false, providers: [provider.id] });
	ctx.ui.setEditorText(`/login ${provider.id}`);
	ctx.ui.notify(`Ready to log in to ${provider.name}. Press Enter to continue with pi's secure login flow.`, "info");
}

async function logoutProviderFromCommand(
	ctx: ProviderCommandContext,
	provider: SupportedProviderDefinition,
): Promise<void> {
	const credential = getStoredCredential(provider.id);
	if (!credential) {
		ctx.ui.notify(`${provider.name} is not logged in.`, "warning");
		return;
	}

	ctx.ui.setEditorText("/logout");
	ctx.ui.notify(`Press Enter, then select ${provider.name} in pi's secure logout flow.`, "info");
}

function toProviderModels(models: readonly ProviderCatalogModel[]): ProviderCatalogModel[] {
	return models.map((model) => ({
		...model,
		compat: model.compat ? { ...model.compat } : undefined,
		cost: { ...model.cost },
		input: [...model.input],
	}));
}

function formatRefreshAge(timestamp: number | null | undefined): string {
	if (!timestamp) {
		return "";
	}

	const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
	if (seconds < 5) {
		return ", just refreshed";
	}
	if (seconds < 60) {
		return `, ${seconds}s ago`;
	}

	const minutes = Math.round(seconds / 60);
	if (minutes < 60) {
		return `, ${minutes}m ago`;
	}

	const hours = Math.round(minutes / 60);
	return `, ${hours}h ago`;
}

function bootstrapProviders(pi: ExtensionAPI): void {
	for (const provider of SUPPORTED_PROVIDERS.filter((candidate) => Boolean(getEnvApiKey(candidate)))) {
		registerProvider(pi, provider);
	}

	// Also register providers with stored credentials, including credentials whose catalog is currently empty.
	for (const provider of SUPPORTED_PROVIDERS) {
		if (
			(runtimeState.models.has(provider.id) || hasStoredCredential(provider.id)) &&
			!runtimeState.registered.has(provider.id)
		) {
			registerProvider(pi, provider);
		}
	}
}

/**
 * Load models from stored credentials at extension load time.
 * This must happen before resolveModelScope runs (which is during
 * createAgentSessionServices, before session_start fires).
 */
function loadPersistedModels(): void {
	// Tests use an injected map so this never reads the developer's real auth.json.
	if ((process.env.VITEST || process.env.NODE_ENV === "test") && !testStoredCredentials) {
		return;
	}

	for (const provider of SUPPORTED_PROVIDERS) {
		if (runtimeState.models.has(provider.id)) {
			continue;
		}
		const credential = getStoredCredential(provider.id);
		if (!credential) {
			continue;
		}
		const storedModels = getCredentialModels(credential);
		if (storedModels.length > 0) {
			runtimeState.models.set(provider.id, storedModels);
			runtimeState.lastRefresh.set(provider.id, credential.lastModelRefresh ?? Date.now());
		}
	}
}

export type { ProviderCatalogCredentials, ProviderCatalogModel } from "./catalog.js";
export { SUPPORTED_PROVIDERS } from "./config.js";
export {
	createApiKeyOAuthProvider,
	getCatalogModels,
	getCredentialModels,
	refreshProviderCredential,
	refreshProviderCredentialModels,
	resolveProviderModels,
};

export function resetProviderCatalogRuntimeStateForTests(
	storedCredentials: ReadonlyMap<string, unknown> = new Map(),
): void {
	runtimeState.models.clear();
	runtimeState.lastRefresh.clear();
	runtimeState.lastError.clear();
	runtimeState.registered.clear();
	testStoredCredentials = storedCredentials;
}

export default function providerCatalogExtension(pi: ExtensionAPI): void {
	loadPersistedModels();
	bootstrapProviders(pi);
	registerProvidersCommand(pi);
}
