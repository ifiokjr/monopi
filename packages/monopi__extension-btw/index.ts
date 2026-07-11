/**
 * BTW side-chat extension for pi.
 *
 * Adapted from mitsuhiko/agent-stuff extensions/btw.ts.
 * Copyright Armin Ronacher and contributors. Licensed under Apache-2.0.
 * See this package README for attribution.
 */

import { type AssistantMessage, type Message, type ThinkingLevel as AiThinkingLevel } from "@earendil-works/pi-ai";
import {
	buildSessionContext,
	createAgentSession,
	createExtensionRuntime,
	getMarkdownTheme,
	SessionManager,
	type AgentSession,
	type AgentSessionEvent,
	type ExtensionAPI,
	type ExtensionCommandContext,
	type ExtensionContext,
	type ResourceLoader,
} from "@earendil-works/pi-coding-agent";
import {
	Container,
	Input,
	Markdown,
	truncateToWidth,
	visibleWidth,
	type Focusable,
	type KeybindingsManager,
	type OverlayHandle,
	type TUI,
} from "@earendil-works/pi-tui";

const BTW_ENTRY_TYPE = "btw-thread-entry";
const BTW_RESET_TYPE = "btw-thread-reset";
const BTW_START_TYPE = "btw-thread-start";
const CONVERSATION_PICKER_HEIGHT_RATIO = 0.55;
const LEGACY_CONVERSATION_ID = "legacy";

const BTW_SYSTEM_PROMPT = [
	"You are BTW, a side-channel assistant embedded in the user's coding agent.",
	"You have access to the main conversation context — use it to give informed answers.",
	"Help with focused questions, planning, and quick explorations.",
	"Be direct and practical.",
].join(" ");

const BTW_SUMMARY_PROMPT =
	"Summarize this side conversation for handoff into the main conversation. Keep key decisions, findings, risks, and next actions. Output only the summary.";

type SessionThinkingLevel = "off" | AiThinkingLevel;

type BtwDetails = {
	question: string;
	answer: string;
	timestamp: number;
	provider: string;
	model: string;
	thinkingLevel: SessionThinkingLevel;
	conversationId?: string;
	usage?: AssistantMessage["usage"];
};

type BtwConversation = {
	id: string;
	createdAt: number;
	updatedAt: number;
	thread: BtwDetails[];
	persisted: boolean;
};

type BtwStartDetails = {
	conversationId: string;
	timestamp: number;
};

type BtwResetDetails = {
	timestamp: number;
	conversationId?: string;
};

type OverlayRuntime = {
	handle?: OverlayHandle;
	refresh?: () => void;
	close?: () => void;
	finish?: () => void;
	setDraft?: (value: string) => void;
	scrollToBottom?: () => void;
	closed?: boolean;
};

export type ConversationPickerItem = {
	id: string | null;
	label: string;
	description: string;
};

type SideSessionRuntime = {
	session: AgentSession;
	modelKey: string;
	unsubscribe: () => void;
};

type ToolCallInfo = {
	toolCallId: string;
	toolName: string;
	args: string;
	status: "running" | "done" | "error";
};

function stripDynamicSystemPromptFooter(systemPrompt: string): string {
	return systemPrompt
		.replace(/\nCurrent date and time:[^\n]*(?:\nCurrent working directory:[^\n]*)?$/u, "")
		.replace(/\nCurrent working directory:[^\n]*$/u, "")
		.trim();
}

function createBtwResourceLoader(
	ctx: ExtensionContext,
	appendSystemPrompt: string[] = [BTW_SYSTEM_PROMPT],
): ResourceLoader {
	const extensionsResult = { extensions: [], errors: [], runtime: createExtensionRuntime() };
	const systemPrompt = stripDynamicSystemPromptFooter(ctx.getSystemPrompt());

	return {
		getExtensions: () => extensionsResult,
		getSkills: () => ({ skills: [], diagnostics: [] }),
		getPrompts: () => ({ prompts: [], diagnostics: [] }),
		getThemes: () => ({ themes: [], diagnostics: [] }),
		getAgentsFiles: () => ({ agentsFiles: [] }),
		getSystemPrompt: () => systemPrompt,
		getAppendSystemPrompt: () => appendSystemPrompt,
		extendResources: () => {},
		reload: async () => {},
	};
}

function extractText(parts: AssistantMessage["content"]): string {
	return parts
		.filter((part) => part.type === "text")
		.map((part) => part.text)
		.join("\n")
		.trim();
}

function extractEventAssistantText(message: unknown): string {
	if (!message || typeof message !== "object") {
		return "";
	}

	const maybeMessage = message as { role?: unknown; content?: unknown };
	if (maybeMessage.role !== "assistant" || !Array.isArray(maybeMessage.content)) {
		return "";
	}

	return maybeMessage.content
		.filter((part): part is { type: "text"; text: string } => {
			return !!part && typeof part === "object" && (part as { type?: unknown }).type === "text";
		})
		.map((part) => part.text)
		.join("\n")
		.trim();
}

function getLastAssistantMessage(session: AgentSession): AssistantMessage | null {
	for (let i = session.state.messages.length - 1; i >= 0; i--) {
		const message = session.state.messages[i];
		if (message.role === "assistant") {
			return message as AssistantMessage;
		}
	}

	return null;
}

