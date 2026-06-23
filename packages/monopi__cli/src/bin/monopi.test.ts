import { beforeEach, describe, expect, it, vi } from "vitest";

const run = vi.fn();
const parseArgs = vi.fn();

vi.mock("../index.js", () => ({ run }));
vi.mock("../utils/args.js", () => ({ parseArgs }));

describe("monopi bin", () => {
	beforeEach(() => {
		vi.resetModules();
		parseArgs.mockClear();
		run.mockClear();
	});

	it("parses args and runs the installer", async () => {
		parseArgs.mockReturnValue({ yes: true });
		run.mockResolvedValue(undefined);

		const originalArgv = process.argv;
		process.argv = ["node", "monopi", "-y"];

		await import("./monopi.js");

		expect(parseArgs).toHaveBeenCalledWith(["-y"]);
		expect(run).toHaveBeenCalledWith({ yes: true });

		process.argv = originalArgv;
	});
});
