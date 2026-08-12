import { describe, expect, it } from "vitest";

import { getLazyContent } from "./MdxPage";

describe("getLazyContent", () => {
	it("reuses the lazy component for a page module across renders", () => {
		const loadPage = async () => ({ default: () => null });

		expect(getLazyContent(loadPage)).toBe(getLazyContent(loadPage));
	});
});
