import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const utilsMocks = vi.hoisted(() => ({
	readStatus: vi.fn(),
	getOutputTail: vi.fn(() => [] as string[]),
	getLastActivity: vi.fn(() => "active now"),
}));

vi.mock("../utils.js", () => utilsMocks);

vi.mock("../formatters.js", () => ({
	formatDuration: (value: number) => `${value}ms`,
	formatTokens: (value: number) => `${value}t`,
	formatToolCall: (name: string) => `tool:${name}`,
	formatUsage: () => "usage",
	shortenPath: (value: string) => value,
}));

import type { AsyncJobState } from "../types.js";

import {
	buildFleetJobs,
	createFleetState,
	FleetInspectorComponent,
	handleFleetInput,
	renderFleetDetail,
	renderFleetList,
	selectedJob,
	type FleetJobView,
	type FleetState,
} from "../fleet-inspector.js";

function makeJob(overrides: Partial<AsyncJobState> = {}): AsyncJobState {
	return {
		asyncDir: "/tmp/run-1",
		asyncId: "abcdef1234567890",
		status: "running",
		startedAt: 1_000,
		updatedAt: 2_000,
		stepsTotal: 2,
		agents: ["scout", "planner"],
		currentStep: 0,
		...overrides,
	};
}

const NOW = 10_000;
const theme = {
	bold: (text: string) => `\u0001${text}\u0001`,
	fg: (_color: string, text: string) => text,
};

beforeEach(() => {
	utilsMocks.readStatus.mockReset();
	utilsMocks.getOutputTail.mockReset().mockReturnValue([]);
	utilsMocks.getLastActivity.mockReset().mockReturnValue("active now");
});

describe("buildFleetJobs", () => {
	it("merges status.json steps and sorts active runs before finished ones", () => {
		const running = makeJob({ asyncId: "aaa", status: "running" });
		const done = makeJob({
			asyncId: "bbb",
			status: "complete",
			currentStep: undefined,
			updatedAt: 5_000,
		});
		utilsMocks.readStatus.mockImplementation((dir: string) =>
			dir === running.asyncDir
				? {
						currentStep: 1,
						mode: "chain",
						startedAt: 1_000,
						state: "running",
						steps: [
							{ agent: "scout", durationMs: 4_000, status: "complete", tokens: { total: 120 } },
							{ agent: "planner", error: "boom", status: "running" },
						],
						totalTokens: { input: 0, output: 0, total: 500 },
					}
				: null,
		);

		const jobs = buildFleetJobs([done, running], NOW);
		expect(jobs.map((j) => j.asyncId)).toEqual(["aaa", "bbb"]);

		const active = jobs[0]!;
		expect(active.steps).toHaveLength(2);
		expect(active.steps[0]).toMatchObject({ agent: "scout", tokens: 120 });
		expect(active.steps[1]).toMatchObject({ agent: "planner", error: "boom" });
		expect(active.currentStep).toBe(1);
		expect(active.totalTokens).toBe(500);
		expect(active.activity).toBe("active now");

		const finished = jobs[1]!;
		expect(finished.stepsTotal).toBe(2);
		expect(finished.activity).toBe("");
	});

	it("falls back to job fields when status.json is missing", () => {
		utilsMocks.readStatus.mockReturnValue(null);
		const jobs = buildFleetJobs([makeJob()], NOW);
		expect(jobs[0]).toMatchObject({
			currentStep: 0,
			status: "running",
			stepsTotal: 2,
			steps: [],
		});
	});
});

describe("handleFleetInput", () => {
	function stateWithJobs(count: number): { state: FleetState; jobs: FleetJobView[] } {
		const state = createFleetState();
		const jobs: FleetJobView[] = Array.from({ length: count }, (_, i) => ({
			asyncId: `job-${i}`,
			status: "running",
			activity: "",
			steps: [],
			stepsTotal: 1,
		}));
		return { jobs, state };
	}

	it("moves the cursor with arrows and vim keys, clamping at edges", () => {
		const { jobs, state } = stateWithJobs(3);

		handleFleetInput(state, jobs, "j");
		expect(state.cursor).toBe(1);
		handleFleetInput(state, jobs, "\x1B[B");
		expect(state.cursor).toBe(2);
		handleFleetInput(state, jobs, "\x1B[B");
		expect(state.cursor).toBe(2);
		handleFleetInput(state, jobs, "k");
		expect(state.cursor).toBe(1);
		handleFleetInput(state, jobs, "\x1B[A");
		handleFleetInput(state, jobs, "\x1B[A");
		expect(state.cursor).toBe(0);
	});

	it("opens detail from list with enter or right only when jobs exist", () => {
		const { jobs, state } = stateWithJobs(2);
		expect(handleFleetInput(state, jobs, "\r")).toEqual({ type: "open-detail" });
		expect(handleFleetInput(state, jobs, "\x1B[C")).toEqual({ type: "open-detail" });

		const empty = createFleetState();
		expect(handleFleetInput(empty, [], "\r")).toBeUndefined();
	});

	it("escape closes from list but goes back from detail", () => {
		const { jobs, state } = stateWithJobs(1);
		expect(handleFleetInput(state, jobs, "\x1B")).toEqual({ type: "close" });

		state.screen = "detail";
		expect(handleFleetInput(state, jobs, "\x1B")).toEqual({ type: "back" });
	});

	it("left and backspace return from detail; x toggles output expansion", () => {
		const { jobs, state } = stateWithJobs(1);
		state.screen = "detail";
		expect(handleFleetInput(state, jobs, "\x1B[D")).toEqual({ type: "back" });
		expect(handleFleetInput(state, jobs, "\x7F")).toEqual({ type: "back" });
		expect(handleFleetInput(state, jobs, "x")).toEqual({ type: "toggle-output" });
		expect(handleFleetInput(state, jobs, "\x0F")).toEqual({ type: "toggle-output" });
	});

	it("r refreshes anywhere and q closes only from list", () => {
		const { jobs, state } = stateWithJobs(1);
		expect(handleFleetInput(state, jobs, "q")).toEqual({ type: "close" });
		expect(handleFleetInput(state, jobs, "r")).toEqual({ type: "refresh" });

		state.screen = "detail";
		expect(handleFleetInput(state, jobs, "q")).toBeUndefined();
		expect(handleFleetInput(state, jobs, "r")).toEqual({ type: "refresh" });
	});
});

