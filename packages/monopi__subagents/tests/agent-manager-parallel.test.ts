import { describe, expect, it } from "vitest";

import { createParallelState, renderParallel } from "../agent-manager-parallel.js";

const theme = {
	bg: (_color: string, text: string) => text,
	fg: (_color: string, text: string) => text,
};

describe("renderParallel", () => {
	it("shows a hint when fewer than two agents are selected in browse mode", () => {
		const state = createParallelState(["scout"]);
		const lines = renderParallel(state, [{ name: "scout", description: "scout agent" }], 80, theme);
		const output = lines.join("\n");
		expect(output).toContain("1 agent. Add at least 2 for parallel");
	});

	it("shows the slot summary when two or more agents are selected", () => {
		const state = createParallelState(["scout", "planner"]);
		const lines = renderParallel(
			state,
			[
				{ name: "scout", description: "scout agent" },
				{ name: "planner", description: "planner agent" },
			],
			80,
			theme,
		);
		const output = lines.join("\n");
		expect(output).toContain("scout");
		expect(output).toContain("planner");
	});
});
