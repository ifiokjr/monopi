export interface MdxPageData {
	slug: string;
	title: string;
	order: number;
	description?: string;
	module: () => Promise<{ default: React.ComponentType }>;
}

const mdxModules = import.meta.glob<{ default: React.ComponentType }>("../content/**/*.mdx", {
	eager: false,
});

function extractFrontmatter(modulePath: string): { title: string; order: number; description?: string } {
	// We can't read the raw file at runtime in the browser,
	// So we encode frontmatter in the module path convention.
	// Instead, we parse the slug for ordering.
	const fileName = modulePath.split("/").pop() ?? "";
	const match = fileName.match(/^(\d+)-(.+)\.mdx$/);
	if (match) {
		const order = Number.parseInt(match[1], 10);
		const titleSlug = match[2].replaceAll(/-/g, " ").replaceAll(/\b\w/g, (c) => c.toUpperCase());
		return { order, title: titleSlug };
	}
	return {
		order: 999,
		title: fileName.replace(/\.mdx$/, "").replace(/-/g, " "),
	};
}

// Static frontmatter map — keeps MDX content clean while providing rich metadata.
// Order matches the original docs numbering.
const frontmatterMap: Record<string, { title: string; order: number; description: string }> = {
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

export function useMdxPages(): MdxPageData[] {
	const pages = Object.entries(mdxModules).map(([modulePath, module]): MdxPageData => {
		const fileName = modulePath.split("/").pop() ?? "";
		const slug = fileName.replace(/\.mdx$/, "");
		const staticMeta = frontmatterMap[slug];
		const fallbackMeta = extractFrontmatter(modulePath);

		return {
			description: staticMeta?.description,
			module: module as () => Promise<{ default: React.ComponentType }>,
			order: staticMeta?.order ?? fallbackMeta.order,
			slug,
			title: staticMeta?.title ?? fallbackMeta.title,
		};
	});

	return pages.toSorted((a, b) => a.order - b.order);
}