describe("selectedJob", () => {
	it("tracks selection by id and clamps when jobs disappear", () => {
		const state = createFleetState();
		const jobs: FleetJobView[] = [
			{ asyncId: "a", status: "complete", activity: "", steps: [], stepsTotal: 1 },
			{ asyncId: "b", status: "running", activity: "", steps: [], stepsTotal: 1 },
		];

		state.cursor = 1;
		expect(selectedJob(state, jobs)?.asyncId).toBe("b");
		expect(state.selectedId).toBe("b");

		state.cursor = 99;
		expect(selectedJob(state, [jobs[0]!])?.asyncId).toBe("a");
		expect(state.cursor).toBe(0);
	});
});

describe("rendering", () => {
	const jobs: FleetJobView[] = [
		{
			activity: "active now",
			agents: ["scout", "planner"],
			asyncId: "abc123final0000",
			currentStep: 0,
			mode: "chain",
			outputFile: "/tmp/output.log",
			startedAt: NOW - 5_000,
			status: "running",
			steps: [
				{ agent: "scout", durationMs: 4_000, status: "complete", tokens: 900 },
				{ agent: "planner", status: "running" },
			],
			stepsTotal: 2,
			totalTokens: 900,
		},
	];

	it("list shows header, cursor marker on selected row and footer hints", () => {
		const state = createFleetState();
		const lines = renderFleetList(state, jobs, 84, theme, NOW);
		const text = lines.join("\n");
		expect(text).toContain("Subagent fleet");
		expect(text).toContain("scout");
		expect(text).toContain("▸ ● ● scout");
		expect(lines.at(-1)).toContain("enter inspect");
	});

	it("list shows an empty-state row without jobs", () => {
		const lines = renderFleetList(createFleetState(), [], 84, theme, NOW);
		expect(lines.join("\n")).toContain("No subagent activity");
	});

	it("detail shows step table, output section and back hint", () => {
		utilsMocks.getOutputTail.mockReturnValue(["reading src/auth.ts"]);
		const state = createFleetState();
		state.screen = "detail";
		state.selectedId = jobs[0]!.asyncId;

		const lines = renderFleetDetail(state, jobs[0], 84, theme, NOW);
		const text = lines.join("\n");
		expect(text).toContain("Subagent detail [abc123]");
		expect(text).toContain("scout");
		expect(text).toContain("4000ms");
		expect(text).toContain("900t tok");
		expect(text).toContain("reading src/auth.ts");
		expect(lines.at(-1)).toContain("← back");
	});

	it("detail handles a vanished run gracefully", () => {
		const lines = renderFleetDetail(createFleetState(), undefined, 84, theme, NOW);
		expect(lines.join("\n")).toContain("Run no longer active");
	});
});

describe("FleetInspectorComponent", () => {
	class FakeTui {
		requestRender = vi.fn();
	}

	afterEach(() => {
		vi.useRealTimers();
	});

	function makeComponent(jobList: AsyncJobState[]) {
		const tui = new FakeTui();
		const done = vi.fn();
		let current = jobList;
		const component = new FleetInspectorComponent(
			tui as never,
			theme as never,
			createFleetState(),
			() => current,
			done,
		);
		return {
			component,
			done,
			setJobs(next: AsyncJobState[]) {
				current = next;
			},
			tui,
		};
	}

	it("drills into detail with enter and returns with left", () => {
		const { component } = makeComponent([makeJob()]);
		component.handleInput("\r");
		expect(component["state"].screen).toBe("detail");
		component.handleInput("\x1B[D");
		expect(component["state"].screen).toBe("list");
	});

	it("closes via escape and disposes its poller exactly once", () => {
		vi.useFakeTimers();
		const setInt = vi.spyOn(globalThis, "setInterval");
		const clearInt = vi.spyOn(globalThis, "clearInterval");
		const { component, done } = makeComponent([]);

		expect(setInt).toHaveBeenCalledTimes(1);
		component.handleInput("\x1B");
		expect(done).toHaveBeenCalledWith(true);

		component.dispose();
		component.dispose();
		expect(clearInt).toHaveBeenCalledTimes(1);

		setInt.mockRestore();
		clearInt.mockRestore();
	});

	it("detail follows the selected run and clamps when it vanishes", () => {
		const one = makeJob({ asyncId: "one-of-four" });
		const { component, setJobs } = makeComponent([one]);

		component.handleInput("\r");
		expect(component.render(84).join("\n")).toContain("Subagent detail [one-of]");

		setJobs([makeJob({ asyncId: "two-of-six" })]);
		component.refresh();
		expect(component.render(84).join("\n")).toContain("Subagent detail [two-of]");

		setJobs([]);
		component.refresh();
		expect(component.render(84).join("\n")).toContain("Run no longer active");
	});
});