function buildSeedMessages(ctx: ExtensionContext, thread: BtwDetails[]): Message[] {
	const seed: Message[] = [];

	try {
		const contextMessages = buildSessionContext(
			ctx.sessionManager.getEntries(),
			ctx.sessionManager.getLeafId(),
		).messages;
		seed.push(...(contextMessages.filter((message) => "role" in message) as Message[]));
	} catch {
		// Ignore context seed failures and continue with an empty side thread.
	}

	for (const item of thread) {
		seed.push(
			{
				role: "user",
				content: [{ type: "text", text: item.question }],
				timestamp: item.timestamp,
			},
			{
				role: "assistant",
				content: [{ type: "text", text: item.answer }],
				provider: item.provider,
				model: item.model,
				api: ctx.model?.api ?? "openai-responses",
				usage: item.usage ?? {
					input: 0,
					output: 0,
					cacheRead: 0,
					cacheWrite: 0,
					totalTokens: 0,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				},
				stopReason: "stop",
				timestamp: item.timestamp,
			},
		);
	}

	return seed;
}

function formatThread(thread: BtwDetails[]): string {
	return thread.map((item) => `User: ${item.question.trim()}\nAssistant: ${item.answer.trim()}`).join("\n\n---\n\n");
}

function notify(
	ctx: ExtensionContext | ExtensionCommandContext,
	message: string,
	level: "info" | "warning" | "error",
): void {
	if (ctx.hasUI) {
		ctx.ui.notify(message, level);
	}
}

function getConversationTitle(conversation: BtwConversation): string {
	const firstQuestion = conversation.thread[0]?.question.replace(/\s+/gu, " ").trim();
	return firstQuestion || "Untitled conversation";
}

export function getPickerHeight(terminalRows: number): number {
	return Math.max(1, Math.floor(Math.max(1, terminalRows) * CONVERSATION_PICKER_HEIGHT_RATIO));
}

export class BtwConversationPicker extends Container {
	private readonly items: ConversationPickerItem[];
	private readonly tui: TUI;
	private readonly theme: ExtensionContext["ui"]["theme"];
	private readonly keybindings: KeybindingsManager;
	private readonly onSelectCallback: (id: string | null) => void;
	private readonly onCancelCallback: () => void;
	private selectedIndex = 0;
	private scrollOffset = 0;
	private viewportHeight = 3;

	constructor(
		tui: TUI,
		theme: ExtensionContext["ui"]["theme"],
		keybindings: KeybindingsManager,
		items: ConversationPickerItem[],
		onSelect: (id: string | null) => void,
		onCancel: () => void,
	) {
		super();
		this.tui = tui;
		this.theme = theme;
		this.keybindings = keybindings;
		this.items = items;
		this.onSelectCallback = onSelect;
		this.onCancelCallback = onCancel;
	}

	handleInput(data: string): void {
		if (this.keybindings.matches(data, "tui.select.cancel")) {
			this.onCancelCallback();
			return;
		}
		if (this.keybindings.matches(data, "tui.select.confirm")) {
			const selected = this.items[this.selectedIndex];
			if (selected) {
				this.onSelectCallback(selected.id);
			}
			return;
		}

		let nextIndex = this.selectedIndex;
		if (this.keybindings.matches(data, "tui.select.up")) {
			nextIndex--;
		} else if (this.keybindings.matches(data, "tui.select.down")) {
			nextIndex++;
		} else if (this.keybindings.matches(data, "tui.select.pageUp")) {
			nextIndex -= this.viewportHeight;
		} else if (this.keybindings.matches(data, "tui.select.pageDown")) {
			nextIndex += this.viewportHeight;
		} else {
			return;
		}

		this.selectedIndex = Math.max(0, Math.min(nextIndex, this.items.length - 1));
		this.ensureSelectionVisible();
		this.tui.requestRender();
	}

	private ensureSelectionVisible(): void {
		const maxOffset = Math.max(0, this.items.length - this.viewportHeight);
		if (this.selectedIndex < this.scrollOffset) {
			this.scrollOffset = this.selectedIndex;
		} else if (this.selectedIndex >= this.scrollOffset + this.viewportHeight) {
			this.scrollOffset = this.selectedIndex - this.viewportHeight + 1;
		}
		this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, maxOffset));
	}

	private borderLine(width: number, edge: "top" | "middle" | "bottom"): string {
		const [left, right] = edge === "top" ? ["┌", "┐"] : edge === "middle" ? ["├", "┤"] : ["└", "┘"];
		return this.theme.fg("borderMuted", `${left}${"─".repeat(Math.max(0, width - 2))}${right}`);
	}

	private frameLine(content: string, width: number): string {
		const innerWidth = Math.max(1, width - 2);
		const truncated = truncateToWidth(content, innerWidth, "");
		return `${this.theme.fg("borderMuted", "│")}${truncated}${" ".repeat(Math.max(0, innerWidth - visibleWidth(truncated)))}${this.theme.fg("borderMuted", "│")}`;
	}

	override render(width: number): string[] {
		const pickerWidth = Math.max(2, width);
		const pickerHeight = getPickerHeight(this.tui.terminal.rows);
		if (pickerHeight < 8) {
			this.viewportHeight = 1;
			this.ensureSelectionVisible();
			const item = this.items[this.selectedIndex];
			const itemLabel = item ? this.theme.fg("accent", `→ ${item.label}`) : this.theme.fg("dim", "No conversations");
			const compactLines: string[] = [];
			if (pickerHeight >= 3) {
				compactLines.push(this.frameLine(this.theme.fg("accent", this.theme.bold(" BTW conversations ")), pickerWidth));
			}
			compactLines.push(this.frameLine(itemLabel, pickerWidth));
			while (compactLines.length < pickerHeight - 1) {
				compactLines.push(this.frameLine("", pickerWidth));
			}
			if (pickerHeight >= 2) {
				compactLines.push(
					this.frameLine(
						this.theme.fg("dim", `↑↓ · Enter · ${this.selectedIndex + 1}/${this.items.length}`),
						pickerWidth,
					),
				);
			}
			return compactLines;
		}

		this.viewportHeight = pickerHeight - 5;
		this.ensureSelectionVisible();

		const endIndex = Math.min(this.items.length, this.scrollOffset + this.viewportHeight);
		const lines = [
			this.borderLine(pickerWidth, "top"),
			this.frameLine(this.theme.fg("accent", this.theme.bold(" BTW conversations ")), pickerWidth),
			this.borderLine(pickerWidth, "middle"),
		];

		for (let index = this.scrollOffset; index < endIndex; index++) {
			const item = this.items[index];
			if (!item) continue;
			const prefix = index === this.selectedIndex ? "→ " : "  ";
			const label = `${prefix}${item.label}`;
			const availableDescriptionWidth = Math.max(0, pickerWidth - visibleWidth(label) - 5);
			const description =
				availableDescriptionWidth >= 12 ? `  ${truncateToWidth(item.description, availableDescriptionWidth, "…")}` : "";
			const content = index === this.selectedIndex ? this.theme.fg("accent", label + description) : label + description;
			lines.push(this.frameLine(content, pickerWidth));
		}
		while (lines.length < this.viewportHeight + 3) {
			lines.push(this.frameLine("", pickerWidth));
		}

		const position = this.items.length > this.viewportHeight ? ` · ${this.selectedIndex + 1}/${this.items.length}` : "";
		lines.push(
			this.frameLine(
				this.theme.fg("dim", `↑↓ navigate · PgUp/PgDn page · Enter select · Esc cancel${position}`),
				pickerWidth,
			),
		);
		lines.push(this.borderLine(pickerWidth, "bottom"));
		return lines;
	}
}

