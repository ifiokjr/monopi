/**
 * Fleet Inspector — interactive overlay for toggling between subagent runs
 * and watching their live activity.
 *
 * Two screens:
 * - "list": every async subagent run with status, step progress and freshness
 * - "detail": one run's steps plus a live output tail
 *
 * Navigation mirrors upstream pi-subagents' fleet view and OpenCode's
 * subagent switcher: j/k or arrows to move between runs, enter/right to
 * inspect, left/esc to go back.
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";

import { matchesKey } from "@earendil-works/pi-tui";

import type { AsyncJobState, AsyncStatus } from "./types.js";

import { formatDuration, formatTokens } from "./formatters.js";
import { pad, renderFooter, renderHeader, row } from "./render-helpers.js";
import { getLastActivity, getOutputTail, readStatus } from "./utils.js";

// ============================================================================
// Types
// ============================================================================

export interface FleetStepView {
	agent: string;
	status: string;
	durationMs?: number;
	tokens?: number;
	error?: string;
}

export interface FleetJobView {
	asyncId: string;
	status: AsyncJobState["status"];
	mode?: string;
	agents?: string[];
	currentStep?: number;
	stepsTotal: number;
	startedAt?: number;
	updatedAt?: number;
	totalTokens?: number;
	activity: string;
	outputFile?: string;
	sessionFile?: string;
	steps: FleetStepView[];
}

export type FleetScreen = "list" | "detail";

export interface FleetState {
	screen: FleetScreen;
	cursor: number;
	scrollOffset: number;
	selectedId: string | null;
	expandedOutput: boolean;
}

export type FleetAction =
	| { type: "close" }
	| { type: "open-detail" }
	| { type: "back" }
	| { type: "toggle-output" }
	| { type: "refresh" };

const LIST_VIEWPORT_HEIGHT = 10;
const COLLAPSED_TAIL_LINES = 3;
const EXPANDED_TAIL_LINES = 14;

export function createFleetState(): FleetState {
	return {
		cursor: 0,
		expandedOutput: false,
		scrollOffset: 0,
		screen: "list",
		selectedId: null,
	};
}

// ============================================================================
// Snapshot building
// ============================================================================

const STATUS_PRIORITY: Record<AsyncJobState["status"], number> = {
	complete: 2,
	failed: 1,
	queued: 0,
	running: 0,
};

/**
 * Build sorted, display-ready job views from the live async job map.
 * Active runs come first (launch order), then failed, then completed.
 */
export function buildFleetJobs(jobs: AsyncJobState[], now: number = Date.now()): FleetJobView[] {
	const views: FleetJobView[] = [];
	for (const job of jobs) {
		const status: AsyncStatus | null = readStatus(job.asyncDir);
		const steps: FleetStepView[] = (status?.steps ?? []).map((step) => ({
			agent: step.agent,
			durationMs: step.durationMs,
			error: step.error,
			status: step.status,
			tokens: step.tokens?.total,
		}));
		const endTime = job.status === "complete" || job.status === "failed" ? (job.updatedAt ?? now) : now;
		const outputFile = status?.outputFile ?? job.outputFile;
		views.push({
			activity: job.status === "running" ? getLastActivity(outputFile) || "starting" : "",
			agents: job.agents,
			asyncId: job.asyncId,
			currentStep: status?.currentStep ?? job.currentStep,
			mode: status?.mode ?? job.mode,
			outputFile,
			sessionFile: status?.sessionFile ?? job.sessionFile,
			startedAt: status?.startedAt ?? job.startedAt,
			status: job.status,
			steps,
			stepsTotal: status?.steps?.length ?? job.stepsTotal ?? job.agents?.length ?? 1,
			totalTokens: status?.totalTokens?.total ?? job.totalTokens?.total,
			updatedAt: endTime,
		});
	}
	return views.sort((a, b) => {
		const priorityDiff = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
		if (priorityDiff !== 0) {
			return priorityDiff;
		}
		return (a.startedAt ?? 0) - (b.startedAt ?? 0);
	});
}

function clampCursor(state: FleetState, count: number): void {
	if (count === 0) {
		state.cursor = 0;
		state.scrollOffset = 0;
		return;
	}
	if (state.cursor < 0) {
		state.cursor = 0;
	}
	if (state.cursor >= count) {
		state.cursor = count - 1;
	}
	if (state.cursor < state.scrollOffset) {
		state.scrollOffset = state.cursor;
	}
	if (state.cursor >= state.scrollOffset + LIST_VIEWPORT_HEIGHT) {
		state.scrollOffset = state.cursor - LIST_VIEWPORT_HEIGHT + 1;
	}
}

