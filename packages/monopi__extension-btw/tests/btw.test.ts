import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@earendil-works/pi-ai", () => ({
	getEnvApiKey: vi.fn((provider: string) => (provider === "openai" ? "env-openai-key" : undefined)),
}));

vi.mock("@earendil-works/pi-tui", () => ({
	Container: class Container {
		children: any[] = [];
		addChild(child: any) {
			this.children.push(child);
		}
		invalidate() {}
	},
	Input: class Input {
		focused = false;
		onSubmit: ((value: string) => void) | null = null;
		onEscape: (() => void) | null = null;
		private value = "";
		setValue(value: string) {
			this.value = value;
		}
		getValue() {
			return this.value;
		}
		handleInput(_data: string) {}
		render(_width: number) {
			return [this.value];
		}
	},
	Markdown: class Markdown {
		constructor(
			public text: string,
			public x: number,
			public y: number,
			public theme?: unknown,
		) {}
		render(_width: number) {
			if (this.text.startsWith("throw:")) {
				throw new Error("Markdown render failed");
			}
			return [this.text];
		}
	},
	Text: class Text {
		constructor(public text: string) {}
	},
	truncateToWidth: (text: string, _width: number, _ellipsis = "") => text,
	visibleWidth: (text: string) => text.length,
}));

const mockSession = {
	agent: {
		state: {
			messages: [] as any[],
		},
	},
	subscribe: vi.fn(() => vi.fn()),
	prompt: vi.fn(),
	abort: vi.fn(),
	dispose: vi.fn(),
	state: {
		messages: [] as any[],
	},
};

vi.mock("@earendil-works/pi-coding-agent", () => ({
	buildSessionContext: vi.fn(() => ({ messages: [] })),
	createAgentSession: vi.fn(() =>
		Promise.resolve({
			session: mockSession,
			extensionsResult: { extensions: [], errors: [], runtime: {} },
		}),
	),
	createExtensionRuntime: vi.fn(() => ({})),
	getMarkdownTheme: () => ({ theme: "markdown" }),
	SessionManager: {
		inMemory: vi.fn(() => ({})),
	},
}));

import { createAgentSession } from "@earendil-works/pi-coding-agent";

import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";
import btwExtension, { BtwConversationPicker, BtwOverlay, getPickerHeight } from "../index.js";

const model = {
	provider: "anthropic",
	id: "claude-sonnet-4",
	api: "anthropic-messages",
};

