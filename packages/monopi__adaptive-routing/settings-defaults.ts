import { getAgentDir, SettingsManager } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The global settings fields a routed switch silently overwrites.
 *
 * pi's `setModel` persists `defaultProvider`/`defaultModel` and its
 * `setThinkingLevel` persists `defaultThinkingLevel` into the user's global
 * `~/.pi/agent/settings.json`. Routing decisions are per-turn, so the user's
 * configured defaults are captured before a routed switch and written back
 * afterwards.
 */
export interface RoutedDefaultsSnapshot {
	defaultModel?: string;
	defaultProvider?: string;
	defaultThinkingLevel?: string;
}

const PERSISTED_DEFAULT_FIELDS: (keyof RoutedDefaultsSnapshot)[] = [
	"defaultProvider",
	"defaultModel",
	"defaultThinkingLevel",
];

function readGlobalSettings(agentDir: string): Record<string, unknown> | undefined {
	try {
		return JSON.parse(readFileSync(join(agentDir, "settings.json"), "utf-8")) as Record<string, unknown>;
	} catch {
		// Missing or unreadable settings file: there is nothing meaningful to capture,
		// and a corrupt file must never be rewritten by routing.
		return undefined;
	}
}

function readPersistedDefaults(settings: Record<string, unknown>): RoutedDefaultsSnapshot {
	const readString = (field: keyof RoutedDefaultsSnapshot): string | undefined => {
		const value = settings[field];
		return typeof value === "string" ? value : undefined;
	};
	return {
		defaultModel: readString("defaultModel"),
		defaultProvider: readString("defaultProvider"),
		defaultThinkingLevel: readString("defaultThinkingLevel"),
	};
}

/**
 * Capture the user's global default model settings before a routed switch.
 *
 * Only the three fields pi persists on a model switch are read; every other
 * setting is left alone. All fields are optional, so an absent default is
 * restored as absent instead of keeping the routed pick.
 */
export function captureRoutedDefaults(agentDir: string = getAgentDir()): RoutedDefaultsSnapshot {
	const settings = readGlobalSettings(agentDir);
	return settings ? readPersistedDefaults(settings) : {};
}

/**
 * Write the captured defaults back after a routed switch.
 *
 * Returns false when there was nothing to restore: no snapshot, an unreadable
 * settings file, or pi already switched without persisting (its extension
 * `setModel` no longer touches global defaults from 0.85 on). Restores through
 * pi's own `SettingsManager` so the write takes the same settings lock pi uses.
 *
 * pi persists through a queued writer on its own manager instance, and queue
 * ordering across instances is not FIFO, so the routed values can land *after*
 * a naive single restore. The restore therefore yields, writes, and re-checks
 * until the file settles on the captured defaults (or a short budget runs out).
 */
export async function restoreRoutedDefaults(
	snapshot: RoutedDefaultsSnapshot | undefined,
	agentDir: string = getAgentDir(),
): Promise<boolean> {
	if (!snapshot) {
		return false;
	}
	let restored = false;
	for (let attempt = 0; attempt < 5; attempt++) {
		// Let pi's queued settings writes (and ours) reach the file before comparing.
		await Promise.resolve();
		const current = readGlobalSettings(agentDir);
		if (!current) {
			return restored;
		}
		if (matchesSnapshot(readPersistedDefaults(current), snapshot)) {
			return restored;
		}
		writeRoutedDefaults(snapshot, agentDir);
		restored = true;
	}
	return restored;
}

function matchesSnapshot(persisted: RoutedDefaultsSnapshot, snapshot: RoutedDefaultsSnapshot): boolean {
	return PERSISTED_DEFAULT_FIELDS.every((field) => persisted[field] === snapshot[field]);
}

function writeRoutedDefaults(snapshot: RoutedDefaultsSnapshot, agentDir: string): void {
	try {
		const manager = SettingsManager.create(process.cwd(), agentDir);
		// The setters type their argument as required, but writing `undefined` is
		// intentional: pi drops the field from settings.json instead of persisting
		// the routed pick, which is what the user had before routing intervened.
		const writeProvider = manager.setDefaultProvider.bind(manager) as (value: string | undefined) => void;
		const writeModel = manager.setDefaultModel.bind(manager) as (value: string | undefined) => void;
		const writeThinking = manager.setDefaultThinkingLevel.bind(manager) as (value: string | undefined) => void;
		writeProvider(snapshot.defaultProvider);
		writeModel(snapshot.defaultModel);
		writeThinking(snapshot.defaultThinkingLevel);
	} catch {
		// Never let a restore failure break the routed switch itself.
	}
}
