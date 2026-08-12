import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { readStoredCredential } from "@earendil-works/pi-coding-agent";

import type { CursorCredentials } from "./models.js";

import { createCursorOAuthProvider, refreshCursorCredentialModels } from "./auth.js";
import { CURSOR_API, CURSOR_PROVIDER, getCursorRuntimeConfig } from "./config.js";
import { getCredentialModels, getFallbackCursorModels, toProviderModels } from "./models.js";
import { streamSimpleCursor } from "./provider.js";
import { clearCursorRuntimeState, getCursorRuntimeStateSummary } from "./runtime.js";

function registerCursorProvider(pi: ExtensionAPI): void {
	pi.registerProvider(CURSOR_PROVIDER, {
		api: CURSOR_API,
		baseUrl: getCursorRuntimeConfig().apiUrl,
		models: toProviderModels(getFallbackCursorModels()),
		oauth: createCursorOAuthProvider(),
		async refreshModels(context) {
			const credential = context.credential?.type === "oauth" ? (context.credential as CursorCredentials) : undefined;
			if (!credential) {
				return toProviderModels(getFallbackCursorModels());
			}
			if (!context.allowNetwork) {
				const models = getCredentialModels(credential);
				return toProviderModels(models.length > 0 ? models : getFallbackCursorModels());
			}
			const refreshed = await refreshCursorCredentialModels(credential);
			return toProviderModels(getCredentialModels(refreshed));
		},
		streamSimple: streamSimpleCursor,
	});
}

function registerCursorCommand(pi: ExtensionAPI): void {
	pi.registerCommand("cursor", {
		description: "Inspect or refresh the experimental Cursor provider: /cursor [status|refresh-models|clear-state]",
		async handler(args, ctx) {
			const action = args.trim().toLowerCase() || "status";
			if (action === "clear-state") {
				clearCursorRuntimeState();
				ctx.ui.notify("Cleared Cursor provider runtime state.", "info");
				return;
			}

			const credential = readStoredCredential(CURSOR_PROVIDER);
			if (!credential || credential.type !== "oauth") {
				ctx.ui.notify("Not logged in to Cursor. Run /login cursor first.", "warning");
				return;
			}

			if (action === "refresh-models") {
				const result = await ctx.modelRegistry.refresh({ force: true, providers: [CURSOR_PROVIDER] });
				const error = result.errors.get(CURSOR_PROVIDER);
				if (error) {
					ctx.ui.notify(`Failed to refresh Cursor models: ${error.message}`, "error");
					return;
				}
				const modelCount = ctx.modelRegistry.getProvider(CURSOR_PROVIDER)?.getModels().length ?? 0;
				ctx.ui.notify(`Refreshed Cursor models (${modelCount} available).`, "info");
				return;
			}

			const runtime = getCursorRuntimeStateSummary();
			const models = getCredentialModels(credential as CursorCredentials);
			const expiresInMinutes = Math.max(0, Math.round((credential.expires - Date.now()) / 60_000));
			ctx.ui.notify(
				[
					`Cursor auth: configured`,
					`Models: ${models.length}`,
					`Token expiry: ${expiresInMinutes}m`,
					`Runtime: ${runtime.activeRuns} active run(s), ${runtime.checkpoints} checkpoint(s)`,
				].join("\n"),
				"info",
			);
		},
	});
}

export { createCursorOAuthProvider, generateCursorAuthParams, getTokenExpiry } from "./auth.js";
export {
	type CursorCredentials,
	discoverCursorModels,
	getCredentialModels,
	getFallbackCursorModels,
} from "./models.js";
export { streamSimpleCursor } from "./provider.js";
export {
	clearCursorRuntimeState,
	deriveBridgeKey,
	deriveConversationKey,
	getCursorRuntimeStateSummary,
} from "./runtime.js";

export default function cursorProviderExtension(pi: ExtensionAPI): void {
	registerCursorProvider(pi);
	registerCursorCommand(pi);
}
