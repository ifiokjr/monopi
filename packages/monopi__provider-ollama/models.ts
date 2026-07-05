import type { Api, Model, OAuthCredentials, ThinkingLevelMap } from "@earendil-works/pi-ai";

import type { OllamaRuntimeConfig } from "./config.js";

import { getOllamaCloudRuntimeConfig, getOllamaLocalRuntimeConfig } from "./config.js";

export type OllamaModelSource = "local" | "cloud";
export type OllamaLocalAvailability = "installed" | "downloadable";

export interface OllamaProviderModel {
	id: string;
	name: string;
	reasoning: boolean;
	input: ("text" | "image")[];
	cost: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
	};
	contextWindow: number;
	maxTokens: number;
	compat?: Model<Api>["compat"];
	thinkingLevelMap?: ThinkingLevelMap;
	source?: OllamaModelSource;
	localAvailability?: OllamaLocalAvailability;
	family?: string;
	parameterSize?: string;
	quantization?: string;
	capabilities?: string[];
}

export type OllamaCloudProviderModel = OllamaProviderModel;

export type OllamaCloudCredentials = OAuthCredentials & {
	models?: OllamaProviderModel[];
	lastModelRefresh?: number;
};

interface OllamaListedModel {
	id?: string;
	object?: string;
}

interface OllamaShowResponse {
	capabilities?: unknown;
	model_info?: Record<string, unknown>;
	details?: Record<string, unknown>;
	parameters?: unknown;
	template?: unknown;
}

const DEFAULT_CONTEXT_WINDOW = 128_000;
const DEFAULT_MAX_TOKENS = 16_384;
const MAX_DISCOVERY_CONCURRENCY = 6;

const OLLAMA_CLOUD_ZAI_REASONING_MAX_TOKENS = 131_072;

type OllamaCloudMetadataOverride = {
	id: string;
	contextWindow: number;
	maxTokens: number;
	reasoning: boolean;
	family?: string;
};

const OLLAMA_CLOUD_METADATA_OVERRIDES: readonly OllamaCloudMetadataOverride[] = [
	{ id: "deepseek-v3.1:671b", contextWindow: 163_840, maxTokens: 20_480, reasoning: true, family: "deepseek2" },
	{ id: "deepseek-v3.2", contextWindow: 163_840, maxTokens: 20_480, reasoning: true, family: "deepseek3.2" },
	{ id: "deepseek-v4-flash", contextWindow: 1_048_576, maxTokens: 65_536, reasoning: true, family: "deepseek4" },
	{ id: "deepseek-v4-pro", contextWindow: 524_288, maxTokens: 32_768, reasoning: true, family: "deepseek4" },
	{ id: "gemini-3-flash-preview", contextWindow: 1_048_576, maxTokens: 65_536, reasoning: true, family: "gemini" },
	{ id: "gemma4:31b", contextWindow: 262_144, maxTokens: 32_768, reasoning: true, family: "gemma4" },
	{ id: "glm-4.7", contextWindow: 202_752, maxTokens: 131_072, reasoning: true, family: "glm4" },
	{ id: "glm-5", contextWindow: 202_752, maxTokens: 131_072, reasoning: true, family: "glm5" },
	{ id: "glm-5.1", contextWindow: 202_752, maxTokens: 131_072, reasoning: true, family: "glm5.1" },
	{ id: "glm-5.2", contextWindow: 1_000_000, maxTokens: 131_072, reasoning: true, family: "glm5.2" },
	{ id: "gpt-oss:120b", contextWindow: 131_072, maxTokens: 16_384, reasoning: true, family: "gptoss" },
	{ id: "gpt-oss:20b", contextWindow: 131_072, maxTokens: 16_384, reasoning: true, family: "gptoss" },
	{ id: "kimi-k2.5", contextWindow: 262_144, maxTokens: 32_768, reasoning: true, family: "kimi-k2" },
	{ id: "kimi-k2.6", contextWindow: 262_144, maxTokens: 32_768, reasoning: true, family: "kimi-k2" },
	{ id: "kimi-k2.7-code", contextWindow: 262_144, maxTokens: 32_768, reasoning: true, family: "kimi-k2" },
	{ id: "minimax-m2.1", contextWindow: 204_800, maxTokens: 20_480, reasoning: true, family: "minimax-m2" },
	{ id: "minimax-m2.5", contextWindow: 196_608, maxTokens: 20_480, reasoning: true, family: "minimax-m2" },
	{ id: "minimax-m2.7", contextWindow: 196_608, maxTokens: 20_480, reasoning: true, family: "minimax-m2" },
	{ id: "minimax-m3", contextWindow: 524_288, maxTokens: 32_768, reasoning: true, family: "minimax-m3" },
	{ id: "nemotron-3-nano:30b", contextWindow: 262_144, maxTokens: 32_768, reasoning: true, family: "nemotron-3-nano" },
	{ id: "nemotron-3-super", contextWindow: 262_144, maxTokens: 32_768, reasoning: true, family: "nemotron_h_moe" },
	{ id: "nemotron-3-ultra", contextWindow: 262_144, maxTokens: 32_768, reasoning: true },
	{ id: "qwen3-coder-next", contextWindow: 262_144, maxTokens: 32_768, reasoning: true, family: "qwen3next" },
	{ id: "qwen3-coder:480b", contextWindow: 262_144, maxTokens: 32_768, reasoning: true, family: "qwen3moe" },
	{ id: "qwen3.5:397b", contextWindow: 262_144, maxTokens: 32_768, reasoning: true, family: "qwen3.5" },
];