export class BtwOverlay extends Container implements Focusable {
	private readonly input: Input;
	private readonly tui: TUI;
	private readonly theme: ExtensionContext["ui"]["theme"];
	private readonly keybindings: KeybindingsManager;
	private readonly getTranscript: (width: number, theme: ExtensionContext["ui"]["theme"]) => string[];
	private readonly getStatus: () => string;
	private readonly onSubmitCallback: (value: string) => void;
	private readonly onDismissCallback: () => void;
	private readonly onInvalidateCallback: () => void;
	private isFocused = false;
	private scrollOffset = 0;
	private transcriptHeight = 6;
	private previousTranscriptLength = 0;

	get focused(): boolean {
		return this.isFocused;
	}

	set focused(value: boolean) {
		this.isFocused = value;
		this.input.focused = value;
	}

	constructor(
		tui: TUI,
		theme: ExtensionContext["ui"]["theme"],
		keybindings: KeybindingsManager,
		getTranscript: (width: number, theme: ExtensionContext["ui"]["theme"]) => string[],
		getStatus: () => string,
		onSubmit: (value: string) => void,
		onDismiss: () => void,
		onInvalidate: () => void,
	) {
		super();
		this.tui = tui;
		this.theme = theme;
		this.keybindings = keybindings;
		this.getTranscript = getTranscript;
		this.getStatus = getStatus;
		this.onSubmitCallback = onSubmit;
		this.onDismissCallback = onDismiss;
		this.onInvalidateCallback = onInvalidate;

		this.input = new Input();
		this.input.onSubmit = (value) => {
			this.onSubmitCallback(value);
		};
		this.input.onEscape = () => {
			this.onDismissCallback();
		};
	}

	handleInput(data: string): void {
		if (this.keybindings.matches(data, "tui.select.cancel")) {
			this.onDismissCallback();
			return;
		}
		if (this.keybindings.matches(data, "tui.select.pageUp")) {
			this.scrollOffset += this.transcriptHeight;
			this.tui.requestRender();
			return;
		}
		if (this.keybindings.matches(data, "tui.select.pageDown")) {
			this.scrollOffset = Math.max(0, this.scrollOffset - this.transcriptHeight);
			this.tui.requestRender();
			return;
		}

		this.input.handleInput(data);
	}

	scrollToBottom(): void {
		this.scrollOffset = 0;
		this.tui.requestRender();
	}

	setDraft(value: string): void {
		this.input.setValue(value);
		this.tui.requestRender();
	}

	getDraft(): string {
		return this.input.getValue();
	}

	private frameLine(content: string, innerWidth: number): string {
		const truncated = truncateToWidth(content, innerWidth, "");
		const padding = Math.max(0, innerWidth - visibleWidth(truncated));
		return `${this.theme.fg("borderMuted", "│")}${truncated}${" ".repeat(padding)}${this.theme.fg("borderMuted", "│")}`;
	}

	private borderLine(innerWidth: number, edge: "top" | "bottom"): string {
		const left = edge === "top" ? "┌" : "└";
		const right = edge === "top" ? "┐" : "┘";
		return this.theme.fg("borderMuted", `${left}${"─".repeat(innerWidth)}${right}`);
	}