function makeAssistantResponse(text: string, stopReason = "stop") {
	return {
		role: "assistant",
		content: [{ type: "text", text }],
		provider: "anthropic",
		model: "claude-sonnet-4",
		api: "anthropic-messages",
		usage: {
			input: 1,
			output: 1,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 2,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason,
		timestamp: Date.now(),
	};
}

function configureModel(harness: ReturnType<typeof createExtensionHarness>) {
	harness.ctx.model = model as never;
	harness.ctx.modelRegistry = {
		getApiKeyAndHeaders: vi.fn().mockResolvedValue({ ok: true, apiKey: "direct-key", headers: {} }),
		getAvailable: () => [],
	} as never;
}

const testTheme = {
	bold: (text: string) => text,
	fg: (_color: string, text: string) => text,
};

function createTuiTestKit() {
	return {
		keybindings: {
			matches: (data: string, binding: string) => data === binding,
		},
		tui: {
			requestRender: vi.fn(),
			terminal: { rows: 30 },
		},
	};
}

describe("btw command", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockSession.agent.state.messages = [];
		mockSession.state.messages = [];
		mockSession.prompt.mockImplementation(async () => {
			const response = makeAssistantResponse("Test answer");
			mockSession.state.messages = [{ role: "user" }, response];
			mockSession.agent.state.messages = mockSession.state.messages;
		});
	});

	it("registers the upstream single-command BTW flow", () => {
		const harness = createExtensionHarness();
		btwExtension(harness.pi as never);

		expect(Array.from(harness.commands.keys()).sort()).toEqual(["btw"]);
	});

	it("opens the overlay when /btw is called without a question", async () => {
		const harness = createExtensionHarness();
		configureModel(harness);
		const customSpy = vi.fn().mockResolvedValue(null);
		harness.ctx.ui.custom = customSpy;

		btwExtension(harness.pi as never);
		await harness.commands.get("btw").handler("", harness.ctx);

		expect(customSpy).toHaveBeenCalled();
	});

	it("shows an error without persisting an empty conversation when no model is active", async () => {
		const harness = createExtensionHarness();
		const appendEntry = vi.fn();
		harness.pi.appendEntry = appendEntry;
		btwExtension(harness.pi as never);

		await harness.commands.get("btw").handler("What changed?", harness.ctx);

		expect(harness.notifications).toContainEqual({
			msg: "No active model selected.",
			type: "error",
		});
		expect(appendEntry).not.toHaveBeenCalled();
	});

	it("rejects the custom conversation UI outside TUI mode", async () => {
		const harness = createExtensionHarness();
		harness.ctx.mode = "rpc";
		const customSpy = vi.fn();
		harness.ctx.ui.custom = customSpy;
		btwExtension(harness.pi as never);

		await harness.commands.get("btw").handler("Question", harness.ctx);

		expect(customSpy).not.toHaveBeenCalled();
		expect(harness.notifications).toContainEqual({
			msg: "BTW conversations are available in TUI mode only.",
			type: "warning",
		});
	});

	it("does not persist a conversation when model authentication fails", async () => {
		const harness = createExtensionHarness();
		configureModel(harness);
		const appendEntry = vi.fn();
		harness.pi.appendEntry = appendEntry;
		harness.ctx.modelRegistry.getApiKeyAndHeaders = vi.fn().mockResolvedValue({ ok: false, error: "Auth failed" });
		btwExtension(harness.pi as never);

		await harness.commands.get("btw").handler("Question", harness.ctx);

		expect(harness.notifications).toContainEqual({ msg: "Auth failed", type: "error" });
		expect(appendEntry).not.toHaveBeenCalled();
	});

	it("handles a model disappearing before side-session creation", async () => {
		const harness = createExtensionHarness();
		configureModel(harness);
		harness.ctx.modelRegistry.getApiKeyAndHeaders = vi.fn().mockImplementation(async () => {
			harness.ctx.model = undefined;
			return { ok: true, apiKey: "key", headers: {} };
		});
		btwExtension(harness.pi as never);

		await harness.commands.get("btw").handler("Question", harness.ctx);

		expect(harness.notifications).toContainEqual({
			msg: "Unable to create BTW side session.",
			type: "error",
		});
	});

	it("creates a side session and persists the thread entry", async () => {
		const harness = createExtensionHarness();
		configureModel(harness);
		const appendEntry = vi.fn();
		harness.pi.appendEntry = appendEntry;
		harness.ctx.ui.custom = vi.fn().mockResolvedValue(null);

		btwExtension(harness.pi as never);
		await harness.commands.get("btw").handler("What changed?", harness.ctx);

		expect(appendEntry).toHaveBeenCalledWith(
			"btw-thread-entry",
			expect.objectContaining({
				question: "What changed?",
				answer: "Test answer",
				conversationId: expect.any(String),
			}),
		);
	});

	it("keeps independently addressable conversations for repeated invocations", async () => {
		const harness = createExtensionHarness();
		configureModel(harness);
		const appendEntry = vi.fn();
		harness.pi.appendEntry = appendEntry;
		harness.ctx.ui.custom = vi.fn().mockResolvedValue(null);

		btwExtension(harness.pi as never);
		await harness.commands.get("btw").handler("First topic", harness.ctx);
		await harness.commands.get("btw").handler("Second topic", harness.ctx);

		const persistedEntries = appendEntry.mock.calls
			.filter(([type]) => type === "btw-thread-entry")
			.map(([, details]) => details);
		expect(persistedEntries).toHaveLength(2);
		expect(persistedEntries[0].conversationId).not.toBe(persistedEntries[1].conversationId);

		const pickerLines: string[] = [];
		const { keybindings, tui } = createTuiTestKit();
		harness.ctx.ui.custom = vi.fn().mockImplementation(async (factory: any) => {
			const picker = await factory(tui, testTheme, keybindings, () => {});
			pickerLines.push(...picker.render(90));
			picker.handleInput("tui.select.cancel");
			return undefined;
		});
		await harness.commands.get("btw").handler("", harness.ctx);

		expect(pickerLines.join("\n")).toContain("First topic");
		expect(pickerLines.join("\n")).toContain("Second topic");
	});

	it("starts an unpersisted empty conversation from the picker", async () => {
		const harness = createExtensionHarness();
		configureModel(harness);
		const appendEntry = vi.fn();
		harness.pi.appendEntry = appendEntry;
		harness.ctx.ui.custom = vi.fn().mockResolvedValue(null);
		btwExtension(harness.pi as never);
		await harness.commands.get("btw").handler("Saved topic", harness.ctx);
		appendEntry.mockClear();

		const { keybindings, tui } = createTuiTestKit();
		let openedOverlay: BtwOverlay | undefined;
		harness.ctx.ui.custom = vi.fn().mockImplementation(async (factory: any) => {
			let selectedValue: unknown;
			const component = await factory(tui, testTheme, keybindings, (value: unknown) => {
				selectedValue = value;
			});
			if (component instanceof BtwConversationPicker) {
				component.render(90);
				component.handleInput("tui.select.confirm");
				return selectedValue;
			}
			openedOverlay = component;
			return null;
		});

		await harness.commands.get("btw").handler("", harness.ctx);
		expect(openedOverlay?.render(90).join("\n")).toContain("No BTW messages yet");
		expect(appendEntry).not.toHaveBeenCalled();
	});

	it("handles a stale conversation picker selection", async () => {
		const harness = createExtensionHarness();
		configureModel(harness);
		harness.ctx.ui.custom = vi.fn().mockResolvedValue(null);
		btwExtension(harness.pi as never);
		await harness.commands.get("btw").handler("Saved topic", harness.ctx);

		harness.ctx.ui.custom = vi.fn().mockResolvedValue("missing-conversation");
		await harness.commands.get("btw").handler("", harness.ctx);

		expect(harness.notifications).toContainEqual({
			msg: "That BTW conversation is no longer available.",
			type: "warning",
		});
	});

	it.each([
		{ label: "a new conversation", selectionMoves: 0 },
		{ label: "an existing conversation", selectionMoves: 1 },
	])("cancels selecting $label when the session branch changes", async ({ selectionMoves }) => {
		const harness = createExtensionHarness();
		configureModel(harness);
		const appendEntry = vi.fn();
		harness.pi.appendEntry = appendEntry;
		harness.ctx.ui.custom = vi.fn().mockResolvedValue(null);
		btwExtension(harness.pi as never);
		await harness.commands.get("btw").handler("Saved topic", harness.ctx);
		appendEntry.mockClear();

		let resolveAbort: (() => void) | undefined;
		mockSession.abort.mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					resolveAbort = resolve;
				}),
		);
		const { keybindings, tui } = createTuiTestKit();
		harness.ctx.ui.custom = vi.fn().mockImplementation(async (factory: any) => {
			let selectedValue: unknown;
			const picker = await factory(tui, testTheme, keybindings, (value: unknown) => {
				selectedValue = value;
			});
			picker.render(90);
			for (let index = 0; index < selectionMoves; index++) {
				picker.handleInput("tui.select.down");
			}
			picker.handleInput("tui.select.confirm");
			return selectedValue;
		});

		const selectionPromise = harness.commands.get("btw").handler("", harness.ctx);
		await new Promise((resolve) => setTimeout(resolve, 0));
		await harness.emitAsync("session_tree", { type: "session_tree" }, harness.ctx);
		resolveAbort?.();
		await selectionPromise;

		expect(appendEntry).not.toHaveBeenCalled();
	});

	it("does not open terminal UI when TUI dialogs are unavailable", async () => {
		const harness = createExtensionHarness();
		harness.ctx.hasUI = false;
		const customSpy = vi.fn();
		harness.ctx.ui.custom = customSpy;
		btwExtension(harness.pi as never);

		await harness.commands.get("btw").handler("", harness.ctx);

		expect(customSpy).not.toHaveBeenCalled();
	});

	it("cancels a new direct question when the branch changes during session disposal", async () => {
		const harness = createExtensionHarness();
		configureModel(harness);
		const appendEntry = vi.fn();
		harness.pi.appendEntry = appendEntry;
		harness.ctx.ui.custom = vi.fn().mockResolvedValue(null);
		btwExtension(harness.pi as never);
		await harness.commands.get("btw").handler("Saved topic", harness.ctx);
		appendEntry.mockClear();

		let resolveAbort: (() => void) | undefined;
		mockSession.abort.mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					resolveAbort = resolve;
				}),
		);
		const questionPromise = harness.commands.get("btw").handler("Stale direct question", harness.ctx);
		await new Promise((resolve) => setTimeout(resolve, 0));
		await harness.emitAsync("session_tree", { type: "session_tree" }, harness.ctx);
		resolveAbort?.();
		await questionPromise;

		expect(appendEntry).not.toHaveBeenCalled();
	});

	it("restores thread entries on session_start", async () => {
		const harness = createExtensionHarness();
		const getBranch = vi.fn(() => [
			{
				type: "custom",
				customType: "btw-thread-entry",
				data: {
					question: "What changed?",
					answer: "A few startup paths were deferred.",
					provider: "anthropic",
					model: "claude-sonnet-4",
					thinkingLevel: "off",
					timestamp: Date.now(),
				},
			},
		]);
		harness.ctx.sessionManager.getBranch = getBranch;

		btwExtension(harness.pi as never);
		await harness.emitAsync("session_start", { type: "session_start" }, harness.ctx);

		expect(getBranch).toHaveBeenCalled();
	});

	it("restores multiple conversations and applies resets to only their target", async () => {
		const harness = createExtensionHarness();
		harness.ctx.sessionManager.getBranch = vi.fn(() => [
			{ type: "message", role: "user" },
			{ type: "custom", customType: "btw-thread-start", data: { timestamp: 0 } },
			{
				type: "custom",
				customType: "btw-thread-start",
				data: { timestamp: 1, conversationId: "empty-conversation" },
			},
			{
				type: "custom",
				customType: "btw-thread-reset",
				data: { timestamp: 2, conversationId: "empty-conversation" },
			},
			{
				type: "custom",
				customType: "btw-thread-entry",
				data: {
					question: "Removed topic",
					answer: "Old answer",
					provider: "anthropic",
					model: "claude-sonnet-4",
					thinkingLevel: "off",
					timestamp: 1,
					conversationId: "conversation-1",
				},
			},
			{
				type: "custom",
				customType: "btw-thread-entry",
				data: {
					question: "Kept topic",
					answer: "Current answer",
					provider: "anthropic",
					model: "claude-sonnet-4",
					thinkingLevel: "off",
					timestamp: 2,
					conversationId: "conversation-2",
				},
			},
			{
				type: "custom",
				customType: "btw-thread-reset",
				data: { timestamp: 3, conversationId: "conversation-1" },
			},
		]);

		btwExtension(harness.pi as never);
		await harness.emitAsync("session_start", { type: "session_start" }, harness.ctx);

		const pickerLines: string[] = [];
		const { keybindings, tui } = createTuiTestKit();
		harness.ctx.ui.custom = vi.fn().mockImplementation(async (factory: any) => {
			const picker = await factory(tui, testTheme, keybindings, () => {});
			pickerLines.push(...picker.render(90));
			return undefined;
		});
		await harness.commands.get("btw").handler("", harness.ctx);

		expect(pickerLines.join("\n")).toContain("Kept topic");
		expect(pickerLines.join("\n")).not.toContain("Removed topic");
	});

	it("continues the selected previous conversation with its persisted id", async () => {
		const harness = createExtensionHarness();
		configureModel(harness);
		harness.ctx.sessionManager.getBranch = vi.fn(() => [
			{
				type: "custom",
				customType: "btw-thread-entry",
				data: {
					question: "Older topic",
					answer: "throw:\n\nOlder answer",
					provider: "anthropic",
					model: "claude-sonnet-4",
					thinkingLevel: "off",
					timestamp: 1,
					conversationId: "conversation-1",
				},
			},
			{
				type: "custom",
				customType: "btw-thread-entry",
				data: {
					question: "Newer topic",
					answer: "Newer answer",
					provider: "anthropic",
					model: "claude-sonnet-4",
					thinkingLevel: "off",
					timestamp: 2,
					conversationId: "conversation-2",
				},
			},
		]);
		const appendEntry = vi.fn();
		harness.pi.appendEntry = appendEntry;
		btwExtension(harness.pi as never);
		await harness.emitAsync("session_start", { type: "session_start" }, harness.ctx);

		const { keybindings, tui } = createTuiTestKit();
		let conversationOverlay: BtwOverlay | undefined;
		harness.ctx.ui.custom = vi.fn().mockImplementation(async (factory: any) => {
			let selectedValue: unknown;
			const component = await factory(tui, testTheme, keybindings, (value: unknown) => {
				selectedValue = value;
			});
			if (component instanceof BtwConversationPicker) {
				component.render(90);
				component.handleInput("tui.select.down");
				component.handleInput("tui.select.down");
				component.handleInput("tui.select.confirm");
				return selectedValue;
			}
			conversationOverlay = component;
			return null;
		});

		await harness.commands.get("btw").handler("", harness.ctx);
		expect(conversationOverlay?.render(90).join("\n")).toContain("Older topic");
		expect(conversationOverlay?.render(90).join("\n")).toContain("Older answer");
		conversationOverlay?.invalidate();

		(conversationOverlay as any).input.onSubmit("");
		(conversationOverlay as any).input.onSubmit("Follow-up");
		await vi.waitFor(() => {
			expect(appendEntry).toHaveBeenCalledWith(
				"btw-thread-entry",
				expect.objectContaining({
					question: "Follow-up",
					conversationId: "conversation-1",
				}),
			);
		});
	});

	it("removes only the active persisted conversation after summary injection", async () => {
		const harness = createExtensionHarness();
		configureModel(harness);
		const appendEntry = vi.fn();
		harness.pi.appendEntry = appendEntry;
		harness.ctx.ui.custom = vi.fn().mockResolvedValue(null);
		btwExtension(harness.pi as never);
		await harness.commands.get("btw").handler("Topic to summarize", harness.ctx);
		const conversationId = appendEntry.mock.calls.find(([type]) => type === "btw-thread-entry")?.[1].conversationId;
		appendEntry.mockClear();

		const { keybindings, tui } = createTuiTestKit();
		let conversationOverlay: BtwOverlay | undefined;
		harness.ctx.ui.custom = vi.fn().mockImplementation(async (factory: any) => {
			let selectedValue: unknown;
			const component = await factory(tui, testTheme, keybindings, (value: unknown) => {
				selectedValue = value;
			});
			if (component instanceof BtwConversationPicker) {
				component.render(90);
				component.handleInput("tui.select.down");
				component.handleInput("tui.select.confirm");
				return selectedValue;
			}
			conversationOverlay = component;
			return null;
		});
		harness.ctx.ui.select = vi.fn().mockResolvedValue("Inject summary into main chat");

		await harness.commands.get("btw").handler("", harness.ctx);
		(conversationOverlay as any).input.onEscape();

		await vi.waitFor(() => {
			expect(appendEntry).toHaveBeenCalledWith("btw-thread-reset", expect.objectContaining({ conversationId }));
		});
	});

	it("keeps the active conversation when summary generation fails", async () => {
		const harness = createExtensionHarness();
		configureModel(harness);
		harness.ctx.ui.custom = vi.fn().mockResolvedValue(null);
		btwExtension(harness.pi as never);
		await harness.commands.get("btw").handler("Topic to summarize", harness.ctx);

		const { keybindings, tui } = createTuiTestKit();
		let conversationOverlay: BtwOverlay | undefined;
		harness.ctx.ui.custom = vi.fn().mockImplementation(async (factory: any) => {
			let selectedValue: unknown;
			const component = await factory(tui, testTheme, keybindings, (value: unknown) => {
				selectedValue = value;
			});
			if (component instanceof BtwConversationPicker) {
				component.render(90);
				component.handleInput("tui.select.down");
				component.handleInput("tui.select.confirm");
				return selectedValue;
			}
			conversationOverlay = component;
			return null;
		});
		harness.ctx.ui.select = vi.fn().mockResolvedValue("Inject summary into main chat");
		await harness.commands.get("btw").handler("", harness.ctx);
		mockSession.prompt.mockRejectedValueOnce(new Error("Summary failed"));

		(conversationOverlay as any).input.onEscape();

		await vi.waitFor(() => {
			expect(harness.notifications).toContainEqual({ msg: "Summary failed", type: "error" });
		});
		expect(harness.userMessages).toHaveLength(0);
	});

	it("does not inject or reset a summary after branch navigation", async () => {
		const harness = createExtensionHarness();
		configureModel(harness);
		const appendEntry = vi.fn();
		harness.pi.appendEntry = appendEntry;
		harness.ctx.ui.custom = vi.fn().mockResolvedValue(null);
		btwExtension(harness.pi as never);
		await harness.commands.get("btw").handler("Topic to summarize", harness.ctx);
		appendEntry.mockClear();

		const { keybindings, tui } = createTuiTestKit();
		let conversationOverlay: BtwOverlay | undefined;
		harness.ctx.ui.custom = vi.fn().mockImplementation(async (factory: any) => {
			let selectedValue: unknown;
			const component = await factory(tui, testTheme, keybindings, (value: unknown) => {
				selectedValue = value;
			});
			if (component instanceof BtwConversationPicker) {
				component.render(90);
				component.handleInput("tui.select.down");
				component.handleInput("tui.select.confirm");
				return selectedValue;
			}
			conversationOverlay = component;
			return null;
		});
		harness.ctx.ui.select = vi.fn().mockResolvedValue("Inject summary into main chat");
		await harness.commands.get("btw").handler("", harness.ctx);

		let resolveSummary: (() => void) | undefined;
		mockSession.prompt.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					resolveSummary = resolve;
				}),
		);
		(conversationOverlay as any).input.onEscape();
		await new Promise((resolve) => setTimeout(resolve, 0));

		harness.ctx.sessionManager.getBranch = vi.fn(() => [
			{
				type: "custom",
				customType: "btw-thread-entry",
				data: {
					question: "Destination topic",
					answer: "Destination answer",
					provider: "anthropic",
					model: "claude-sonnet-4",
					thinkingLevel: "off",
					timestamp: 2,
					conversationId: "destination",
				},
			},
		]);
		await harness.emitAsync("session_tree", { type: "session_tree" }, harness.ctx);
		resolveSummary?.();
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(harness.userMessages).toHaveLength(0);
		expect(appendEntry).not.toHaveBeenCalledWith("btw-thread-reset", expect.anything());
	});

	it("aborts a busy side prompt before restoring a different session branch", async () => {
		const harness = createExtensionHarness();
		configureModel(harness);
		const appendEntry = vi.fn();
		harness.pi.appendEntry = appendEntry;

		let resolvePrompt: (() => void) | undefined;
		mockSession.prompt.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					resolvePrompt = resolve;
				}),
		);

		btwExtension(harness.pi as never);
		const runPromise = harness.commands.get("btw").handler("Question?", harness.ctx);
		await new Promise((resolve) => setTimeout(resolve, 0));
		await harness.commands.get("btw").handler("Another question?", harness.ctx);
		expect(harness.notifications).toContainEqual({
			msg: "BTW is still processing the previous message.",
			type: "warning",
		});

		const getBranch = vi.fn(() => []);
		harness.ctx.sessionManager.getBranch = getBranch;
		await harness.emitAsync("session_tree", { type: "session_tree" }, harness.ctx);

		expect(mockSession.abort).toHaveBeenCalled();
		expect(getBranch).toHaveBeenCalled();

		resolvePrompt?.();
		await runPromise;
		expect(appendEntry).not.toHaveBeenCalled();
	});

	it("does not start a prompt on a new branch when navigation happens during authentication", async () => {
		const harness = createExtensionHarness();
		configureModel(harness);
		const appendEntry = vi.fn();
		harness.pi.appendEntry = appendEntry;
		let resolveAuth: ((value: { ok: true; apiKey: string; headers: object }) => void) | undefined;
		harness.ctx.modelRegistry.getApiKeyAndHeaders = vi.fn(
			() =>
				new Promise((resolve) => {
					resolveAuth = resolve;
				}),
		);
		btwExtension(harness.pi as never);

		const runPromise = harness.commands.get("btw").handler("Old branch question", harness.ctx);
		await new Promise((resolve) => setTimeout(resolve, 0));
		harness.ctx.sessionManager.getBranch = vi.fn(() => [
			{
				type: "custom",
				customType: "btw-thread-entry",
				data: {
					question: "Destination topic",
					answer: "Destination answer",
					provider: "anthropic",
					model: "claude-sonnet-4",
					thinkingLevel: "off",
					timestamp: 2,
					conversationId: "destination",
				},
			},
		]);
		await harness.emitAsync("session_tree", { type: "session_tree" }, harness.ctx);
		resolveAuth?.({ ok: true, apiKey: "key", headers: {} });
		await runPromise;

		expect(mockSession.prompt).not.toHaveBeenCalled();
		expect(appendEntry).not.toHaveBeenCalled();
	});

	it("does not prompt when navigation happens during side-session creation", async () => {
		const harness = createExtensionHarness();
		configureModel(harness);
		const appendEntry = vi.fn();
		harness.pi.appendEntry = appendEntry;
		let resolveSession: ((value: unknown) => void) | undefined;
		vi.mocked(createAgentSession).mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolveSession = resolve;
				}) as never,
		);
		btwExtension(harness.pi as never);

		const runPromise = harness.commands.get("btw").handler("Old branch question", harness.ctx);
		await new Promise((resolve) => setTimeout(resolve, 0));
		await harness.emitAsync("session_tree", { type: "session_tree" }, harness.ctx);
		resolveSession?.({ session: mockSession, extensionsResult: { extensions: [], errors: [], runtime: {} } });
		await runPromise;

		expect(mockSession.prompt).not.toHaveBeenCalled();
		expect(appendEntry).not.toHaveBeenCalled();
	});

	it("suppresses stale errors after branch navigation", async () => {
		const harness = createExtensionHarness();
		configureModel(harness);
		let rejectPrompt: ((error: Error) => void) | undefined;
		mockSession.prompt.mockImplementation(
			() =>
				new Promise<void>((_resolve, reject) => {
					rejectPrompt = reject;
				}),
		);
		btwExtension(harness.pi as never);

		const runPromise = harness.commands.get("btw").handler("Question?", harness.ctx);
		await new Promise((resolve) => setTimeout(resolve, 0));
		await harness.emitAsync("session_tree", { type: "session_tree" }, harness.ctx);
		rejectPrompt?.(new Error("stale failure"));
		await runPromise;

		expect(harness.notifications).not.toContainEqual({ msg: "stale failure", type: "error" });
	});
});

