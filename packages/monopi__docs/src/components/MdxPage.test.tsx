import { describe, expect, it } from "vitest";

import { getInternalDocTarget, getLazyContent } from "./MdxPage";

describe("getLazyContent", () => {
	it("reuses the lazy component for a page module across renders", () => {
		const loadPage = async () => ({ default: () => null });

		expect(getLazyContent(loadPage)).toBe(getLazyContent(loadPage));
	});
});

describe("getInternalDocTarget", () => {
	it("converts generated Markdown links into client-side routes", () => {
		expect(getInternalDocTarget("02-install-and-configure.md")).toBe("/02-install-and-configure");
		expect(getInternalDocTarget("./03-included-workflows.md#worktrees")).toBe("/03-included-workflows#worktrees");
	});

	it("leaves external and non-document links alone", () => {
		expect(getInternalDocTarget("https://example.com/docs.md")).toBeNull();
		expect(getInternalDocTarget("#requirements")).toBeNull();
	});
});