	override render(width: number): string[] {
		const dialogWidth = Math.max(2, Math.min(width, Math.floor(width * 0.9)));
		const innerWidth = Math.max(1, dialogWidth - 2);
		const terminalRows = this.tui.terminal.rows;
		const dialogHeight = Math.max(1, Math.min(30, Math.floor(Math.max(1, terminalRows) * 0.75)));
		const compact = dialogHeight < 10;
		const chromeHeight = compact ? Math.min(3, Math.max(1, dialogHeight - 1)) : 9;
		this.transcriptHeight = Math.max(1, dialogHeight - chromeHeight);

		// Markdown renders to innerWidth already — no manual wrapping needed.
		const transcript = this.getTranscript(innerWidth, this.theme);
		if (this.scrollOffset > 0 && transcript.length > this.previousTranscriptLength) {
			this.scrollOffset += transcript.length - this.previousTranscriptLength;
		}
		this.previousTranscriptLength = transcript.length;
		const maxScrollOffset = Math.max(0, transcript.length - this.transcriptHeight);
		this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, maxScrollOffset));
		const transcriptEnd = Math.max(0, transcript.length - this.scrollOffset);
		const transcriptStart = Math.max(0, transcriptEnd - this.transcriptHeight);
		const visibleTranscript = transcript.slice(transcriptStart, transcriptEnd);
		const transcriptPadding = Math.max(0, this.transcriptHeight - visibleTranscript.length);

		const status = this.getStatus();

		const previousFocused = this.input.focused;
		this.input.focused = false;
		const inputLine = this.input.render(innerWidth)[0] ?? "";
		this.input.focused = previousFocused;

		if (compact) {
			if (dialogHeight === 1) {
				return [truncateToWidth(inputLine, dialogWidth, "")];
			}
			const compactLines: string[] = [];
			if (dialogHeight >= 4) {
				compactLines.push(this.frameLine(this.theme.fg("accent", this.theme.bold(" BTW side chat ")), innerWidth));
			}
			for (const line of visibleTranscript) {
				compactLines.push(this.frameLine(line, innerWidth));
			}
			if (dialogHeight >= 3) {
				compactLines.push(this.frameLine(this.theme.fg("warning", status), innerWidth));
			}
			compactLines.push(`${this.theme.fg("borderMuted", "│")}${inputLine}${this.theme.fg("borderMuted", "│")}`);
			return compactLines.slice(0, dialogHeight);
		}

		const lines = [
			this.borderLine(innerWidth, "top"),
			this.frameLine(this.theme.fg("accent", this.theme.bold(" BTW side chat ")), innerWidth),
			this.frameLine(this.theme.fg("dim", "Separate side conversation. Esc closes."), innerWidth),
			this.theme.fg("borderMuted", `├${"─".repeat(innerWidth)}┤`),
		];

		for (const line of visibleTranscript) {
			lines.push(this.frameLine(line, innerWidth));
		}
		for (let i = 0; i < transcriptPadding; i++) {
			lines.push(this.frameLine("", innerWidth));
		}

		lines.push(this.theme.fg("borderMuted", `├${"─".repeat(innerWidth)}┤`));
		const scrollPosition =
			transcript.length > this.transcriptHeight
				? ` · ${transcriptStart + 1}-${transcriptEnd}/${transcript.length}`
				: "";
		lines.push(this.frameLine(this.theme.fg("warning", status) + this.theme.fg("dim", scrollPosition), innerWidth));
		lines.push(`${this.theme.fg("borderMuted", "│")}${inputLine}${this.theme.fg("borderMuted", "│")}`);
		lines.push(this.frameLine(this.theme.fg("dim", "Enter submit · PgUp/PgDn scroll · Esc close"), innerWidth));
		lines.push(this.borderLine(innerWidth, "bottom"));

		return lines;
	}

	override invalidate(): void {
		super.invalidate();
		this.onInvalidateCallback();
	}
}