/** Resolve the currently selected job, keeping selection stable across refreshes. */
export function selectedJob(state: FleetState, jobs: FleetJobView[]): FleetJobView | undefined {
	clampCursor(state, jobs.length);
	const job = jobs[state.cursor];
	if (job) {
		state.selectedId = job.asyncId;
	}
	return job;
}

// ============================================================================
// Input handling
// ============================================================================

/**
 * Handle a keypress. Mutates cursor/scroll position; returns an action for
 * anything the caller must perform (screen switches, close, refresh).
 */
export function handleFleetInput(state: FleetState, jobs: FleetJobView[], data: string): FleetAction | undefined {
	if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
		if (state.screen === "detail") {
			return { type: "back" };
		}
		return { type: "close" };
	}

	if (state.screen === "list") {
		if (matchesKey(data, "return") || matchesKey(data, "right")) {
			if (jobs.length > 0) {
				return { type: "open-detail" };
			}
			return;
		}
	} else if (state.screen === "detail") {
		if (matchesKey(data, "left") || matchesKey(data, "backspace")) {
			return { type: "back" };
		}
		if (matchesKey(data, "x") || matchesKey(data, "ctrl+o")) {
			return { type: "toggle-output" };
		}
	}

	if (matchesKey(data, "up") || matchesKey(data, "k")) {
		state.cursor -= 1;
		clampCursor(state, jobs.length);
		return;
	}
	if (matchesKey(data, "down") || matchesKey(data, "j")) {
		state.cursor += 1;
		clampCursor(state, jobs.length);
		return;
	}
	if (matchesKey(data, "pageUp")) {
		state.cursor -= LIST_VIEWPORT_HEIGHT;
		clampCursor(state, jobs.length);
		return;
	}
	if (matchesKey(data, "pageDown")) {
		state.cursor += LIST_VIEWPORT_HEIGHT;
		clampCursor(state, jobs.length);
		return;
	}
	if (matchesKey(data, "r")) {
		return { type: "refresh" };
	}

	if (state.screen === "list" && matchesKey(data, "q")) {
		return { type: "close" };
	}

	return undefined;
}

// ============================================================================
// Rendering
// ============================================================================

function statusIcon(status: FleetJobView["status"], theme: Theme): string {
	switch (status) {
		case "running":
			return theme.fg("warning", "●");
		case "queued":
			return theme.fg("dim", "○");
		case "failed":
			return theme.fg("error", "✗");
		default:
			return theme.fg("success", "●");
	}
}

function statusLabel(status: FleetJobStateLabel, theme: Theme): string {
	const labels: Record<FleetJobStateLabel, string> = {
		complete: "done",
		failed: "failed",
		queued: "queued",
		running: "running",
	};
	const colors: Record<FleetJobStateLabel, Parameters<Theme["fg"]>[0]> = {
		complete: "success",
		failed: "error",
		queued: "dim",
		running: "warning",
	};
	return theme.fg(colors[status], labels[status]);
}

type FleetJobStateLabel = AsyncJobState["status"];

function elapsedLabel(job: FleetJobView, now: number): string {
	if (!job.startedAt) {
		return "";
	}
	const end = job.status === "complete" || job.status === "failed" ? (job.updatedAt ?? now) : now;
	return formatDuration(end - job.startedAt);
}

function agentChain(job: FleetJobView, theme: Theme): string {
	const agents = job.agents ?? [];
	if (agents.length === 0) {
		return job.mode ?? "run";
	}
	const parts: string[] = [];
	for (let i = 0; i < agents.length; i++) {
		const stepStatus = job.steps[i]?.status;
		let icon = theme.fg("dim", "○");
		if (stepStatus === "running") {
			icon = theme.fg("warning", "●");
		} else if (stepStatus === "complete") {
			icon = theme.fg("success", "●");
		} else if (stepStatus === "failed") {
			icon = theme.fg("error", "✗");
		} else if (!job.steps.length && i <= (job.currentStep ?? -1)) {
			icon = theme.fg("warning", "●");
		}
		parts.push(`${icon} ${agents[i]}`);
	}
	return parts.join(theme.fg("dim", " → "));
}