const OLLAMA_OPENAI_COMPAT: NonNullable<OllamaProviderModel["compat"]> = {
	maxTokensField: "max_tokens",
	supportsDeveloperRole: false,
	supportsReasoningEffort: true,
};

const OLLAMA_REASONING_THINKING_LEVEL_MAP: ThinkingLevelMap = {
	off: "none",
	minimal: "low",
	low: "low",
	medium: "medium",
	high: "high",
	xhigh: "max",
};

const OLLAMA_GPT_OSS_THINKING_LEVEL_MAP: ThinkingLevelMap = {
	off: null,
	minimal: "low",
	low: "low",
	medium: "medium",
	high: "high",
	xhigh: null,
};

const OLLAMA_GPT_OSS_MODEL_PATTERN = /(?:^|[-_/:])gpt[-_]?oss(?:$|[-_/:])/i;
const OLLAMA_QWEN3_MODEL_PATTERN = /(?:^|[-_/:])qwen3(?:$|[-_/:.])/i;
const OLLAMA_DEEPSEEK_THINKING_MODEL_PATTERN = /(?:^|[-_/:])deepseek[-_]?(?:r1|v3\.?[12]|v4)(?:$|[-_/:.])/i;
const OLLAMA_KIMI_THINKING_MODEL_PATTERN = /(?:^|[-_/:])kimi[-_]?k2(?:$|[-_/:.])/i;
const OLLAMA_MINIMAX_THINKING_MODEL_PATTERN = /(?:^|[-_/:])minimax[-_]?m[23](?:$|[-_/:.])/i;
const OLLAMA_NEMOTRON_THINKING_MODEL_PATTERN = /(?:^|[-_/:])nemotron[-_]?3(?:$|[-_/:.])/i;
const OLLAMA_THINKING_TEMPLATE_PATTERN = /<think>|\.thinking\b|reasoning_content/i;

const OLLAMA_CLOUD_ZAI_COMPAT: Partial<NonNullable<OllamaProviderModel["compat"]>> = {
	supportsReasoningEffort: false,
	thinkingFormat: "zai",
	zaiToolStream: true,
};