describe("btw transcript overlay", () => {
	it("scrolls long transcripts by page and follows the tail again", () => {
		const { keybindings, tui } = createTuiTestKit();
		const transcript = Array.from({ length: 50 }, (_, index) => `line-${index}`);
		const onInvalidate = vi.fn();
		const overlay = new BtwOverlay(
			tui as never,
			testTheme as never,
			keybindings as never,
			() => transcript,
			() => "Ready",
			() => {},
			() => {},
			onInvalidate,
		);

		const tail = overlay.render(80).join("\n");
		expect(tail).toContain("line-49");
		expect(tail).not.toContain("line-0");

		overlay.handleInput("tui.select.pageUp");
		const olderPage = overlay.render(80).join("\n");
		expect(olderPage).toContain("line-36");
		expect(olderPage).not.toContain("line-49");

		transcript.push("line-50", "line-51");
		expect(overlay.render(80).join("\n")).toContain("line-36");

		overlay.handleInput("tui.select.pageDown");
		overlay.handleInput("tui.select.pageDown");
		expect(overlay.render(80).join("\n")).toContain("line-51");
		overlay.invalidate();
		expect(onInvalidate).toHaveBeenCalledOnce();

		tui.terminal.rows = 1;
		expect(overlay.render(80)).toHaveLength(1);
		tui.terminal.rows = 6;
		const compact = overlay.render(80);
		expect(compact).toHaveLength(4);
		expect(compact.join("\n")).toContain("BTW side chat");
		expect(tui.requestRender).toHaveBeenCalled();
	});
});

