import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { createBashTool } from "@earendil-works/pi-coding-agent";
import { constants, accessSync } from "node:fs";
import { Type } from "typebox";

export const NATIVE_SHELL_TOOL = "native_shell";

const SHELL_INSTRUCTION_MARKER = "## Shell Syntax";
const SHELL_PATH_SEPARATOR_REGEX = /[\\/]/;
const SHELL_VERSION_SUFFIX_REGEX = /[-.]\d.*$/;
const WINDOWS_EXECUTABLE_SUFFIX_REGEX = /\.exe$/;
const SUPPORTED_SHELL_KEYS = new Set(["fish", "nu", "pwsh", "zsh"]);

const NATIVE_SHELL_PARAMETERS = Type.Object({
	command: Type.String({ description: "Command to execute using the user's login shell syntax" }),
	timeout: Type.Optional(Type.Number({ description: "Optional timeout in seconds" })),
});

export interface ShellProfile {
	name: string;
	note: string;
}

const SHELL_PROFILES: Record<string, ShellProfile> = {
	nu: {
		name: "Nushell",
		note:
			"For user-facing commands and `native_shell` calls, use Nushell syntax.\n" +
			"Key differences from Bash:\n" +
			"- Variables: `$var` not `${var}`; use `$env.VAR` for environment variables\n" +
			"- Lists: `[a b c]` not quoted space-separated strings\n" +
			"- Pipes pass structured records and tables\n" +
			"- No `&&` chaining; use `;` or `and`/`or` keywords\n" +
			'- String interpolation: `$"Hello ($name)"`\n' +
			"- Use `^` to explicitly run external commands, for example `^git status`\n" +
			"- Shell variables use `let`, or `mut` when reassignment is required",
	},
	fish: {
		name: "Fish",
		note:
			"For user-facing commands and `native_shell` calls, use Fish syntax.\n" +
			"Key differences from Bash:\n" +
			"- Variables: `set var value`, then use `$var`\n" +
			"- Use `(command)` instead of `$()` for command substitution\n" +
			"- Use `and`/`or` instead of `&&`/`||`\n" +
			"- Use `end` instead of `fi`/`done`/`esac`\n" +
			"- Functions use `function name ... end`",
	},
	bash: {
		name: "Bash",
		note: "Use standard Bash syntax.",
	},
	sh: {
		name: "POSIX shell",
		note: "Use POSIX-compatible shell syntax.",
	},
	zsh: {
		name: "Zsh",
		note: "For user-facing commands and `native_shell` calls, Zsh-specific syntax is supported.",
	},
	pwsh: {
		name: "PowerShell",
		note:
			"For user-facing commands and `native_shell` calls, use PowerShell syntax.\n" +
			"Key differences from Bash:\n" +
			"- Variables: `$var`; environment variables: `$env:VAR`\n" +
			"- Commands commonly use the Verb-Noun pattern\n" +
			"- Pipes pass objects rather than text\n" +
			"- Prefer `Select-String`, `-replace`, and `Where-Object` to grep/sed/awk",
	},
};

function normalizeShellBinary(shellPath: string): string {
	const shellBinary = shellPath.split(SHELL_PATH_SEPARATOR_REGEX).pop()?.toLowerCase() ?? "";
	return shellBinary.replace(WINDOWS_EXECUTABLE_SUFFIX_REGEX, "").replace(SHELL_VERSION_SUFFIX_REGEX, "");
}

export function detectShell(env: NodeJS.ProcessEnv = process.env): { key: string; info: ShellProfile } {
	if (env.NU_VERSION) {
		return { key: "nu", info: SHELL_PROFILES.nu };
	}

	if (env.FISH_VERSION) {
		return { key: "fish", info: SHELL_PROFILES.fish };
	}

	if (env.ZSH_VERSION) {
		return { key: "zsh", info: SHELL_PROFILES.zsh };
	}

	if (env.BASH_VERSION) {
		return { key: "bash", info: SHELL_PROFILES.bash };
	}

	if (env.PSModulePath && !env.SHELL) {
		return { key: "pwsh", info: SHELL_PROFILES.pwsh };
	}

	const shellPath = env.SHELL ?? "";
	const shellKey = normalizeShellBinary(shellPath);
	const info = SHELL_PROFILES[shellKey];

	if (info) {
		return { key: shellKey, info };
	}

	return {
		key: shellKey || "unknown",
		info: {
			name: shellKey || "unknown shell",
			note: `Could not determine shell type from $SHELL="${shellPath}". Use standard POSIX syntax.`,
		},
	};
}

