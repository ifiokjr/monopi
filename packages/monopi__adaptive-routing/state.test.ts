import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

const { getAgentDir } = vi.hoisted(() => ({
	getAgentDir: vi.fn(() => "/mock-home/.pi/agent"),
}));

vi.mock("@earendil-works/pi-coding-agent", () => ({
	getAgentDir,
}));

import {
	flushAdaptiveRoutingState,
	getAdaptiveRoutingStatePath,
	readAdaptiveRoutingState,
	writeAdaptiveRoutingState,
} from "./state.js";

describe("adaptive routing state", () => {
	it("reads default state when file does not exist", () => {
		const state = readAdaptiveRoutingState();
		expect(state).toEqual({});
	});

	it("debounces state writes", () => {
		vi.useFakeTimers();
		const tempDir = mkdtempSync(join(tmpdir(), "adaptive-routing-state-"));
		getAgentDir.mockReturnValue(tempDir);

		try {
			writeAdaptiveRoutingState({ mode: "auto" });
			// Before timer fires, file should not exist
			expect(() => readFileSync(getAdaptiveRoutingStatePath(), "utf-8")).toThrow();

			vi.advanceTimersByTime(2_100);

			const raw = readFileSync(getAdaptiveRoutingStatePath(), "utf-8");
			const parsed = JSON.parse(raw);
			expect(parsed.mode).toBe("auto");
		} finally {
			vi.useRealTimers();
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("coalesces multiple rapid writes into one file write", () => {
		vi.useFakeTimers();
		const tempDir = mkdtempSync(join(tmpdir(), "adaptive-routing-state-"));
		getAgentDir.mockReturnValue(tempDir);

		try {
			writeAdaptiveRoutingState({ mode: "auto" });
			writeAdaptiveRoutingState({ mode: "shadow" });
			writeAdaptiveRoutingState({ mode: "off" });

			vi.advanceTimersByTime(2_100);

			const raw = readFileSync(getAdaptiveRoutingStatePath(), "utf-8");
			const parsed = JSON.parse(raw);
			// Should contain the last value written
			expect(parsed.mode).toBe("off");
		} finally {
			vi.useRealTimers();
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("flushes a pending write immediately instead of waiting out the debounce", () => {
		vi.useFakeTimers();
		const tempDir = mkdtempSync(join(tmpdir(), "adaptive-routing-state-"));
		getAgentDir.mockReturnValue(tempDir);

		try {
			writeAdaptiveRoutingState({ lock: { model: "zai/glm-5.3-flash", setAt: 1, thinking: "high" } });
			flushAdaptiveRoutingState();

			// The value is on disk before any timer fires.
			const parsed = JSON.parse(readFileSync(getAdaptiveRoutingStatePath(), "utf-8"));
			expect(parsed.lock.model).toBe("zai/glm-5.3-flash");
		} finally {
			vi.useRealTimers();
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("flushing with no pending write is a no-op", () => {
		vi.useFakeTimers();
		const tempDir = mkdtempSync(join(tmpdir(), "adaptive-routing-state-"));
		getAgentDir.mockReturnValue(tempDir);

		try {
			flushAdaptiveRoutingState();
			expect(() => readFileSync(getAdaptiveRoutingStatePath(), "utf-8")).toThrow();
		} finally {
			vi.useRealTimers();
			rmSync(tempDir, { recursive: true, force: true });
		}
	});
});
