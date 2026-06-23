import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
	"vitest.config.ts",
	"packages/monopi__analytics-dashboard/vitest.config.ts",
	"packages/monopi__remote-tailscale/vitest.config.ts",
	"packages/monopi__bash-live-view/vitest.config.ts",
	"packages/monopi__pretty/vitest.config.ts",
]);