function isExecutableFile(filePath: string): boolean {
	try {
		accessSync(filePath, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

export function resolveNativeShellPath(
	shellKey: string,
	env: NodeJS.ProcessEnv = process.env,
	isExecutable: (filePath: string) => boolean = isExecutableFile,
): string | undefined {
	const shellPath = env.SHELL?.trim();

	if (
		!SUPPORTED_SHELL_KEYS.has(shellKey) ||
		!shellPath ||
		normalizeShellBinary(shellPath) !== shellKey ||
		!isExecutable(shellPath)
	) {
		return undefined;
	}

	return shellPath;
}

export function buildShellInstruction(info: ShellProfile, nativeShellAvailable: boolean): string {
	const nativeShellGuidance = nativeShellAvailable
		? `- The \`${NATIVE_SHELL_TOOL}\` tool executes ${info.name} syntax directly. Use it when native-shell execution is required.\n`
		: `- No native ${info.name} execution tool is available. Use Bash syntax for \`bash\` tool calls.\n`;
	return `
${SHELL_INSTRUCTION_MARKER}

The user's login shell is **${info.name}**. Format commands intended for the user to copy and run in
${info.name} syntax.

Execution tools do not translate between shell dialects. Tool calls MUST use the syntax declared by the tool:
- The \`bash\` tool executes Bash syntax. Never send ${info.name}-specific syntax to \`bash\`.
${nativeShellGuidance}- Other command tools must receive the dialect stated in their descriptions.

A failed command is recoverable. Read the tool result, correct the command or dialect, and retry when safe.

${info.note}

Keep user-facing examples in ${info.name} syntax while keeping execution-tool calls in each tool's declared dialect.
`;
}

function isPromptInjectionSupported(shellKey: string): boolean {
	return SUPPORTED_SHELL_KEYS.has(shellKey);
}

export interface ShellFormatOptions {
	env?: NodeJS.ProcessEnv;
	isExecutable?: (filePath: string) => boolean;
	createShellTool?: typeof createBashTool;
}

export default function shellFormatExtension(pi: ExtensionAPI, options: ShellFormatOptions = {}): void {
	const env = options.env ?? process.env;
	const { key: shellKey, info } = detectShell(env);
	const nativeShellPath = resolveNativeShellPath(shellKey, env, options.isExecutable);
	const createShellTool = options.createShellTool ?? createBashTool;
	const isSupported = isPromptInjectionSupported(shellKey);
	const fullInstruction = buildShellInstruction(info, Boolean(nativeShellPath));
	const statusLabel = `${info.name} user syntax`;

	if (isSupported && nativeShellPath) {
		pi.registerTool({
			name: NATIVE_SHELL_TOOL,
			label: `${info.name} shell`,
			description: `Execute commands directly with the user's ${info.name} login shell. Accepts ${info.name} syntax.`,
			parameters: NATIVE_SHELL_PARAMETERS,
			async execute(toolCallId, params, signal, onUpdate, ctx) {
				const nativeShell = createShellTool(ctx.cwd, { shellPath: nativeShellPath });
				return nativeShell.execute(toolCallId, params, signal, onUpdate);
			},
		});
	}

	pi.on("session_start", (_event, ctx) => {
		if (!isSupported) {
			return;
		}

		ctx.ui.setStatus("shell-format", statusLabel);
		ctx.ui.notify(
			`Shell format: user-facing commands use ${info.name}; tool calls use each tool's declared dialect` +
				(nativeShellPath ? ` (${NATIVE_SHELL_TOOL} available)` : ""),
			"info",
		);
	});

	pi.on("before_agent_start", (event) => {
		if (!isSupported || event.systemPrompt.includes(SHELL_INSTRUCTION_MARKER)) {
			return;
		}

		return {
			systemPrompt: event.systemPrompt + fullInstruction,
		};
	});

	pi.on("session_shutdown", (_event, ctx) => {
		ctx.ui.setStatus("shell-format", undefined);
	});
}

export const shellFormatInternals = {
	SHELL_PROFILES,
	buildShellInstruction,
	detectShell,
	isPromptInjectionSupported,
	normalizeShellBinary,
	resolveNativeShellPath,
};