export function renderFleetList(
	state: FleetState,
	jobs: FleetJobView[],
	width: number,
	theme: Theme,
	now: number = Date.now(),
): string[] {
	clampCursor(state, jobs.length);
	const activeCount = jobs.filter((j) => j.status === "running" || j.status === "queued").length;
	const lines: string[] = [];
	lines.push(renderHeader(` Subagent fleet [${activeCount} active / ${jobs.length}] `, width, theme));
	lines.push(row("", width, theme));

	const startIdx = state.scrollOffset;
	const endIdx = Math.min(jobs.length, startIdx + LIST_VIEWPORT_HEIGHT);

	if (jobs.length === 0) {
		lines.push(row(` ${theme.fg("dim", "No subagent activity")}`, width, theme));
		for (let i = 1; i < LIST_VIEWPORT_HEIGHT; i++) {
			lines.push(row("", width, theme));
		}
	} else {
		const innerW = width - 8;
		for (let i = startIdx; i < endIdx; i++) {
			const job = jobs[i]!;
			const isCursor = i === state.cursor;
			const cursorChar = isCursor ? theme.fg("accent", "▸") : " ";
			const icon = statusIcon(job.status, theme);
			const chain = agentChain(job, theme);
			const meta: string[] = [];
			const stepsTotal = job.stepsTotal;
			if (stepsTotal > 1 && job.currentStep !== undefined) {
				meta.push(`step ${Math.min(job.currentStep + 1, stepsTotal)}/${stepsTotal}`);
			} else if (stepsTotal > 1) {
				meta.push(`${stepsTotal} steps`);
			}
			const elapsed = elapsedLabel(job, now);
			if (elapsed) {
				meta.push(elapsed);
			}
			if (job.totalTokens) {
				meta.push(`${formatTokens(job.totalTokens)} tok`);
			}
			if (job.activity) {
				meta.push(job.activity);
			}
			let line = `${cursorChar} ${icon} ${chain} ${theme.fg("dim", `· ${meta.join(" · ")}`)}`;
			if (visibleWidthSafe(line) > innerW) {
				line = truncateAnsi(line, innerW);
			}
			lines.push(row(` ${line}`, width, theme));
		}
		for (let i = jobs.length; i < startIdx + LIST_VIEWPORT_HEIGHT; i++) {
			if (i >= endIdx) {
				lines.push(row("", width, theme));
			}
		}
	}

	const hint = jobs.length ? " ↑↓/jk select · enter inspect · r refresh · esc close " : " esc close ";
	lines.push(renderFooter(hint, width, theme));
	return lines;
}

export function renderFleetDetail(
	state: FleetState,
	job: FleetJobView | undefined,
	width: number,
	theme: Theme,
	now: number = Date.now(),
): string[] {
	const lines: string[] = [];
	const id = job?.asyncId.slice(0, 6) ?? "------";
	lines.push(renderHeader(` Subagent detail [${id}] `, width, theme));

	if (!job) {
		lines.push(row("", width, theme));
		lines.push(row(` ${theme.fg("dim", "Run no longer active")}`, width, theme));
		lines.push(row("", width, theme));
		lines.push(renderFooter(" ← back · esc close ", width, theme));
		return lines;
	}

	lines.push(row("", width, theme));
	const icon = statusIcon(job.status, theme);
	const label = statusLabel(job.status, theme);
	const elapsed = elapsedLabel(job, now);
	const tokensText = job.totalTokens ? ` · ${formatTokens(job.totalTokens)} tok` : "";
	lines.push(row(` ${icon} ${theme.bold(agentChainPlain(job))} ${label}${tokensText}`, width, theme));
	if (elapsed) {
		lines.push(row(`   ${theme.fg("dim", `elapsed ${elapsed}`)}`, width, theme));
	}

	if (job.steps.length > 0) {
		lines.push(row("", width, theme));
		for (let i = 0; i < job.steps.length; i++) {
			const step = job.steps[i]!;
			const isCurrent = i === job.currentStep;
			const marker = isCurrent ? theme.fg("accent", "▸") : " ";
			const stepIcon = statusIcon(
				step.status === "complete"
					? "complete"
					: step.status === "failed"
						? "failed"
						: step.status === "running"
							? "running"
							: "queued",
				theme,
			);
			const bits: string[] = [];
			if (step.durationMs !== undefined) {
				bits.push(formatDuration(step.durationMs));
			}
			if (step.tokens !== undefined) {
				bits.push(`${formatTokens(step.tokens)} tok`);
			}
			const suffix = bits.length ? theme.fg("dim", ` · ${bits.join(" · ")}`) : "";
			lines.push(row(` ${marker} ${stepIcon} ${pad(step.agent, 16)}${suffix}`, width, theme));
			if (step.error) {
				lines.push(row(`     ${theme.fg("error", truncateAnsi(step.error, width - 9))}`, width, theme));
			}
		}
	}

	const tailLines = getOutputTail(job.outputFile, state.expandedOutput ? EXPANDED_TAIL_LINES : COLLAPSED_TAIL_LINES);
	if (tailLines.length > 0 || job.status === "running") {
		lines.push(row("", width, theme));
		lines.push(
			row(` ${theme.fg("dim", `output (${state.expandedOutput ? "x collapse" : "x expand"})`)}`, width, theme),
		);
		if (tailLines.length === 0) {
			lines.push(row(`   ${theme.fg("dim", "waiting for output…")}`, width, theme));
		}
		for (const tailLine of tailLines) {
			for (const wrapped of tailLine.split("\n")) {
				lines.push(row(`   ${theme.fg("dim", truncateAnsi(wrapped, width - 7))}`, width, theme));
			}
		}
	}

	lines.push(row("", width, theme));
	lines.push(renderFooter(" ← back · x output · r refresh · esc close ", width, theme));
	return lines;
}

