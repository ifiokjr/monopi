import { beforeEach, describe, expect, it, vi } from "vitest";

const { readStoredCredentialMock, refreshCursorCredentialModelsMock } = vi.hoisted(() => ({
	readStoredCredentialMock: vi.fn(),
	refreshCursorCredentialModelsMock: vi.fn(),
}));

vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => ({
	...(await importOriginal<typeof import("@earendil-works/pi-coding-agent")>()),
	readStoredCredential: readStoredCredentialMock,
}));

vi.mock("../auth.js", async (importOriginal) => ({
	...(await importOriginal<typeof import("../auth.js")>()),
	refreshCursorCredentialModels: refreshCursorCredentialModelsMock,
}));

import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";
import cursorProviderExtension from "../index.js";

describe("cursor provider smoke tests", () => {
	beforeEach(() => {
		readStoredCredentialMock.mockReset();
		refreshCursorCredentialModelsMock.mockReset();
	});

	it("registers the cursor provider and command without crashing", () => {
		const harness = createExtensionHarness();
		cursorProviderExtension(harness.pi as never);

		expect(harness.commands.has("cursor")).toBe(true);
		expect(harness.providers.has("cursor")).toBe(true);
	});

	it("serves credential models offline and refreshes them through the provider hook", async () => {
		const credential = {
			type: "oauth",
			access: "cursor-token",
			refresh: "cursor-refresh",
			expires: Date.now() + 60_000,
			models: [
				{
					id: "composer-2",
					name: "Composer 2",
					reasoning: true,
					input: ["text"],
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
					contextWindow: 200000,
					maxTokens: 64000,
				},
			],
		};
		const harness = createExtensionHarness();
		cursorProviderExtension(harness.pi as never);
		const refreshModels = harness.providers.get("cursor").refreshModels;

		await expect(refreshModels({ allowNetwork: false })).resolves.not.toHaveLength(0);
		await expect(refreshModels({ allowNetwork: false, credential })).resolves.toMatchObject([{ id: "composer-2" }]);

		const refreshed = { ...credential, models: [{ ...credential.models[0], id: "composer-next" }] };
		refreshCursorCredentialModelsMock.mockResolvedValue(refreshed);
		await expect(refreshModels({ allowNetwork: true, credential })).resolves.toMatchObject([{ id: "composer-next" }]);
		expect(refreshCursorCredentialModelsMock).toHaveBeenCalledWith(credential);
	});

	it("reports cursor model refresh success and failure through pi's registry", async () => {
		const credential = { type: "oauth", access: "token", refresh: "refresh", expires: Date.now() + 60_000 };
		readStoredCredentialMock.mockReturnValue(credential);
		const harness = createExtensionHarness();
		const refresh = vi.fn(async () => ({ errors: new Map() }));
		harness.ctx.modelRegistry = {
			refresh,
			getProvider: vi.fn(() => ({ getModels: () => [{ id: "composer-2" }] })),
		} as never;
		cursorProviderExtension(harness.pi as never);
		const command = harness.commands.get("cursor");

		await command.handler("refresh-models", harness.ctx);
		expect(refresh).toHaveBeenCalledWith({ force: true, providers: ["cursor"] });
		expect(harness.notifications.at(-1)?.msg).toContain("1 available");

		refresh.mockResolvedValueOnce({ errors: new Map([["cursor", new Error("refresh failed")]]) });
		await command.handler("refresh-models", harness.ctx);
		expect(harness.notifications.at(-1)?.msg).toContain("refresh failed");
	});

	it("guides unauthenticated commands and clears runtime state", async () => {
		const harness = createExtensionHarness();
		cursorProviderExtension(harness.pi as never);
		const command = harness.commands.get("cursor");

		await command.handler("status", harness.ctx);
		expect(harness.notifications.at(-1)?.msg).toContain("Not logged in");
		await command.handler("clear-state", harness.ctx);
		expect(harness.notifications.at(-1)?.msg).toContain("Cleared Cursor");
	});
});