const FALLBACK_OLLAMA_CLOUD_MODELS: OllamaProviderModel[] = [];

export function getFallbackOllamaCloudModels(): OllamaProviderModel[] {
	return FALLBACK_OLLAMA_CLOUD_MODELS.map(cloneModel);
}

export function getFallbackOllamaLocalModels(): OllamaProviderModel[] {
	return [];
}

export function getCredentialModels(credentials: OllamaCloudCredentials): OllamaProviderModel[] {
	const models = Array.isArray(credentials.models) ? credentials.models : [];
	return models.length > 0 ? sanitizeStoredModels(models) : getFallbackOllamaCloudModels();
}

export async function discoverOllamaLocalModels(
	options: { signal?: AbortSignal } = {},
): Promise<OllamaProviderModel[] | null> {
	return discoverOllamaModels(getOllamaLocalRuntimeConfig(), {
		signal: options.signal,
		source: "local",
	});
}

export async function discoverOllamaCloudModelList(
	apiKey?: string,
	options: { signal?: AbortSignal } = {},
): Promise<OllamaProviderModel[] | null> {
	const config = getOllamaCloudRuntimeConfig();
	const fallbackModels = getFallbackOllamaCloudModels();
	const modelIds = await discoverOllamaModelIds(config, {
		apiKey,
		signal: options.signal,
	});
	if (modelIds.length === 0) return null;
	return modelIds
		.map((id) => normalizeDiscoveredModel(id, null, "cloud", fallbackModels, new Map()))
		.filter((model) => model !== null);
}

export async function discoverOllamaCloudModels(
	apiKey?: string,
	options: {
		signal?: AbortSignal;
		cachedModels?: ReadonlyMap<string, OllamaProviderModel>;
	} = {},
): Promise<OllamaProviderModel[] | null> {
	const config = getOllamaCloudRuntimeConfig();
	const fallbackModels = getFallbackOllamaCloudModels();
	const publicModels = await discoverOllamaModels(config, {
		cachedModels: options.cachedModels,
		fallbackModels,
		signal: options.signal,
		source: "cloud",
	});
	if (!apiKey) {
		return publicModels;
	}
	const authenticatedModels = await discoverOllamaModels(config, {
		apiKey,
		cachedModels: options.cachedModels,
		fallbackModels,
		signal: options.signal,
		source: "cloud",
	}).catch(() => null);
	return mergeDiscoveredModels(publicModels, authenticatedModels);
}

export async function enrichOllamaCloudCredentials(
	credentials: OAuthCredentials,
	options: { previous?: OllamaCloudCredentials; signal?: AbortSignal } = {},
): Promise<OllamaCloudCredentials> {
	let models: OllamaProviderModel[] | undefined;
	const cachedModels = buildCachedModelMap(options.previous?.models);
	try {
		models =
			(await discoverOllamaCloudModels(credentials.access, {
				cachedModels,
				signal: options.signal,
			})) ?? undefined;
	} catch {
		models = undefined;
	}
	return {
		...options.previous,
		...credentials,
		lastModelRefresh: Date.now(),
		models: models ?? options.previous?.models ?? getFallbackOllamaCloudModels(),
	};
}

function buildCachedModelMap(
	models: readonly OllamaProviderModel[] | undefined,
): ReadonlyMap<string, OllamaProviderModel> {
	if (!models || models.length === 0) return new Map();
	const map = new Map<string, OllamaProviderModel>();
	for (const model of models) {
		map.set(model.id, model);
	}
	return map;
}

export function toProviderModels(models: OllamaProviderModel[]): OllamaProviderModel[] {
	return sanitizeStoredModels(models);
}

export function toDownloadableOllamaLocalModel(model: OllamaProviderModel): OllamaProviderModel {
	return toOllamaModel({
		...model,
		localAvailability: "downloadable",
		name: `${stripSourceSuffix(model.name)} (Local download)`,
		source: "local",
	});
}

