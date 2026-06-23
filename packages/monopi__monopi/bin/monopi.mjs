#!/usr/bin/env node

// Thin compatibility package: `@monopi/monopi` is the public npx entrypoint,
// while `@monopi/cli` owns the interactive installer implementation.
import { INSTALLER_PACKAGES } from "./package-list.mjs";

if (process.argv.includes("--help") || process.argv.includes("-h")) {
	console.log(
		`
monopi — interactive setup for pi-coding-agent

Usage:
  npx @monopi/monopi              Launch the interactive TUI configurator
  npx @monopi/monopi --yes        Run with defaults / skip confirmation prompts
  npx @monopi/monopi --help       Show this help

The interactive configurator lets you select extensions, themes, prompts, skills,
and supporting monopi packages before installing them into pi.

Available installer packages:
${INSTALLER_PACKAGES.map((pkg) => `  • ${pkg}`).join("\n")}
`.trim(),
	);
	process.exit(0);
}

await import("@monopi/cli/dist/bin/monopi.js");
