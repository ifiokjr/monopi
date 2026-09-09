import type {
	NormalizedRouteCandidate,
	ProviderUsageState,
	QuotaFailoverAction,
	QuotaFailoverConfig,
} from "./types.js";

export type { QuotaFailoverAction } from "./types.js";

/** A resolved mirror set: ordered members plus the preferred home (explicit sets only). */
export interface MirrorSet {
	/** Full model ids in preference order. First entry of an explicit set is home. */
	members: string[];
	/** Preferred model to return to once quota recovers; undefined for auto-derived sets. */
	home?: string;
	/** True when the set came from config `mirrorSets` rather than auto-derivation. */
	explicit: boolean;
}

export type QuotaFailoverKeepAction = Extract<QuotaFailoverAction, { type: "keep" }>;

export interface QuotaFailoverInput {
	currentFullId: string;
	sets: MirrorSet[];
	quota: ProviderUsageState["providers"];
	config: QuotaFailoverConfig;
	now: number;
	/** When true (manual `/route lock`), failover never switches. */
	locked?: boolean;
}

/** Normalize a bare model id so mirrors match across providers (`Glm-5.3-Flash:cloud` → `glm-5.3-flash`). */
export function normalizeMirrorModelId(modelId: string): string {
	return modelId
		.trim()
		.toLowerCase()
		.replace(/:[^:]+$/, "");
}

function providerOf(fullId: string): string {
	const separator = fullId.indexOf("/");
	return separator === -1 ? fullId : fullId.slice(0, separator);
}

function fullIdMatches(candidateFullId: string, fullId: string): boolean {
	if (candidateFullId === fullId) {
		return true;
	}
	const candidateSeparator = candidateFullId.indexOf("/");
	const separator = fullId.indexOf("/");
	if (candidateSeparator === -1 || separator === -1) {
		return false;
	}
	return (
		candidateFullId.slice(0, candidateSeparator) === fullId.slice(0, separator) &&
		normalizeMirrorModelId(candidateFullId.slice(candidateSeparator + 1)) ===
			normalizeMirrorModelId(fullId.slice(separator + 1))
	);
}

interface UsableQuota {
	remainingPct: number;
	windowLabel?: string;
}

function usableQuota(
	entry: ProviderUsageState["providers"][string] | undefined,
	config: QuotaFailoverConfig,
	now: number,
): UsableQuota | null {
	if (!entry || typeof entry.remainingPct !== "number" || !Number.isFinite(entry.remainingPct)) {
		return null;
	}
	const probedAt = typeof entry.probedAt === "number" ? entry.probedAt : undefined;
	if (probedAt !== undefined && now - probedAt > config.staleAfterMinutes * 60_000) {
		return null;
	}
	// Snapshots without a timestamp come from a fresh in-process broadcast; trust them.
	return { remainingPct: entry.remainingPct, windowLabel: entry.windowLabel };
}

/** Build the mirror sets that apply to the available candidates: explicit config sets first, then auto-derived. */
export function deriveMirrorSets(candidates: NormalizedRouteCandidate[], config: QuotaFailoverConfig): MirrorSet[] {
	const available = new Set(candidates.map((candidate) => candidate.fullId));
	const providerByFullId = new Map(candidates.map((candidate) => [candidate.fullId, candidate.provider]));

	const sets: MirrorSet[] = [];
	const seenSets = new Set<string>();

	for (const raw of config.mirrorSets) {
		const members = raw.filter((fullId) => available.has(fullId));
		if (members.length < 2) {
			continue;
		}
		const key = [...members].sort().join("|");
		if (seenSets.has(key)) {
			continue;
		}
		seenSets.add(key);
		sets.push({ explicit: true, home: members[0], members });
	}

	if (config.autoMirror) {
		// Group available models by normalized bare id; groups spanning 2+ providers mirror each other.
		const groups = new Map<string, string[]>();
		for (const candidate of candidates) {
			const normalized = normalizeMirrorModelId(candidate.modelId);
			const bucket = groups.get(normalized);
			if (bucket) {
				bucket.push(candidate.fullId);
			} else {
				groups.set(normalized, [candidate.fullId]);
			}
		}
		for (const members of groups.values()) {
			const distinctProviders = new Set(members.map((fullId) => providerByFullId.get(fullId)));
			if (members.length < 2 || distinctProviders.size < 2) {
				continue;
			}
			const key = [...members].sort().join("|");
			if (seenSets.has(key)) {
				continue;
			}
			seenSets.add(key);
			// Order by the candidate list (registry) order; no intrinsic home.
			sets.push({ explicit: false, members });
		}
	}

	return sets;
}

/**
 * Resolve whether the current model should stay or switch to a mirror.
 *
 * Rules (in order):
 * 1. No mirror set contains the current model → keep.
 * 2. A manual lock pins the model → keep.
 * 3. Active provider quota unknown/stale → keep (`onUnknownQuota: "stay"`), or treat as exhausted.
 * 4. Active provider above the switch threshold → keep (or return home when it has recovered).
 * 5. Active provider at/below the threshold → first mirror (by remaining % desc, then set order)
 *    on a different provider with quota ≥ `requireMirrorAbovePct`; otherwise keep.
 */
export function resolveQuotaFailover(input: QuotaFailoverInput): QuotaFailoverAction {
	if (input.locked) {
		return { type: "keep", reason: "locked" };
	}

	const set = input.sets.find((members) =>
		members.members.some((fullId) => fullIdMatches(fullId, input.currentFullId)),
	);
	if (!set) {
		return { type: "keep", reason: "no-set" };
	}

	const activeProvider = providerOf(input.currentFullId);
	const activeQuota = usableQuota(input.quota[activeProvider], input.config, input.now);

	if (!activeQuota) {
		if (input.config.onUnknownQuota !== "switch") {
			return { type: "keep", reason: "quota-unknown" };
		}
		// Fall through: treat unknown active quota as exhausted.
	}

	if (activeQuota && activeQuota.remainingPct > input.config.switchBelowPct) {
		if (input.config.returnHome && set.home && !fullIdMatches(set.home, input.currentFullId)) {
			const homeQuota = usableQuota(input.quota[providerOf(set.home)], input.config, input.now);
			if (homeQuota && homeQuota.remainingPct >= input.config.requireMirrorAbovePct) {
				return {
					from: input.currentFullId,
					fromRemainingPct: activeQuota.remainingPct,
					reason: "return-home",
					to: set.home,
					toRemainingPct: homeQuota.remainingPct,
					type: "switch",
					windowLabel: homeQuota.windowLabel,
				};
			}
		}
		return { type: "keep", reason: "healthy" };
	}

	const activeRemaining = activeQuota?.remainingPct;
	let best: { fullId: string; provider: string; quota: UsableQuota; order: number } | undefined;
	for (let index = 0; index < set.members.length; index++) {
		const fullId = set.members[index];
		const provider = providerOf(fullId);
		if (provider === activeProvider || fullIdMatches(fullId, input.currentFullId)) {
			continue;
		}
		const quota = usableQuota(input.quota[provider], input.config, input.now);
		if (!quota || quota.remainingPct < input.config.requireMirrorAbovePct) {
			continue;
		}
		if (!best || quota.remainingPct > best.quota.remainingPct) {
			best = { fullId, order: index, provider, quota };
		}
	}

	if (!best) {
		return { type: "keep", reason: "no-mirror" };
	}

	return {
		from: input.currentFullId,
		fromRemainingPct: activeRemaining,
		reason: "exhausted",
		to: best.fullId,
		toRemainingPct: best.quota.remainingPct,
		type: "switch",
		windowLabel: activeQuota?.windowLabel,
	};
}