export function mergeOllamaLocalCatalog(
	installedModels: readonly OllamaProviderModel[],
	downloadableModels: readonly OllamaProviderModel[],
): OllamaProviderModel[] {
	const merged = new Map<string, OllamaProviderModel>();
	for (const model of downloadableModels) {
		merged.set(model.id, toDownloadableOllamaLocalModel(model));
	}
	for (const model of installedModels) {
		merged.set(
			model.id,
			toOllamaModel({
				...model,
				localAvailability: "installed",
				name: `${stripSourceSuffix(model.name)} (Local)`,
				source: "local",
			}),
		);
	}
	return [...merged.values()].toSorted((left, right) => left.id.localeCompare(right.id));
}

export function toOllamaModel(
	model: Partial<OllamaProviderModel> & Pick<OllamaProviderModel, "id">,
): OllamaProviderModel {
	const normalizedModel = applyOllamaCloudMetadataOverrides(model);
	const contextWindow = normalizePositiveInteger(normalizedModel.contextWindow, DEFAULT_CONTEXT_WINDOW);
	const maxTokens = normalizeModelMaxTokens(normalizedModel, contextWindow);
	const compatDefaults = getOllamaCompatDefaults(normalizedModel);
	const reasoning = normalizeModelReasoning(normalizedModel);
	return {
		capabilities: sanitizeCapabilities(normalizedModel.capabilities),
		compat: {
			...OLLAMA_OPENAI_COMPAT,
			...compatDefaults,
			...(normalizedModel.compat ?? {}),
		},
		contextWindow,
		cost: normalizedModel.cost ? { ...normalizedModel.cost } : { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		family: sanitizeOptionalString(normalizedModel.family),
		id: normalizedModel.id,
		input: sanitizeInput(normalizedModel.input),
		localAvailability: sanitizeLocalAvailability(normalizedModel.localAvailability),
		maxTokens,
		name: applySourceSuffix(
			normalizedModel.name?.trim() || formatDisplayName(normalizedModel.id),
			normalizedModel.source,
		),
		parameterSize: sanitizeOptionalString(normalizedModel.parameterSize),
		quantization: sanitizeOptionalString(normalizedModel.quantization),
		reasoning,
		source: normalizedModel.source,
		thinkingLevelMap: getOllamaThinkingLevelMap(normalizedModel, reasoning),
	};
}

export const toOllamaCloudModel = toOllamaModel;

async function discoverOllamaModelIds(
	config: OllamaRuntimeConfig,
	options: { apiKey?: string; signal?: AbortSignal },
): Promise<string[]> {
	const listed = await fetchJson<{ data?: OllamaListedModel[] }>(config.modelsUrl, {
		headers: createDiscoveryHeaders(options.apiKey),
		signal: options.signal,
	});
	return Array.isArray(listed.data)
		? listed.data
				.map((entry) => (typeof entry?.id === "string" ? entry.id.trim() : ""))
				.filter(Boolean)
				.toSorted((left, right) => left.localeCompare(right))
		: [];
}

async function discoverOllamaModels(
	config: OllamaRuntimeConfig,
	options: {
		source: OllamaModelSource;
		apiKey?: string;
		fallbackModels?: readonly OllamaProviderModel[];
		cachedModels?: ReadonlyMap<string, OllamaProviderModel>;
		signal?: AbortSignal;
	},
): Promise<OllamaProviderModel[] | null> {
	const modelIds = await discoverOllamaModelIds(config, options);
	if (modelIds.length === 0) {
		return null;
	}

	const cachedModels = options.cachedModels ?? new Map();
	const discovered = await mapConcurrent(modelIds, MAX_DISCOVERY_CONCURRENCY, async (id) => {
		const payload = await fetchJson<OllamaShowResponse>(config.showUrl, {
			body: JSON.stringify({ model: id, verbose: true }),
			headers: createDiscoveryHeaders(options.apiKey),
			method: "POST",
			signal: options.signal,
		}).catch(() => null);
		return normalizeDiscoveredModel(id, payload, options.source, options.fallbackModels ?? [], cachedModels);
	});
	const models = discovered.filter((model): model is OllamaProviderModel => model !== null);
	return models.length > 0 ? models : null;
}

function sanitizeStoredModels(models: readonly OllamaProviderModel[]): OllamaProviderModel[] {
	return models.map((model) => toOllamaModel(model));
}

function cloneModel(model: OllamaProviderModel): OllamaProviderModel {
	return {
		...model,
		capabilities: model.capabilities ? [...model.capabilities] : undefined,
		compat: model.compat ? { ...model.compat } : undefined,
		cost: { ...model.cost },
		input: [...model.input],
		localAvailability: model.localAvailability,
		thinkingLevelMap: model.thinkingLevelMap ? { ...model.thinkingLevelMap } : undefined,
	};
}

function normalizeDiscoveredModel(
	id: string,
	payload: OllamaShowResponse | null,
	source: OllamaModelSource,
	fallbackModels: readonly OllamaProviderModel[],
	cachedModels: ReadonlyMap<string, OllamaProviderModel>,
): OllamaProviderModel | null {
	const fallback = fallbackModels.find((model) => model.id === id);
	const cached = cachedModels.get(id);
	if (!payload) {
		return fallback
			? cloneModel(fallback)
			: cached
				? cloneModel(cached)
				: toOllamaModel({
						id,
						localAvailability: source === "local" ? "installed" : undefined,
						source,
					});
	}
	const capabilities = Array.isArray(payload.capabilities)
		? payload.capabilities.filter((capability): capability is string => typeof capability === "string")
		: [];
	const capabilitySet = new Set(capabilities.map((capability) => capability.toLowerCase()));
	const parameters = parseOllamaParameters(payload.parameters);
	const rawContext = extractContextWindow(payload.model_info) ?? extractParameterInteger(parameters, "num_ctx");
	const family = extractDetailField(payload.details, "family") ?? cached?.family ?? fallback?.family;
	const contextWindow = rawContext ?? cached?.contextWindow ?? fallback?.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
	const rawMaxTokens =
		extractOutputTokenLimit(payload.model_info) ?? extractParameterInteger(parameters, "num_predict");
	const maxTokens =
		rawMaxTokens ?? cached?.maxTokens ?? fallback?.maxTokens ?? inferMaxTokens(contextWindow, { id, source });
	const reasoning =
		capabilitySet.has("thinking") ||
		modelMatchesOllamaThinkingCatalog({ family, id, source, template: payload.template }) ||
		Boolean(cached?.reasoning ?? fallback?.reasoning);
	return toOllamaModel({
		capabilities,
		contextWindow,
		family,
		id,
		input: capabilitySet.has("vision") ? ["text", "image"] : (cached?.input ?? fallback?.input ?? ["text"]),
		localAvailability: source === "local" ? "installed" : undefined,
		maxTokens,
		parameterSize:
			extractDetailField(payload.details, "parameter_size") ?? cached?.parameterSize ?? fallback?.parameterSize,
		quantization:
			extractDetailField(payload.details, "quantization_level") ?? cached?.quantization ?? fallback?.quantization,
		reasoning,
		source,
	});
}

function extractContextWindow(modelInfo: Record<string, unknown> | undefined): number | null {
	if (!modelInfo) {
		return null;
	}
	for (const [key, value] of Object.entries(modelInfo)) {
		if (!key.endsWith(".context_length")) {
			continue;
		}
		const parsed = normalizeUnknownPositiveInteger(value);
		if (parsed) {
			return parsed;
		}
	}
	return null;
}

function extractOutputTokenLimit(modelInfo: Record<string, unknown> | undefined): number | null {
	if (!modelInfo) {
		return null;
	}
	for (const [key, value] of Object.entries(modelInfo)) {
		if (!key.endsWith(".max_output_tokens")) {
			continue;
		}
		const parsed = normalizeUnknownPositiveInteger(value);
		if (parsed) {
			return parsed;
		}
	}
	return null;
}

function parseOllamaParameters(parameters: unknown): ReadonlyMap<string, number> {
	if (typeof parameters !== "string" || parameters.trim().length === 0) {
		return new Map();
	}

	const values = new Map<string, number>();
	for (const line of parameters.split(/\r?\n/)) {
		const [key, rawValue] = line.trim().split(/\s+/, 2);
		if (!key || !rawValue) {
			continue;
		}
		const parsed = normalizeUnknownPositiveInteger(rawValue);
		if (parsed) {
			values.set(key, parsed);
		}
	}
	return values;
}

function extractParameterInteger(parameters: ReadonlyMap<string, number>, key: string): number | null {
	return parameters.get(key) ?? null;
}

function sanitizeInput(input: OllamaProviderModel["input"] | undefined): ("text" | "image")[] {
	const next = Array.isArray(input) && input.includes("image") ? (["text", "image"] as const) : (["text"] as const);
	return [...next];
}

function inferMaxTokens(
	contextWindow: number,
	model: Partial<Pick<OllamaProviderModel, "id" | "source">> = {},
): number {
	if (isOllamaCloudZaiModel(model)) {
		return OLLAMA_CLOUD_ZAI_REASONING_MAX_TOKENS;
	}

	if (contextWindow >= 1_000_000) {
		return 65_536;
	}
	if (contextWindow >= 262_144) {
		return 32_768;
	}
	if (contextWindow >= 160_000) {
		return 20_480;
	}
	return DEFAULT_MAX_TOKENS;
}

function applyOllamaCloudMetadataOverrides(
	model: Partial<OllamaProviderModel> & Pick<OllamaProviderModel, "id">,
): Partial<OllamaProviderModel> & Pick<OllamaProviderModel, "id"> {
	const override = getOllamaCloudMetadataOverride(model);
	if (!override) {
		return model;
	}

	return {
		...model,
		capabilities: override.reasoning ? mergeCapabilities(model.capabilities, ["thinking"]) : model.capabilities,
		contextWindow: maxPositiveInteger(model.contextWindow, override.contextWindow),
		family: model.family ?? override.family,
		maxTokens: maxPositiveInteger(model.maxTokens, override.maxTokens),
		reasoning: override.reasoning ? true : model.reasoning,
	};
}

function getOllamaCloudMetadataOverride(
	model: Partial<Pick<OllamaProviderModel, "id" | "source">>,
): OllamaCloudMetadataOverride | undefined {
	if (model.source !== "cloud") {
		return undefined;
	}
	const id = model.id?.trim().toLowerCase();
	if (!id) {
		return undefined;
	}
	return OLLAMA_CLOUD_METADATA_OVERRIDES.find((override) => override.id === id);
}

function mergeCapabilities(capabilities: string[] | undefined, additional: readonly string[]): string[] {
	return [...new Set([...(capabilities ?? []), ...additional])];
}

function maxPositiveInteger(value: number | undefined, fallback: number): number {
	return Math.max(normalizePositiveInteger(value, fallback), fallback);
}

function normalizeModelReasoning(
	model: Partial<Pick<OllamaProviderModel, "family" | "id" | "reasoning" | "source">>,
): boolean {
	return model.reasoning ?? modelMatchesOllamaThinkingCatalog(model);
}

function getOllamaThinkingLevelMap(
	model: Partial<Pick<OllamaProviderModel, "family" | "id" | "source" | "thinkingLevelMap">>,
	reasoning: boolean,
): ThinkingLevelMap | undefined {
	if (!reasoning) {
		return model.thinkingLevelMap;
	}
	if (isOllamaGptOssModel(model)) {
		return OLLAMA_GPT_OSS_THINKING_LEVEL_MAP;
	}

	return model.thinkingLevelMap ?? OLLAMA_REASONING_THINKING_LEVEL_MAP;
}

function normalizeModelMaxTokens(
	model: Partial<OllamaProviderModel> & Pick<OllamaProviderModel, "id">,
	contextWindow: number,
): number {
	const inferred = inferMaxTokens(contextWindow, model);
	const normalized = normalizePositiveInteger(model.maxTokens, inferred);

	if (!isOllamaCloudZaiModel(model)) {
		return normalized;
	}

	return Math.max(normalized, OLLAMA_CLOUD_ZAI_REASONING_MAX_TOKENS);
}

function getOllamaCompatDefaults(
	model: Partial<Pick<OllamaProviderModel, "id" | "source">>,
): Partial<NonNullable<OllamaProviderModel["compat"]>> {
	if (isOllamaCloudZaiModel(model)) {
		return OLLAMA_CLOUD_ZAI_COMPAT;
	}

	return {};
}

function modelMatchesOllamaThinkingCatalog(
	model: Partial<Pick<OllamaProviderModel, "family" | "id" | "source">> & { template?: unknown },
): boolean {
	if (
		isOllamaGptOssModel(model) ||
		isOllamaQwen3Model(model) ||
		isOllamaDeepSeekThinkingModel(model) ||
		isOllamaKimiThinkingModel(model) ||
		isOllamaMinimaxThinkingModel(model) ||
		isOllamaNemotronThinkingModel(model)
	) {
		return true;
	}
	if (isOllamaCloudZaiModel(model)) {
		return true;
	}
	return typeof model.template === "string" && OLLAMA_THINKING_TEMPLATE_PATTERN.test(model.template);
}

function isOllamaGptOssModel(model: Partial<Pick<OllamaProviderModel, "family" | "id">>): boolean {
	return modelHasToken(model, OLLAMA_GPT_OSS_MODEL_PATTERN);
}

function isOllamaQwen3Model(model: Partial<Pick<OllamaProviderModel, "family" | "id">>): boolean {
	return modelHasToken(model, OLLAMA_QWEN3_MODEL_PATTERN);
}

function isOllamaDeepSeekThinkingModel(model: Partial<Pick<OllamaProviderModel, "family" | "id">>): boolean {
	return modelHasToken(model, OLLAMA_DEEPSEEK_THINKING_MODEL_PATTERN);
}

function isOllamaKimiThinkingModel(model: Partial<Pick<OllamaProviderModel, "family" | "id">>): boolean {
	return modelHasToken(model, OLLAMA_KIMI_THINKING_MODEL_PATTERN);
}

function isOllamaMinimaxThinkingModel(model: Partial<Pick<OllamaProviderModel, "family" | "id">>): boolean {
	return modelHasToken(model, OLLAMA_MINIMAX_THINKING_MODEL_PATTERN);
}

function isOllamaNemotronThinkingModel(model: Partial<Pick<OllamaProviderModel, "family" | "id">>): boolean {
	return modelHasToken(model, OLLAMA_NEMOTRON_THINKING_MODEL_PATTERN);
}

function modelHasToken(model: Partial<Pick<OllamaProviderModel, "family" | "id">>, pattern: RegExp): boolean {
	return pattern.test(model.id ?? "") || pattern.test(model.family ?? "");
}

function isOllamaCloudZaiModel(model: Partial<Pick<OllamaProviderModel, "id" | "source">>): boolean {
	return model.source === "cloud" && typeof model.id === "string" && model.id.trim().toLowerCase().startsWith("glm-");
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function normalizeUnknownPositiveInteger(value: unknown): number | null {
	const parsed = typeof value === "number" ? value : Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

function formatDisplayName(id: string): string {
	return id
		.replaceAll(/[-_]/g, " ")
		.replaceAll(/:/g, " ")
		.replaceAll(/\bglm\b/gi, "GLM")
		.replaceAll(/\bgpt\b/gi, "GPT")
		.replaceAll(/\boss\b/gi, "OSS")
		.replaceAll(/\bvl\b/gi, "VL")
		.replaceAll(/\brnj\b/gi, "RNJ")
		.replaceAll(/\b(\d+)b\b/gi, (_, size: string) => `${size.toUpperCase()}B`)
		.split(/\s+/)
		.filter(Boolean)
		.map((part) => {
			if (/^[A-Z0-9.]+$/.test(part)) {
				return part;
			}
			return `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`;
		})
		.join(" ");
}

function applySourceSuffix(name: string, source: OllamaModelSource | undefined): string {
	if (!source) {
		return name;
	}
	if (/\((local|cloud|local download)\)$/i.test(name)) {
		return name;
	}
	return `${name} (${source === "local" ? "Local" : "Cloud"})`;
}

function stripSourceSuffix(name: string): string {
	return name.replace(/\s*\((local|cloud|local download)\)$/i, "").trim();
}

function sanitizeOptionalString(value: string | undefined): string | undefined {
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function sanitizeLocalAvailability(
	value: OllamaProviderModel["localAvailability"] | undefined,
): OllamaLocalAvailability | undefined {
	return value === "installed" || value === "downloadable" ? value : undefined;
}

function sanitizeCapabilities(capabilities: string[] | undefined): string[] | undefined {
	if (!Array.isArray(capabilities) || capabilities.length === 0) {
		return undefined;
	}
	return [...new Set(capabilities.map((capability) => capability.trim()).filter(Boolean))];
}

function extractDetailField(details: Record<string, unknown> | undefined, key: string): string | undefined {
	const value = details?.[key];
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function createDiscoveryHeaders(apiKey?: string): Record<string, string> {
	return apiKey
		? {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			}
		: {
				"Content-Type": "application/json",
			};
}

async function fetchJson<T>(
	url: string,
	options: {
		method?: string;
		headers?: Record<string, string>;
		body?: string;
		signal?: AbortSignal;
	} = {},
): Promise<T> {
	const response = await fetch(url, {
		body: options.body,
		headers: options.headers,
		method: options.method ?? (options.body ? "POST" : "GET"),
		signal: options.signal,
	});
	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Ollama request failed (${response.status}): ${body || response.statusText}`);
	}
	return (await response.json()) as T;
}

function mergeDiscoveredModels(
	publicModels: OllamaProviderModel[] | null,
	authenticatedModels: OllamaProviderModel[] | null,
): OllamaProviderModel[] | null {
	const merged = new Map<string, OllamaProviderModel>();
	for (const model of publicModels ?? []) {
		merged.set(model.id, cloneModel(model));
	}
	for (const model of authenticatedModels ?? []) {
		const existing = merged.get(model.id);
		merged.set(model.id, {
			...cloneModel(existing ?? model),
			...cloneModel(model),
			capabilities: sanitizeCapabilities([...(existing?.capabilities ?? []), ...(model.capabilities ?? [])]),
			input: [...new Set([...(existing?.input ?? []), ...model.input])] as ("text" | "image")[],
		});
	}
	if (merged.size > 0) {
		return [...merged.values()].toSorted((left, right) => left.id.localeCompare(right.id));
	}
	return null;
}

async function mapConcurrent<T, TResult>(
	items: readonly T[],
	limit: number,
	mapper: (item: T) => Promise<TResult>,
): Promise<TResult[]> {
	const results = new Array<TResult>(items.length);
	let nextIndex = 0;
	const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (nextIndex < items.length) {
			const current = nextIndex++;
			results[current] = await mapper(items[current]!);
		}
	});
	await Promise.all(workers);
	return results;
}

export { OLLAMA_OPENAI_COMPAT };
