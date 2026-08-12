#!/usr/bin/env node
/**
 * Synchronize documentation content from docs/*.md into the docs site MDX files.
 *
 * This script:
 * 1. Reads markdown files from the project's docs/ directory
 * 2. Strips the first H1 title (handled by the site page title)
 * 3. Converts HTML comments to MDX JSX comments
 * 4. Writes the result as MDX files in packages/monopi__docs/src/content/
 * 5. Generates a lazy-loaded JSON search index from the same canonical content
 *
 * Run: pnpm docs:sync
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "../../..");
const DOCS_DIR = join(REPO_ROOT, "docs");
const CONTENT_DIR = join(REPO_ROOT, "packages/monopi__docs/src/content");
const SEARCH_INDEX_PATH = join(CONTENT_DIR, "search-index.json");

const CODE_BLOCK_REGEX = /```[\s\S]*?```/g;
const HTML_TAG_REGEX = /<[^>]+>/g;
const MDX_COMMENT_REGEX = /\{\/\*[\s\S]*?\*\/\}/g;
const MARKDOWN_DECORATION_REGEX = /[#*_`~|]/g;
const MARKDOWN_LINK_REGEX = /\[([^\]]*)\]\([^)]*\)/g;
const WHITESPACE_REGEX = /\s+/g;

const TITLE_MAP = {
	"01-overview": {
		description: "What monopi adds to Pi Coding Agent and how the toolkit is organized.",
		order: 1,
		title: "Overview",
	},
	"02-install-and-configure": {
		description: "Install monopi, understand the configurator, and add packages or providers safely.",
		order: 2,
		title: "Install and Configure",
	},
	"03-included-workflows": {
		description: "Practical workflows for git safety, delegation, background work, scheduling, and observability.",
		order: 3,
		title: "Included Workflows",
	},
	"04-commands-tools-and-shortcuts": {
		description: "A discovery index for monopi commands, agent tools, and keyboard shortcuts.",
		order: 4,
		title: "Commands, Tools, and Shortcuts",
	},
	"05-packages-and-optional-add-ons": {
		description: "Default packages, split extensions, supporting libraries, and opt-in integrations.",
		order: 5,
		title: "Packages and Optional Add-ons",
	},
	"06-skills-agents-and-appearance": {
		description: "Customize Pi with skills, agent instructions, delegated roles, themes, and keybindings.",
		order: 6,
		title: "Skills, Agents, and Appearance",
	},
	"07-contributing-and-compatibility": {
		description: "Compatibility policy, local development, required checks, changesets, and documentation workflow.",
		order: 7,
		title: "Contributing and Compatibility",
	},
};

function convertHtmlCommentsToMdx(content) {
	// Convert <!-- {=tagName} --> to {/* MDT: {=tagName} */}
	content = content.replaceAll(/<!--\s*\{=([^}]+)\}\s*-->/g, "{/* MDT: {=$1} */}");
	// Convert <!-- {/tagName} --> to {/* MDT: {/tagName} */}
	content = content.replaceAll(/<!--\s*\{\/([^}]+)\}\s*-->/g, "{/* MDT: {/$1} */}");
	// Convert <!-- {@tagName} --> (provider definitions) to {/* MDT: {@tagName} */}
	content = content.replaceAll(/<!--\s*\{@([^}]+)\}\s*-->/g, "{/* MDT: {@$1} */}");
	return content;
}

function stripFirstH1(content) {
	return content.replace(/^# .+\n\n?/, "");
}

function cleanForSearch(content) {
	return content
		.replaceAll(CODE_BLOCK_REGEX, "")
		.replaceAll(HTML_TAG_REGEX, "")
		.replaceAll(MDX_COMMENT_REGEX, "")
		.replaceAll(MARKDOWN_DECORATION_REGEX, "")
		.replaceAll(MARKDOWN_LINK_REGEX, "$1")
		.replaceAll(WHITESPACE_REGEX, " ")
		.trim();
}

function syncDoc(baseName) {
	const mdPath = join(DOCS_DIR, `${baseName}.md`);
	const mdxPath = join(CONTENT_DIR, `${baseName}.mdx`);

	if (!existsSync(mdPath)) {
		console.warn(`Source file not found: ${mdPath}`);
		return;
	}

	const meta = TITLE_MAP[baseName];
	if (!meta) {
		console.warn(`No metadata for: ${baseName}`);
		return;
	}

	let source = readFileSync(mdPath, "utf8");
	source = stripFirstH1(source);
	source = convertHtmlCommentsToMdx(source);

	const output = `${source.trim()}\n`;

	if (!existsSync(mdxPath) || readFileSync(mdxPath, "utf8") !== output) {
		mkdirSync(CONTENT_DIR, { recursive: true });
		writeFileSync(mdxPath, output, "utf8");
		console.log(`Synced: ${baseName}.mdx`);
	} else {
		console.log(`Unchanged: ${baseName}.mdx`);
	}

	return {
		id: baseName,
		text: cleanForSearch(source),
		title: meta.title,
	};
}

const searchEntries = [];
for (const baseName of Object.keys(TITLE_MAP)) {
	const entry = syncDoc(baseName);
	if (entry) {
		searchEntries.push(entry);
	}
}

const searchIndexOutput = `${JSON.stringify(searchEntries, null, "\t")}\n`;
if (!existsSync(SEARCH_INDEX_PATH) || readFileSync(SEARCH_INDEX_PATH, "utf8") !== searchIndexOutput) {
	writeFileSync(SEARCH_INDEX_PATH, searchIndexOutput, "utf8");
	console.log("Synced: search-index.json");
} else {
	console.log("Unchanged: search-index.json");
}

console.log("\nDone! Run `pnpm docs:update` to sync MDT content with providers.");
