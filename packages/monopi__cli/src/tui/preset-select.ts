import type { OhPConfig } from "@monopi/core";

import * as p from "@clack/prompts";
import { t } from "@monopi/core";

interface Preset extends Omit<OhPConfig, "providers"> {}

/**
 * Registry of built-in configuration presets (Clean / Full).
 * Each entry maps a preset key to its i18n label/hint keys and a full {@link Preset} config object.
 */
export const PRESETS: Record<string, { labelKey: string; hintKey: string; config: Preset }> = {
	clean: {
		config: {
			agents: "general-developer",
			extensions: [],
			keybindings: "default",
			theme: "dark",
			thinking: "off",
		},
		hintKey: "preset.cleanHint",
		labelKey: "preset.clean",
	},
	full: {
		config: {
			agents: "general-developer",
			extensions: ["git-guard", "custom-footer", "diagnostics", "compact-header", "bg-process", "worktree"],
			keybindings: "default",
			theme: "dark",
			thinking: "high",
		},
		hintKey: "preset.fullHint",
		labelKey: "preset.full",
	},
};

/**
 * Prompts the user to select a configuration preset via an interactive TUI menu.
 * Exits the process if the user cancels the selection.
 * @returns The {@link Preset} configuration object for the chosen preset.
 */
export async function selectPreset(): Promise<Preset> {
	const key = await p.select({
		message: t("preset.select"),
		options: Object.entries(PRESETS).map(([k, v]) => ({
			hint: t(v.hintKey),
			label: t(v.labelKey),
			value: k,
		})),
	});
	if (p.isCancel(key)) {
		p.cancel(t("cancelled"));
		process.exit(0);
	}
	return PRESETS[key]?.config;
}