function agentChainPlain(job: FleetJobView): string {
	return job.agents?.length ? job.agents.join(" → ") : (job.mode ?? "run");
}

// Minimal ANSI-aware helpers (avoid importing render.ts internals)
// Hoisted per repo performance rules (no per-call RegExp compilation)
const ANSI_REGEX = /\x1B\[[0-9;]*m/g;
const ANSI_PREFIX_REGEX = /^\x1B\[[0-9;]*m/;

function visibleWidthSafe(text: string): number {
	return text.replace(ANSI_REGEX, "").length;
}

function truncateAnsi(text: string, maxWidth: number): string {
	if (visibleWidthSafe(text) <= maxWidth) {
		return text;
	}
	let result = "";
	let width = 0;
	let i = 0;
	while (i < text.length) {
		const match = ANSI_PREFIX_REGEX.exec(text.slice(i));
		if (match) {
			result += match[0];
			i += match[0].length;
			continue;
		}
		result += text[i]!;
		width++;
		i++;
		if (width >= maxWidth - 1) {
			return `${result}…`;
		}
	}
	// Unreachable: entering the loop requires visibleWidth > maxWidth, so the
	// check above always returns before every visible char is consumed.
	return result; // patch-coverage-ignore
}

// ============================================================================
// Component
// ============================================================================

export class FleetInspectorComponent implements Component {
	private jobs: FleetJobView[] = [];
	private pollTimer: ReturnType<typeof setInterval> | null = null;

	constructor(
		private readonly tui: TUI,
		private readonly theme: Theme,
		private readonly state: FleetState,
		private readonly getJobs: () => AsyncJobState[],
		private readonly done: (result: boolean) => void,
	) {
		this.refresh();
		this.pollTimer = setInterval(() => this.refresh(), 500);
		this.pollTimer.unref?.();
	}

	refresh(): void {
		this.jobs = buildFleetJobs(this.getJobs());
		if (this.state.selectedId && !this.jobs.some((j) => j.asyncId === this.state.selectedId)) {
			this.state.selectedId = null;
		}
		this.tui.requestRender();
	}

	dispose(): void {
		if (this.pollTimer) {
			clearInterval(this.pollTimer);
			this.pollTimer = null;
		}
	}

	handleInput(data: string): void {
		const action = handleFleetInput(this.state, this.jobs, data);
		if (!action) {
			this.tui.requestRender();
			return;
		}
		switch (action.type) {
			case "close":
				this.dispose();
				this.done(true);
				break;
			case "open-detail": {
				const job = selectedJob(this.state, this.jobs);
				if (job) {
					this.state.screen = "detail";
					this.state.expandedOutput = false;
					this.state.selectedId = job.asyncId;
				}
				break;
			}
			case "back":
				this.state.screen = "list";
				this.state.expandedOutput = false;
				break;
			case "toggle-output":
				this.state.expandedOutput = !this.state.expandedOutput;
				break;
			case "refresh":
				this.refresh();
				break;
		}
		this.tui.requestRender();
	}

	render(width: number): string[] {
		if (this.state.screen === "detail") {
			const job = this.jobs.find((j) => j.asyncId === this.state.selectedId) ?? selectedJob(this.state, this.jobs);
			return renderFleetDetail(this.state, job, width, this.theme);
		}
		return renderFleetList(this.state, this.jobs, width, this.theme);
	}

	invalidate(): void {}
}
