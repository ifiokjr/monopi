import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentSessionLike } from "../src/ws-handler.js";

import { handleWebSocketConnection } from "../src/ws-handler.js";

class MockWebSocket extends EventEmitter {
	static OPEN = 1;
	OPEN = 1;
	readyState = MockWebSocket.OPEN;
	sent: unknown[] = [];
	closeCalls: Array<{ code: number; reason: string }> = [];

	send(data: string): void {
		this.sent.push(JSON.parse(data));
	}

	close(code = 1000, reason = ""): void {
		this.readyState = 3;
		this.closeCalls.push({ code, reason });
		this.emit("close");
	}

	async emitMessage(data: unknown): Promise<void> {
		for (const listener of this.listeners("message")) {
			await listener(data);
		}
	}
}

function createSession(overrides: Partial<AgentSessionLike> = {}): AgentSessionLike {
	return {
		prompt: vi.fn(async () => {}),
		steer: vi.fn(async () => {}),
		followUp: vi.fn(async () => {}),
		abort: vi.fn(async () => {}),
		compact: vi.fn(async () => ({ compacted: true })),
		setModel: vi.fn(async () => true),
		setThinkingLevel: vi.fn(),
		subscribe: vi.fn(() => vi.fn()),
		isStreaming: false,
		messages: [{ role: "user", content: "hello" }],
		model: "openai/gpt-5-mini",
		thinkingLevel: "medium",
		sessionId: "session-1",
		sessionFile: "/tmp/session-1.jsonl",
		agent: { state: { systemPrompt: "You are helpful", tools: [] } },
		newSession: vi.fn(async () => ({ cancelled: false })),
		...overrides,
	};
}