describe("btw conversation picker", () => {
	it("uses a fixed percentage height and scrolls overflowing options", () => {
		const { keybindings, tui } = createTuiTestKit();
		const onSelect = vi.fn();
		const onCancel = vi.fn();
		const items = Array.from({ length: 30 }, (_, index) => ({
			id: `conversation-${index}`,
			label: `Conversation ${index}`,
			description: `${index + 1} exchanges`,
		}));
		const picker = new BtwConversationPicker(
			tui as never,
			testTheme as never,
			keybindings as never,
			items,
			onSelect,
			onCancel,
		);

		const expectedHeight = getPickerHeight(tui.terminal.rows);
		const firstPage = picker.render(90);
		expect(firstPage).toHaveLength(expectedHeight);
		expect(firstPage.join("\n")).toContain("Conversation 0");
		expect(firstPage.join("\n")).not.toContain("Conversation 29");
		expect(getPickerHeight(40)).toBe(22);

		picker.handleInput("tui.select.pageDown");
		const nextPage = picker.render(90).join("\n");
		expect(nextPage).not.toContain("Conversation 0");
		picker.handleInput("tui.select.pageUp");
		picker.handleInput("tui.select.up");
		picker.handleInput("unbound-key");
		picker.handleInput("tui.select.cancel");
		picker.handleInput("tui.select.confirm");
		expect(onCancel).toHaveBeenCalledOnce();
		expect(onSelect).toHaveBeenCalledWith(expect.any(String));
	});

	it("keeps the selected option visible on short terminals", () => {
		const { keybindings, tui } = createTuiTestKit();
		tui.terminal.rows = 8;
		const items = Array.from({ length: 10 }, (_, index) => ({
			id: `conversation-${index}`,
			label: `Conversation ${index}`,
			description: "Saved thread",
		}));
		const picker = new BtwConversationPicker(
			tui as never,
			testTheme as never,
			keybindings as never,
			items,
			() => {},
			() => {},
		);

		expect(picker.render(60)).toHaveLength(getPickerHeight(8));
		picker.handleInput("tui.select.pageDown");
		const lines = picker.render(60);
		expect(lines).toHaveLength(getPickerHeight(8));
		expect(lines.join("\n")).toContain("Conversation 1");
	});
});

describe("btw startup restore", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("ignores entries before the last reset marker", async () => {
		const harness = createExtensionHarness();
		const getBranch = vi.fn(() => [
			{
				type: "custom",
				customType: "btw-thread-entry",
				data: {
					question: "Old question",
					answer: "Old answer",
					provider: "anthropic",
					model: "claude-sonnet-4",
					thinkingLevel: "off",
					timestamp: Date.now(),
				},
			},
			{ type: "custom", customType: "btw-thread-reset", data: { timestamp: Date.now() } },
		]);
		harness.ctx.sessionManager.getBranch = getBranch;

		btwExtension(harness.pi as never);
		await harness.emitAsync("session_start", { type: "session_start" }, harness.ctx);

		const { keybindings, tui } = createTuiTestKit();
		let component: unknown;
		harness.ctx.ui.custom = vi.fn().mockImplementation(async (factory: any) => {
			component = await factory(tui, testTheme, keybindings, () => {});
			return null;
		});
		await harness.commands.get("btw").handler("", harness.ctx);
		await Promise.resolve();

		expect(getBranch).toHaveBeenCalled();
		expect(component).toBeInstanceOf(BtwOverlay);
		expect((component as BtwOverlay).render(90).join("\n")).not.toContain("Old question");
	});
});
