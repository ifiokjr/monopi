/**
 * Smoke check for the fleet inspector against real on-disk run artifacts
 * (status.json + output log), bypassing all unit-test mocks.
 *
 * Run with: pnpm exec tsx tests/fleet-inspector-smoke.mts
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { buildFleetJobs, createFleetState, FleetInspectorComponent } from "../fleet-inspector.js";
import { ASYNC_DIR } from "../types.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fleet-smoke-"));
const runDir = path.join(ASYNC_DIR, "smokerun123");
fs.mkdirSync(runDir, { recursive: true });
fs.writeFileSync(
	path.join(runDir, "status.json"),
	JSON.stringify({
		currentStep: 1,
		cwd: tmp,
		lastUpdate: Date.now(),
		mode: "chain",
		outputFile: path.join(runDir, "output-1.log"),
		pid: process.pid,
		runId: "smokerun123",
		startedAt: Date.now() - 8_000,
		state: "running",
		steps: [
			{
				agent: "scout",
				durationMs: 4_200,
				endedAt: Date.now() - 3_000,
				startedAt: Date.now() - 8_000,
				status: "complete",
			},
			{ agent: "planner", status: "running" },
		],
		totalTokens: { input: 100, output: 50, total: 150 },
	}),
);
fs.writeFileSync(path.join(runDir, "output-1.log"), "thinking about the plan\nreading src/index.ts\ndrafting steps\n");

try {
	const jobs = buildFleetJobs([
		{
			asyncDir: runDir,
			asyncId: "smokerun123",
			status: "running",
		},
	]);
	if (jobs[0]!.steps.length !== 2 || jobs[0]!.totalTokens !== 150) {
		throw new Error(`unexpected snapshot: ${JSON.stringify(jobs[0])}`);
	}

	class FakeTui {
		requestRender(): void {}
	}
	const theme = {
		bold: (t: string) => t,
		fg: (_c: string, t: string) => t,
	};
	const component = new FleetInspectorComponent(
		new FakeTui() as never,
		theme as never,
		createFleetState(),
		() => [{ asyncDir: runDir, asyncId: "smokerun123", status: "running" }],
		() => {},
	);

	const list = component.render(84);
	console.log(list.join("\n"));

	component.handleInput("\r");
	const detail = component.render(84);
	console.log(detail.join("\n"));
	if (!detail.join("\n").includes("reading src/index.ts")) {
		throw new Error("detail view did not show live output tail");
	}
	component.dispose();
	console.log("\nSMOKE OK");
} finally {
	fs.rmSync(tmp, { recursive: true, force: true });
	fs.rmSync(path.join(ASYNC_DIR, "smokerun123"), { recursive: true, force: true });
}