export default function (pi: ExtensionAPI) {
	const conversations = new Map<string, BtwConversation>();
	let activeConversationId: string | null = null;
	let thread: BtwDetails[] = [];
	let conversationSequence = 0;
	let pendingQuestion: string | null = null;
	let pendingAnswer = "";
	let pendingError: string | null = null;
	let pendingToolCalls: ToolCallInfo[] = [];
	let sideBusy = false;
	let sideRequestGeneration = 0;
	let overlayStatus = "Ready";
	let overlayDraft = "";
	let overlayRuntime: OverlayRuntime | null = null;
	let activeSideSession: SideSessionRuntime | null = null;
	let overlayRefreshTimer: ReturnType<typeof setTimeout> | null = null;

	const mdTheme = getMarkdownTheme();
	let renderedAnswerCache = new WeakMap<BtwDetails, { width: number; answer: string; lines: string[] }>();

	function createConversationId(): string {
		conversationSequence++;
		return `${Date.now().toString(36)}-${conversationSequence.toString(36)}`;
	}

	function setActiveConversation(id: string | null): void {
		activeConversationId = id;
		thread = id ? (conversations.get(id)?.thread ?? []) : [];
	}

	function createConversation(): BtwConversation {
		const timestamp = Date.now();
		const conversation: BtwConversation = {
			id: createConversationId(),
			createdAt: timestamp,
			updatedAt: timestamp,
			thread: [],
			persisted: false,
		};
		conversations.set(conversation.id, conversation);
		setActiveConversation(conversation.id);
		return conversation;
	}

	function getSortedConversations(): BtwConversation[] {
		return Array.from(conversations.values()).sort((a, b) => b.updatedAt - a.updatedAt);
	}

	function getModelKey(ctx: ExtensionContext): string {
		const model = ctx.model;
		return model ? `${model.provider}/${model.id}` : "none";
	}

	function renderMarkdownLines(text: string, width: number): string[] {
		if (!text) return [];
		try {
			const md = new Markdown(text, 0, 0, mdTheme);
			return md.render(width);
		} catch {
			// Fall back to plain text wrapping if Markdown rendering fails.
			const lines: string[] = [];
			for (const line of text.split("\n")) {
				if (!line) {
					lines.push("");
					continue;
				}
				for (let index = 0; index < line.length; index += width) {
					lines.push(line.slice(index, index + width));
				}
			}
			return lines;
		}
	}

	function renderCompletedAnswer(item: BtwDetails, width: number): string[] {
		const cached = renderedAnswerCache.get(item);
		if (cached && cached.width === width && cached.answer === item.answer) {
			return cached.lines;
		}
		const lines = renderMarkdownLines(item.answer, width);
		renderedAnswerCache.set(item, { width, answer: item.answer, lines });
		return lines;
	}

	function formatToolArgs(toolName: string, args: unknown): string {
		if (!args || typeof args !== "object") return "";
		const a = args as Record<string, unknown>;
		switch (toolName) {
			case "bash":
				return typeof a.command === "string" ? truncateToWidth(a.command.split("\n")[0], 50, "…") : "";
			case "read":
			case "write":
			case "edit":
				return typeof a.path === "string" ? a.path : "";
			default: {
				const first = Object.values(a)[0];
				return typeof first === "string" ? truncateToWidth(first.split("\n")[0], 40, "…") : "";
			}
		}
	}

	function renderToolCallLines(
		toolCalls: ToolCallInfo[],
		theme: ExtensionContext["ui"]["theme"],
		width: number,
	): string[] {
		const lines: string[] = [];
		for (const tc of toolCalls) {
			const icon = tc.status === "running" ? "⚙" : tc.status === "error" ? "✗" : "✓";
			const color = tc.status === "error" ? "error" : tc.status === "done" ? "success" : "dim";
			const label = theme.fg(color, `${icon} `) + theme.fg("toolTitle", tc.toolName);
			const argsText = tc.args ? theme.fg("dim", ` ${tc.args}`) : "";
			lines.push(truncateToWidth(`  ${label}${argsText}`, width, ""));
		}
		return lines;
	}

	function getTranscriptLines(width: number, theme: ExtensionContext["ui"]["theme"]): string[] {
		try {
			return getTranscriptLinesInner(width, theme);
		} catch (error) {
			return [theme.fg("error", `Render error: ${error instanceof Error ? error.message : String(error)}`)];
		}
	}

	function getTranscriptLinesInner(width: number, theme: ExtensionContext["ui"]["theme"]): string[] {
		if (thread.length === 0 && !pendingQuestion && !pendingAnswer && !pendingError) {
			return [theme.fg("dim", "No BTW messages yet. Type a question below.")];
		}

		const lines: string[] = [];
		for (const item of thread) {
			// User message
			const userText = item.question.trim().split("\n")[0];
			lines.push(theme.fg("accent", theme.bold("You: ")) + truncateToWidth(userText, width - 5, "…"));
			lines.push("");

			// Assistant message rendered as markdown
			const mdLines = renderCompletedAnswer(item, width);
			lines.push(...mdLines);
			lines.push("");
		}

		if (pendingQuestion) {
			const userText = pendingQuestion.trim().split("\n")[0];
			lines.push(theme.fg("accent", theme.bold("You: ")) + truncateToWidth(userText, width - 5, "…"));

			// Show tool calls inline
			if (pendingToolCalls.length > 0) {
				lines.push(...renderToolCallLines(pendingToolCalls, theme, width));
			}

			if (pendingError) {
				lines.push(theme.fg("error", `❌ ${pendingError}`));
			} else if (pendingAnswer) {
				lines.push("");
				const mdLines = renderMarkdownLines(pendingAnswer, width);
				lines.push(...mdLines);
			} else if (pendingToolCalls.length === 0) {
				lines.push(theme.fg("dim", "…"));
			}
		}

		// Trim trailing empty line
		while (lines.length > 0 && lines[lines.length - 1] === "") {
			lines.pop();
		}
		return lines;
	}

	function syncOverlay(): void {
		overlayRuntime?.refresh?.();
	}

	function scheduleOverlayRefresh(): void {
		if (overlayRefreshTimer) {
			return;
		}

		overlayRefreshTimer = setTimeout(() => {
			overlayRefreshTimer = null;
			syncOverlay();
		}, 16);
	}

	function setOverlayStatus(status: string, throttled = false): void {
		overlayStatus = status;
		if (throttled) {
			scheduleOverlayRefresh();
		} else {
			syncOverlay();
		}
	}

	function dismissOverlay(): void {
		overlayRuntime?.close?.();
		overlayRuntime = null;
		if (overlayRefreshTimer) {
			clearTimeout(overlayRefreshTimer);
			overlayRefreshTimer = null;
		}
	}

	function setOverlayDraft(value: string): void {
		overlayDraft = value;
		overlayRuntime?.setDraft?.(value);
	}

	async function disposeSideSession(): Promise<void> {
		const current = activeSideSession;
		activeSideSession = null;
		if (!current) {
			return;
		}

		try {
			current.unsubscribe();
		} catch {
			// Ignore unsubscribe errors during cleanup.
		}

		try {
			await current.session.abort();
		} catch {
			// Ignore abort errors during cleanup.
		}
		current.session.dispose();

		if (overlayRefreshTimer) {
			clearTimeout(overlayRefreshTimer);
			overlayRefreshTimer = null;
		}
	}

	function clearTransientState(): void {
		pendingQuestion = null;
		pendingAnswer = "";
		pendingError = null;
		pendingToolCalls = [];
		sideBusy = false;
		overlayDraft = "";
		overlayStatus = "Ready";
	}

	async function resetThread(_ctx: ExtensionContext | ExtensionCommandContext, persist = true): Promise<void> {
		const conversationId = activeConversationId;
		clearTransientState();
		setOverlayDraft("");
		if (conversationId) {
			const conversation = conversations.get(conversationId);
			conversations.delete(conversationId);
			if (persist && conversation?.persisted) {
				const details: BtwResetDetails = { conversationId, timestamp: Date.now() };
				pi.appendEntry(BTW_RESET_TYPE, details);
			}
		}
		setActiveConversation(null);
		await disposeSideSession();
		setOverlayStatus("Ready");
		syncOverlay();
	}

	async function restoreThread(ctx: ExtensionContext): Promise<void> {
		await disposeSideSession();
		conversations.clear();
		setActiveConversation(null);
		clearTransientState();
		renderedAnswerCache = new WeakMap();

		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type !== "custom") {
				continue;
			}

			if (entry.customType === BTW_START_TYPE) {
				const details = entry.data as BtwStartDetails | undefined;
				if (!details?.conversationId || !Number.isFinite(details.timestamp)) {
					continue;
				}
				conversations.set(details.conversationId, {
					id: details.conversationId,
					createdAt: details.timestamp,
					updatedAt: details.timestamp,
					thread: [],
					persisted: true,
				});
				continue;
			}

			if (entry.customType === BTW_RESET_TYPE) {
				const details = entry.data as BtwResetDetails | undefined;
				conversations.delete(details?.conversationId || LEGACY_CONVERSATION_ID);
				continue;
			}

			if (entry.customType !== BTW_ENTRY_TYPE) {
				continue;
			}
			const details = entry.data as BtwDetails | undefined;
			if (!details?.question || !details.answer || !Number.isFinite(details.timestamp)) {
				continue;
			}
			const conversationId = details.conversationId || LEGACY_CONVERSATION_ID;
			let conversation = conversations.get(conversationId);
			if (!conversation) {
				conversation = {
					id: conversationId,
					createdAt: details.timestamp,
					updatedAt: details.timestamp,
					thread: [],
					persisted: true,
				};
				conversations.set(conversationId, conversation);
			}
			conversation.thread.push(details);
			conversation.updatedAt = Math.max(conversation.updatedAt, details.timestamp);
		}

		setActiveConversation(getSortedConversations()[0]?.id ?? null);
		syncOverlay();
	}

	async function createSideSession(ctx: ExtensionCommandContext): Promise<SideSessionRuntime | null> {
		if (!ctx.model) {
			return null;
		}

		const { session } = await createAgentSession({
			sessionManager: SessionManager.inMemory(),
			model: ctx.model,
			modelRegistry: ctx.modelRegistry as AgentSession["modelRegistry"],
			thinkingLevel: pi.getThinkingLevel() as SessionThinkingLevel,
			tools: ["read", "bash", "edit", "write"],
			resourceLoader: createBtwResourceLoader(ctx),
		});

		const seedMessages = buildSeedMessages(ctx, thread);
		if (seedMessages.length > 0) {
			session.agent.state.messages = seedMessages as typeof session.agent.state.messages;
		}

		const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
			if (!sideBusy || !pendingQuestion) {
				return;
			}

			switch (event.type) {
				case "message_start":
				case "message_update":
				case "message_end": {
					const streamed = extractEventAssistantText(event.message);
					if (streamed) {
						pendingAnswer = streamed;
						pendingError = null;
					}
					setOverlayStatus(
						event.type === "message_end" ? "Finalizing side response..." : "Streaming side response...",
						true,
					);
					return;
				}
				case "tool_execution_start": {
					const toolName = (event as { toolName?: string }).toolName ?? "unknown";
					try {
						pendingToolCalls.push({
							toolCallId: (event as { toolCallId?: string }).toolCallId ?? "",
							toolName,
							args: formatToolArgs(toolName, (event as { args?: unknown }).args),
							status: "running",
						});
					} catch {
						// Ignore tool tracking failures
					}
					setOverlayStatus(`Running tool: ${toolName}...`, true);
					return;
				}
				case "tool_execution_end": {
					const endToolName = (event as { toolName?: string }).toolName ?? "unknown";
					const tc = pendingToolCalls.find((t) => t.toolName === endToolName && t.status === "running");
					if (tc) {
						tc.status = (event as { isError?: boolean }).isError ? "error" : "done";
					}
					setOverlayStatus("Streaming side response...", true);
					return;
				}
				case "turn_end": {
					setOverlayStatus("Finalizing side response...", true);
					return;
				}
				default:
					return;
			}
		});

		return {
			session,
			modelKey: getModelKey(ctx),
			unsubscribe,
		};
	}

	async function ensureSideSession(ctx: ExtensionCommandContext): Promise<SideSessionRuntime | null> {
		if (!ctx.model) {
			return null;
		}

		const expectedModelKey = getModelKey(ctx);
		if (activeSideSession && activeSideSession.modelKey === expectedModelKey) {
			return activeSideSession;
		}

		await disposeSideSession();
		activeSideSession = await createSideSession(ctx);
		return activeSideSession;
	}

	async function activateConversation(id: string): Promise<boolean> {
		const activationGeneration = sideRequestGeneration;
		if (!conversations.has(id)) {
			return false;
		}
		await disposeSideSession();
		if (activationGeneration !== sideRequestGeneration || !conversations.has(id)) {
			return false;
		}
		clearTransientState();
		setActiveConversation(id);
		setOverlayStatus("Conversation ready.");
		return true;
	}

	async function showConversationPicker(ctx: ExtensionCommandContext): Promise<string | null | undefined> {
		const items: ConversationPickerItem[] = [
			{
				id: null,
				label: "Start a new conversation",
				description: "Open an empty side thread",
			},
		];
		for (const conversation of getSortedConversations()) {
			const exchangeCount = conversation.thread.length;
			const updated = new Date(conversation.updatedAt).toLocaleString();
			items.push({
				id: conversation.id,
				label: getConversationTitle(conversation),
				description: `${exchangeCount} ${exchangeCount === 1 ? "exchange" : "exchanges"} · ${updated}`,
			});
		}

		return ctx.ui.custom<string | null | undefined>(
			(tui, theme, keybindings, done) =>
				new BtwConversationPicker(
					tui,
					theme,
					keybindings,
					items,
					(id) => done(id),
					() => done(undefined),
				),
			{
				overlay: true,
				overlayOptions: {
					width: "72%",
					minWidth: 64,
					maxHeight: "60%",
					anchor: "top-center",
					margin: { top: 1, left: 2, right: 2 },
				},
			},
		);
	}

	async function ensureOverlay(ctx: ExtensionCommandContext): Promise<void> {
		if (ctx.mode !== "tui") {
			return;
		}

		if (overlayRuntime?.handle) {
			overlayRuntime.handle.setHidden(false);
			overlayRuntime.handle.focus();
			overlayRuntime.refresh?.();
			return;
		}

		const runtime: OverlayRuntime = {};
		const closeRuntime = () => {
			if (runtime.closed) {
				return;
			}
			runtime.closed = true;
			runtime.handle?.hide();
			if (overlayRuntime === runtime) {
				overlayRuntime = null;
			}
			runtime.finish?.();
		};
		runtime.close = closeRuntime;
		overlayRuntime = runtime;

		void ctx.ui
			.custom<void>(
				async (tui, theme, keybindings, done) => {
					runtime.finish = () => done();

					const overlay = new BtwOverlay(
						tui,
						theme,
						keybindings,
						(width, t) => getTranscriptLines(width, t),
						() => overlayStatus,
						(value) => {
							void submitFromOverlay(ctx, value);
						},
						() => {
							void closeOverlayFlow(ctx);
						},
						() => {
							renderedAnswerCache = new WeakMap();
						},
					);

					overlay.focused = true;
					overlay.setDraft(overlayDraft);
					runtime.setDraft = (value) => overlay.setDraft(value);
					runtime.scrollToBottom = () => overlay.scrollToBottom();
					runtime.refresh = () => {
						overlay.focused = runtime.handle?.isFocused() ?? false;
						tui.requestRender();
					};
					runtime.close = () => {
						overlayDraft = overlay.getDraft();
						closeRuntime();
					};

					if (runtime.closed) {
						done();
					}

					return overlay;
				},
				{
					overlay: true,
					overlayOptions: {
						width: "80%",
						minWidth: 72,
						maxHeight: "78%",
						anchor: "top-center",
						margin: { top: 1, left: 2, right: 2 },
					},
					onHandle: (handle) => {
						runtime.handle = handle;
						handle.focus();
						if (runtime.closed) {
							closeRuntime();
						}
					},
				},
			)
			.catch((error) => {
				if (overlayRuntime === runtime) {
					overlayRuntime = null;
				}
				notify(ctx, error instanceof Error ? error.message : String(error), "error");
			});
	}

	async function summarizeThread(ctx: ExtensionContext, items: BtwDetails[]): Promise<string> {
		const model = ctx.model;
		if (!model) {
			throw new Error("No active model selected.");
		}

		const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
		if (auth.ok === false) {
			throw new Error(auth.error);
		}

		const { session } = await createAgentSession({
			sessionManager: SessionManager.inMemory(),
			model,
			modelRegistry: ctx.modelRegistry as AgentSession["modelRegistry"],
			thinkingLevel: "off",
			tools: [],
			resourceLoader: createBtwResourceLoader(ctx, [BTW_SUMMARY_PROMPT]),
		});

		try {
			await session.prompt(formatThread(items), { source: "extension" });
			const response = getLastAssistantMessage(session);
			if (!response) {
				throw new Error("Summary finished without a response.");
			}
			if (response.stopReason === "aborted") {
				throw new Error("Summary request was aborted.");
			}
			if (response.stopReason === "error") {
				throw new Error(response.errorMessage || "Summary request failed.");
			}

			return extractText(response.content) || "(No summary generated)";
		} finally {
			try {
				await session.abort();
			} catch {
				// Ignore abort errors during temporary session teardown.
			}
			session.dispose();
		}
	}

	async function injectSummaryIntoMain(ctx: ExtensionContext | ExtensionCommandContext): Promise<void> {
		const conversationId = activeConversationId;
		const items = thread;
		if (!conversationId || items.length === 0) {
			notify(ctx, "No BTW thread to summarize.", "warning");
			return;
		}

		const operationGeneration = sideRequestGeneration;
		setOverlayStatus("Summarizing BTW thread for injection...");
		try {
			const summary = await summarizeThread(ctx, items);
			if (operationGeneration !== sideRequestGeneration || activeConversationId !== conversationId) {
				return;
			}
			const message = `Summary of my BTW side conversation:\n\n${summary}`;
			if (ctx.isIdle()) {
				pi.sendUserMessage(message);
			} else {
				pi.sendUserMessage(message, { deliverAs: "followUp" });
			}

			await resetThread(ctx);
			notify(ctx, "Injected BTW summary into main chat.", "info");
		} catch (error) {
			if (operationGeneration === sideRequestGeneration && activeConversationId === conversationId) {
				notify(ctx, error instanceof Error ? error.message : String(error), "error");
			}
		}
	}

	async function closeOverlayFlow(ctx: ExtensionContext | ExtensionCommandContext): Promise<void> {
		const conversationId = activeConversationId;
		dismissOverlay();
		if (!ctx.hasUI) {
			return;
		}

		if (!conversationId || thread.length === 0) {
			return;
		}

		const choice = await ctx.ui.select("Close BTW:", ["Keep side thread", "Inject summary into main chat"]);
		if (choice === "Inject summary into main chat" && activeConversationId === conversationId) {
			await injectSummaryIntoMain(ctx);
		}
	}

	async function runBtwPrompt(
		ctx: ExtensionCommandContext,
		question: string,
		conversationId: string | null,
	): Promise<void> {
		const model = ctx.model;
		if (!model) {
			setOverlayStatus("No active model selected.");
			notify(ctx, "No active model selected.", "error");
			return;
		}
		if (sideBusy) {
			notify(ctx, "BTW is still processing the previous message.", "warning");
			return;
		}
		const conversation = conversationId ? conversations.get(conversationId) : undefined;
		if (!conversation || activeConversationId !== conversationId) {
			return;
		}

		const requestGeneration = ++sideRequestGeneration;
		const isRequestCurrent = () =>
			requestGeneration === sideRequestGeneration && activeConversationId === conversationId;
		sideBusy = true;

		try {
			const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
			if (!isRequestCurrent()) {
				return;
			}
			if (auth.ok === false) {
				const message = auth.error;
				setOverlayStatus(message);
				notify(ctx, message, "error");
				return;
			}

			const side = await ensureSideSession(ctx);
			if (!isRequestCurrent()) {
				return;
			}
			if (!side) {
				notify(ctx, "Unable to create BTW side session.", "error");
				return;
			}

			overlayRuntime?.scrollToBottom?.();
			pendingQuestion = question;
			pendingAnswer = "";
			pendingError = null;
			pendingToolCalls = [];
			setOverlayStatus("Streaming side response...");
			syncOverlay();

			await side.session.prompt(question, { source: "extension" });
			if (!isRequestCurrent()) {
				return;
			}
			const response = getLastAssistantMessage(side.session);
			if (!response) {
				throw new Error("BTW request finished without a response.");
			}
			if (response.stopReason === "aborted") {
				throw new Error("BTW request aborted.");
			}
			if (response.stopReason === "error") {
				throw new Error(response.errorMessage || "BTW request failed.");
			}

			const answer = extractText(response.content) || "(No text response)";
			pendingAnswer = answer;
			const timestamp = Date.now();
			const details: BtwDetails = {
				question,
				answer,
				timestamp,
				provider: model.provider,
				model: model.id,
				thinkingLevel: pi.getThinkingLevel() as SessionThinkingLevel,
				conversationId: conversation.id,
				usage: response.usage,
			};
			conversation.thread.push(details);
			conversation.updatedAt = timestamp;
			if (!conversation.persisted) {
				const startDetails: BtwStartDetails = {
					conversationId: conversation.id,
					timestamp: conversation.createdAt,
				};
				pi.appendEntry(BTW_START_TYPE, startDetails);
				conversation.persisted = true;
			}
			pi.appendEntry(BTW_ENTRY_TYPE, details);

			pendingQuestion = null;
			pendingAnswer = "";
			pendingToolCalls = [];
			setOverlayStatus("Ready for the next side question.");
		} catch (error) {
			if (!isRequestCurrent()) {
				return;
			}
			const message = error instanceof Error ? error.message : String(error);
			pendingError = message;
			setOverlayStatus("BTW request failed.");
			notify(ctx, message, "error");
		} finally {
			if (isRequestCurrent()) {
				sideBusy = false;
				syncOverlay();
			}
		}
	}

	async function submitFromOverlay(ctx: ExtensionCommandContext, rawValue: string): Promise<void> {
		const question = rawValue.trim();
		if (!question) {
			setOverlayStatus("Enter a question first.");
			return;
		}

		setOverlayDraft("");
		await runBtwPrompt(ctx, question, activeConversationId);
	}

	pi.registerCommand("btw", {
		description: "Open or select a BTW side conversation. `/btw <text>` starts a new conversation immediately.",
		handler: async (args, ctx) => {
			if (ctx.mode !== "tui") {
				notify(ctx, "BTW conversations are available in TUI mode only.", "warning");
				return;
			}
			const question = args.trim();

			if (!question) {
				if (!ctx.hasUI) {
					return;
				}

				if (conversations.size === 0) {
					createConversation();
					setOverlayStatus("Ready");
					await ensureOverlay(ctx);
					return;
				}

				dismissOverlay();
				const pickerGeneration = sideRequestGeneration;
				const selectedId = await showConversationPicker(ctx);
				if (selectedId === undefined || pickerGeneration !== sideRequestGeneration) {
					return;
				}
				if (selectedId === null) {
					await disposeSideSession();
					if (pickerGeneration !== sideRequestGeneration) {
						return;
					}
					clearTransientState();
					createConversation();
				} else if (!(await activateConversation(selectedId))) {
					notify(ctx, "That BTW conversation is no longer available.", "warning");
					return;
				}
				await ensureOverlay(ctx);
				return;
			}

			if (sideBusy) {
				notify(ctx, "BTW is still processing the previous message.", "warning");
				return;
			}
			const commandGeneration = sideRequestGeneration;
			await disposeSideSession();
			if (commandGeneration !== sideRequestGeneration) {
				return;
			}
			clearTransientState();
			const conversation = createConversation();
			await ensureOverlay(ctx);
			await runBtwPrompt(ctx, question, conversation.id);
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		await restoreThread(ctx);
	});

	pi.on("session_tree", async (_event, ctx) => {
		sideRequestGeneration++;
		await restoreThread(ctx);
	});

	pi.on("session_shutdown", async () => {
		await disposeSideSession();
		dismissOverlay();
	});
}