async function authenticateSocket(ws: MockWebSocket, token = "test-token") {
	await ws.emitMessage(JSON.stringify({ type: "auth", token }));
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("handleWebSocketConnection", () => {
	it("rejects invalid JSON before authentication", async () => {
		const ws = new MockWebSocket();
		handleWebSocketConnection(ws as never, {
			token: "test-token",
			instanceId: "instance-1",
			getSession: () => undefined,
		});

		await ws.emitMessage("not-json");

		expect(ws.sent).toEqual([{ type: "error", error: "Invalid JSON" }]);
		expect(ws.closeCalls).toEqual([]);
	});

	it("requires an auth handshake before processing commands", async () => {
		const ws = new MockWebSocket();
		handleWebSocketConnection(ws as never, {
			token: "test-token",
			instanceId: "instance-1",
			getSession: () => undefined,
		});

		await ws.emitMessage(JSON.stringify({ type: "prompt", message: "hello" }));

		expect(ws.sent).toEqual([{ type: "auth_error", reason: "auth_required" }]);
		expect(ws.closeCalls).toEqual([{ code: 4001, reason: "Auth required" }]);
	});

	it("rejects invalid tokens", async () => {
		const ws = new MockWebSocket();
		handleWebSocketConnection(ws as never, {
			token: "test-token",
			instanceId: "instance-1",
			getSession: () => undefined,
		});

		await authenticateSocket(ws, "wrong-token");

		expect(ws.sent).toEqual([{ type: "auth_error", reason: "invalid_token" }]);
		expect(ws.closeCalls).toEqual([{ code: 4001, reason: "Invalid token" }]);
	});

	it("authenticates, forwards session events, and disconnects cleanly", async () => {
		const ws = new MockWebSocket();
		const sessionEventListeners: Array<(event: unknown) => void> = [];
		const unsubscribe = vi.fn();
		const session = createSession({
			subscribe: vi.fn((listener) => {
				sessionEventListeners.push(listener);
				return unsubscribe;
			}),
		});
		const onClientConnect = vi.fn();
		const onClientDisconnect = vi.fn();

		handleWebSocketConnection(ws as never, {
			token: "test-token",
			instanceId: "instance-1",
			getSession: () => session,
			onClientConnect,
			onClientDisconnect,
		});

		await authenticateSocket(ws);
		expect(ws.sent[0]).toEqual({
			type: "auth_ok",
			instanceId: "instance-1",
			session: {
				sessionId: "session-1",
				isStreaming: false,
				model: "openai/gpt-5-mini",
				thinkingLevel: "medium",
			},
		});
		expect(onClientConnect).toHaveBeenCalledTimes(1);
		const clientId = onClientConnect.mock.calls[0]?.[0];
		expect(clientId).toEqual(expect.any(String));

		sessionEventListeners[0]?.({ type: "agent_event", detail: "tick" });
		expect(ws.sent.at(-1)).toEqual({ type: "agent_event", detail: "tick" });

		ws.close(1000, "done");
		expect(unsubscribe).toHaveBeenCalledTimes(1);
		expect(onClientDisconnect).toHaveBeenCalledWith(clientId);
	});

	it("returns a structured error when authenticated but no session is attached", async () => {
		const ws = new MockWebSocket();
		handleWebSocketConnection(ws as never, {
			token: "test-token",
			instanceId: "instance-1",
			getSession: () => undefined,
		});

		await authenticateSocket(ws);
		await ws.emitMessage(JSON.stringify({ id: "cmd-1", type: "get_state" }));

		expect(ws.sent.at(-1)).toEqual({
			type: "response",
			command: "get_state",
			success: false,
			error: "No session attached",
			id: "cmd-1",
		});
	});

	it("dispatches the supported command set once authenticated", async () => {
		const ws = new MockWebSocket();
		const session = createSession({ isStreaming: true });

		handleWebSocketConnection(ws as never, {
			token: "test-token",
			instanceId: "instance-1",
			getSession: () => session,
		});

		await authenticateSocket(ws);
		await ws.emitMessage(
			JSON.stringify({
				id: "cmd-1",
				type: "prompt",
				message: "stream me",
				streamingBehavior: "steer",
			}),
		);
		await ws.emitMessage(JSON.stringify({ id: "cmd-2", type: "steer", message: "faster" }));
		await ws.emitMessage(
			JSON.stringify({
				id: "cmd-3",
				type: "follow_up",
				message: "more detail",
			}),
		);
		await ws.emitMessage(JSON.stringify({ id: "cmd-4", type: "abort" }));
		await ws.emitMessage(JSON.stringify({ id: "cmd-5", type: "get_state" }));
		await ws.emitMessage(JSON.stringify({ id: "cmd-6", type: "get_messages" }));
		await ws.emitMessage(
			JSON.stringify({
				id: "cmd-7",
				type: "set_thinking_level",
				level: "high",
			}),
		);
		await ws.emitMessage(
			JSON.stringify({
				id: "cmd-8",
				type: "compact",
				customInstructions: "trim",
			}),
		);
		await ws.emitMessage(JSON.stringify({ id: "cmd-9", type: "new_session" }));
		await ws.emitMessage(JSON.stringify({ id: "cmd-10", type: "extension_ui_response" }));
		await ws.emitMessage(JSON.stringify({ id: "cmd-11", type: "unknown_command" }));

		expect(session.prompt).toHaveBeenCalledWith("stream me", {
			streamingBehavior: "steer",
		});
		expect(session.steer).toHaveBeenCalledWith("faster");
		expect(session.followUp).toHaveBeenCalledWith("more detail");
		expect(session.abort).toHaveBeenCalledTimes(1);
		expect(session.setThinkingLevel).toHaveBeenCalledWith("high");
		expect(session.compact).toHaveBeenCalledWith("trim");
		expect(session.newSession).toHaveBeenCalledTimes(1);

		expect(ws.sent).toContainEqual({
			type: "response",
			command: "prompt",
			success: true,
			id: "cmd-1",
		});
		expect(ws.sent).toContainEqual({
			type: "response",
			command: "get_state",
			success: true,
			data: {
				model: "openai/gpt-5-mini",
				thinkingLevel: "medium",
				isStreaming: true,
				sessionId: "session-1",
				sessionFile: "/tmp/session-1.jsonl",
				messageCount: 1,
			},
			id: "cmd-5",
		});
		expect(ws.sent).toContainEqual({
			type: "response",
			command: "get_messages",
			success: true,
			data: { messages: session.messages },
			id: "cmd-6",
		});
		expect(ws.sent).toContainEqual({
			type: "response",
			command: "compact",
			success: true,
			data: { compacted: true },
			id: "cmd-8",
		});
		expect(ws.sent).toContainEqual({
			type: "response",
			command: "new_session",
			success: true,
			data: { cancelled: false },
			id: "cmd-9",
		});
		expect(ws.sent).toContainEqual({
			type: "response",
			command: "unknown_command",
			success: false,
			error: "Unknown command: unknown_command",
			id: "cmd-11",
		});
	});

	it("returns structured command errors when the session throws", async () => {
		const ws = new MockWebSocket();
		const session = createSession({
			compact: vi.fn(() => Promise.reject(new Error("compact failed"))),
		});

		handleWebSocketConnection(ws as never, {
			token: "test-token",
			instanceId: "instance-1",
			getSession: () => session,
		});

		await authenticateSocket(ws);
		await ws.emitMessage(JSON.stringify({ id: "cmd-1", type: "compact" }));
		expect(ws.sent.at(-1)).toEqual({
			type: "response",
			command: "compact",
			success: false,
			error: "compact failed",
			id: "cmd-1",
		});

		ws.emit("error", new Error("socket error"));
		expect((session.subscribe as ReturnType<typeof vi.fn>).mock.results[0]?.value).toHaveBeenCalledTimes(1);
	});

	describe("model commands", () => {
		const availableModels = [
			{ id: "gpt-5-mini", provider: "openai" },
			{ id: "glm-5.1", provider: "zai" },
		];

		it("switches models by resolving provider/modelId against the session's models", async () => {
			const ws = new MockWebSocket();
			const resolved = availableModels[1];
			const session = createSession({
				getAvailableModels: vi.fn(async () => availableModels),
				setModel: vi.fn(async (model: unknown) => model === resolved),
			});

			handleWebSocketConnection(ws as never, {
				token: "test-token",
				instanceId: "instance-1",
				getSession: () => session,
			});

			await authenticateSocket(ws);
			await ws.emitMessage(JSON.stringify({ id: "cmd-1", type: "set_model", provider: "zai", modelId: "glm-5.1" }));

			expect(session.setModel).toHaveBeenCalledWith(resolved);
			expect(ws.sent.at(-1)).toEqual({
				type: "response",
				command: "set_model",
				success: true,
				data: { model: resolved },
				id: "cmd-1",
			});
		});

		it("matches models case-insensitively", async () => {
			const ws = new MockWebSocket();
			const session = createSession({
				getAvailableModels: vi.fn(() => availableModels),
				setModel: vi.fn(async () => true),
			});

			handleWebSocketConnection(ws as never, {
				token: "test-token",
				instanceId: "instance-1",
				getSession: () => session,
			});

			await authenticateSocket(ws);
			await ws.emitMessage(
				JSON.stringify({ id: "cmd-1", type: "set_model", provider: "OpenAI", modelId: "GPT-5-MINI" }),
			);

			expect(session.setModel).toHaveBeenCalledWith(availableModels[0]);
		});

		it("rejects set_model for models the session does not expose", async () => {
			const ws = new MockWebSocket();
			const session = createSession({
				getAvailableModels: vi.fn(async () => availableModels),
			});

			handleWebSocketConnection(ws as never, {
				token: "test-token",
				instanceId: "instance-1",
				getSession: () => session,
			});

			await authenticateSocket(ws);
			await ws.emitMessage(
				JSON.stringify({ id: "cmd-1", type: "set_model", provider: "anthropic", modelId: "claude-opus-4-7" }),
			);

			expect(session.setModel).not.toHaveBeenCalled();
			expect(ws.sent.at(-1)).toEqual({
				type: "response",
				command: "set_model",
				success: false,
				error: "Model not found: anthropic/claude-opus-4-7",
				id: "cmd-1",
			});
		});

		it("passes a provider/modelId reference when the session cannot enumerate models", async () => {
			const ws = new MockWebSocket();
			const session = createSession();

			handleWebSocketConnection(ws as never, {
				token: "test-token",
				instanceId: "instance-1",
				getSession: () => session,
			});

			await authenticateSocket(ws);
			await ws.emitMessage(JSON.stringify({ id: "cmd-1", type: "set_model", provider: "zai", modelId: "glm-5.1" }));

			expect(session.setModel).toHaveBeenCalledWith({ id: "glm-5.1", provider: "zai" });
			expect(ws.sent.at(-1)).toMatchObject({ command: "set_model", success: true, id: "cmd-1" });
		});

		it("reports a failed model switch", async () => {
			const ws = new MockWebSocket();
			const session = createSession({
				getAvailableModels: vi.fn(async () => availableModels),
				setModel: vi.fn(async () => false),
			});

			handleWebSocketConnection(ws as never, {
				token: "test-token",
				instanceId: "instance-1",
				getSession: () => session,
			});

			await authenticateSocket(ws);
			await ws.emitMessage(JSON.stringify({ id: "cmd-1", type: "set_model", provider: "zai", modelId: "glm-5.1" }));

			expect(ws.sent.at(-1)).toEqual({
				type: "response",
				command: "set_model",
				success: false,
				error: "Failed to switch to zai/glm-5.1",
				id: "cmd-1",
			});
		});

		it("validates set_model fields", async () => {
			const ws = new MockWebSocket();
			const session = createSession();

			handleWebSocketConnection(ws as never, {
				token: "test-token",
				instanceId: "instance-1",
				getSession: () => session,
			});

			await authenticateSocket(ws);
			await ws.emitMessage(JSON.stringify({ id: "cmd-1", type: "set_model", provider: "zai" }));

			expect(session.setModel).not.toHaveBeenCalled();
			expect(ws.sent.at(-1)).toMatchObject({ command: "set_model", success: false, id: "cmd-1" });
		});
	});

	describe("introspection commands", () => {
		it("merges real session stats with the client contract fields", async () => {
			const ws = new MockWebSocket();
			const session = createSession({
				getSessionStats: vi.fn(() => ({ cost: 0.42, sessionId: "stats-session", totalMessages: 7 })),
			});

			handleWebSocketConnection(ws as never, {
				token: "test-token",
				instanceId: "instance-1",
				getSession: () => session,
			});

			await authenticateSocket(ws);
			await ws.emitMessage(JSON.stringify({ id: "cmd-1", type: "get_session_stats" }));

			expect(ws.sent.at(-1)).toEqual({
				type: "response",
				command: "get_session_stats",
				success: true,
				data: {
					cost: 0.42,
					isStreaming: false,
					messageCount: 1,
					sessionId: "session-1",
					totalMessages: 7,
				},
				id: "cmd-1",
			});
		});

		it("derives session stats when the session does not expose them", async () => {
			const ws = new MockWebSocket();
			const session = createSession();

			handleWebSocketConnection(ws as never, {
				token: "test-token",
				instanceId: "instance-1",
				getSession: () => session,
			});

			await authenticateSocket(ws);
			await ws.emitMessage(JSON.stringify({ id: "cmd-1", type: "get_session_stats" }));

			expect(ws.sent.at(-1)).toEqual({
				type: "response",
				command: "get_session_stats",
				success: true,
				data: { isStreaming: false, messageCount: 1, sessionId: "session-1" },
				id: "cmd-1",
			});
		});

		it("returns commands from the session when available", async () => {
			const ws = new MockWebSocket();
			const commands = [{ description: "Share session", name: "remote", source: "extension" }];
			const session = createSession({ getCommands: vi.fn(() => commands) });

			handleWebSocketConnection(ws as never, {
				token: "test-token",
				instanceId: "instance-1",
				getSession: () => session,
			});

			await authenticateSocket(ws);
			await ws.emitMessage(JSON.stringify({ id: "cmd-1", type: "get_commands" }));

			expect(ws.sent.at(-1)).toEqual({
				type: "response",
				command: "get_commands",
				success: true,
				data: { commands },
				id: "cmd-1",
			});
		});

		it("normalizes a wrapped commands object and falls back to an empty list", async () => {
			const ws = new MockWebSocket();
			const commands = [{ name: "plan", source: "prompt" }];
			const session = createSession({ getCommands: vi.fn(() => ({ commands })) });

			handleWebSocketConnection(ws as never, {
				token: "test-token",
				instanceId: "instance-1",
				getSession: () => session,
			});

			await authenticateSocket(ws);
			await ws.emitMessage(JSON.stringify({ id: "cmd-1", type: "get_commands" }));
			expect(ws.sent.at(-1)).toMatchObject({ command: "get_commands", data: { commands }, id: "cmd-1" });

			await ws.emitMessage(JSON.stringify({ id: "cmd-2", type: "get_available_models" }));
			expect(ws.sent.at(-1)).toEqual({
				type: "response",
				command: "get_available_models",
				success: true,
				data: { models: [] },
				id: "cmd-2",
			});
		});

		it("returns available models from the session", async () => {
			const ws = new MockWebSocket();
			const models = [{ id: "gpt-5-mini", provider: "openai" }];
			const session = createSession({ getAvailableModels: vi.fn(async () => models) });

			handleWebSocketConnection(ws as never, {
				token: "test-token",
				instanceId: "instance-1",
				getSession: () => session,
			});

			await authenticateSocket(ws);
			await ws.emitMessage(JSON.stringify({ id: "cmd-1", type: "get_available_models" }));

			expect(ws.sent.at(-1)).toEqual({
				type: "response",
				command: "get_available_models",
				success: true,
				data: { models },
				id: "cmd-1",
			});
		});
	});
});
