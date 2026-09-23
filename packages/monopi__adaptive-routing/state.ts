import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { AdaptiveRoutingState } from "./types.js";

const DEFAULT_STATE: AdaptiveRoutingState = {};

export function getAdaptiveRoutingStatePath(): string {
	return join(getAgentDir(), "extensions", "adaptive-routing", "state.json");
}

export function readAdaptiveRoutingState(): AdaptiveRoutingState {
	const path = getAdaptiveRoutingStatePath();
	try {
		if (!existsSync(path)) {
			return { ...DEFAULT_STATE };
		}
		const parsed = JSON.parse(readFileSync(path, "utf8")) as AdaptiveRoutingState;
		return parsed && typeof parsed === "object" ? parsed : { ...DEFAULT_STATE };
	} catch {
		return { ...DEFAULT_STATE };
	}
}

let pendingState: AdaptiveRoutingState | undefined;
let stateSaveTimer: ReturnType<typeof setTimeout> | null = null;
const STATE_PERSIST_DEBOUNCE_MS = 2000;

function writeStateNow(path: string, state: AdaptiveRoutingState): void {
	try {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
	} catch {
		// Non-critical persistence only.
	}
}

function scheduleStateSave(path: string): void {
	if (stateSaveTimer) {
		return;
	}
	stateSaveTimer = setTimeout(() => {
		stateSaveTimer = null;
		if (pendingState) {
			const stateToWrite = pendingState;
			pendingState = undefined;
			writeStateNow(path, stateToWrite);
		}
	}, STATE_PERSIST_DEBOUNCE_MS);
	stateSaveTimer.unref?.();
}

export function writeAdaptiveRoutingState(state: AdaptiveRoutingState): void {
	const path = getAdaptiveRoutingStatePath();
	pendingState = state;
	scheduleStateSave(path);
}

/**
 * Write any pending state immediately instead of waiting out the debounce.
 *
 * `before_agent_start` re-reads state from disk before making routing decisions, so a
 * debounced write must not still be pending when a later turn needs the value. Call this
 * from user-initiated paths (a manual model selection, `/route lock`) and never per-message.
 */
export function flushAdaptiveRoutingState(): void {
	if (!pendingState) {
		return;
	}
	const stateToWrite = pendingState;
	pendingState = undefined;
	if (stateSaveTimer) {
		clearTimeout(stateSaveTimer);
		stateSaveTimer = null;
	}
	writeStateNow(getAdaptiveRoutingStatePath(), stateToWrite);
}
