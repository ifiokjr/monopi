import * as p from "@clack/prompts";
import { t } from "@monopi/core";

/**
 * Presents an interactive prompt for the user to select an agent template
 * (e.g. general developer, fullstack, security, or data/AI).
 *
 * Exits the process if the user cancels the selection.
 *
 * @returns The selected agent template identifier string.
 */
export async function selectAgents(initialValue?: string): Promise<string> {
	const agent = await p.select({
		initialValue,
		message: t("agent.select"),
		options: [
			{
				value: "general-developer",
				label: t("agent.general"),
				hint: t("agent.generalHint"),
			},
			{
				value: "fullstack-developer",
				label: t("agent.fullstack"),
				hint: t("agent.fullstackHint"),
			},
			{
				value: "security-researcher",
				label: t("agent.security"),
				hint: t("agent.securityHint"),
			},
			{
				value: "data-ai-engineer",
				label: t("agent.dataai"),
				hint: t("agent.dataaiHint"),
			},
		],
	});
	if (p.isCancel(agent)) {
		p.cancel(t("cancelled"));
		process.exit(0);
	}
	return agent;
}
