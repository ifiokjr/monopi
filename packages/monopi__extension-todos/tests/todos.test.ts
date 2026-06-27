import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";
import todosExtension from "../index.js";

function withTempTodoDir(fn: (dir: string) => Promise<void>) {
	return async () => {
		const dir = mkdtempSync(join(tmpdir(), "monopi-todos-"));
		const previous = process.env.PI_TODO_PATH;
		process.env.PI_TODO_PATH = dir;
		try {
			await fn(dir);
		} finally {
			process.env.PI_TODO_PATH = previous;
			rmSync(dir, { recursive: true, force: true });
		}
	};
}

describe("todos extension registration", () => {
	it("registers the /todos command and todo tool", () => {
		const harness = createExtensionHarness();
		todosExtension(harness.pi);

		expect(Array.from(harness.commands.keys()).sort()).toEqual(["todos"]);
		expect(Array.from(harness.tools.keys()).sort()).toEqual(["todo"]);
	});
});

describe("todo tool", () => {
	beforeEach(() => {
		vi.useRealTimers();
	});

	it(
		"creates and lists todos",
		withTempTodoDir(async () => {
			const harness = createExtensionHarness();
			todosExtension(harness.pi);
			const todo = harness.tools.get("todo");

			await todo.execute(
				"call-1",
				{ action: "create", title: "Write tests" },
				new AbortController().signal,
				() => {},
				harness.ctx,
			);
			const created2 = await todo.execute(
				"call-2",
				{ action: "create", title: "Ship package", tags: ["release"] },
				new AbortController().signal,
				() => {},
				harness.ctx,
			);

			const list = await todo.execute(
				"call-3",
				{ action: "list" },
				new AbortController().signal,
				() => {},
				harness.ctx,
			);
			expect(list.details.todos).toHaveLength(2);
			expect(list.details.todos.map((t: { title: string }) => t.title).sort()).toEqual(["Ship package", "Write tests"]);
			expect(created2.details.todo.tags).toEqual(["release"]);
			expect(created2.details.todo.status).toBe("open");
		}),
	);

	it(
		"gets a created todo by id",
		withTempTodoDir(async () => {
			const harness = createExtensionHarness();
			todosExtension(harness.pi);
			const todo = harness.tools.get("todo");

			const created = await todo.execute(
				"call-1",
				{ action: "create", title: "Document the tool", body: "Notes go here" },
				new AbortController().signal,
				() => {},
				harness.ctx,
			);
			const id = created.details.todo.id;

			const fetched = await todo.execute(
				"call-2",
				{ action: "get", id },
				new AbortController().signal,
				() => {},
				harness.ctx,
			);
			expect(fetched.details.todo.title).toBe("Document the tool");
		}),
	);

	it(
		"returns an error for unknown todo ids",
		withTempTodoDir(async () => {
			const harness = createExtensionHarness();
			todosExtension(harness.pi);
			const todo = harness.tools.get("todo");

			const result = await todo.execute(
				"call-1",
				{ action: "get", id: "deadbeef" },
				new AbortController().signal,
				() => {},
				harness.ctx,
			);
			expect(result.details.error).toBe("not found");
			expect(result.content[0].text).toContain("not found");
		}),
	);

	it(
		"deletes a created todo",
		withTempTodoDir(async () => {
			const harness = createExtensionHarness();
			todosExtension(harness.pi);
			const todo = harness.tools.get("todo");

			const created = await todo.execute(
				"call-1",
				{ action: "create", title: "Temporary task" },
				new AbortController().signal,
				() => {},
				harness.ctx,
			);
			const id = created.details.todo.id;

			await todo.execute("call-2", { action: "delete", id }, new AbortController().signal, () => {}, harness.ctx);
			const list = await todo.execute(
				"call-3",
				{ action: "list" },
				new AbortController().signal,
				() => {},
				harness.ctx,
			);
			expect(list.details.todos).toHaveLength(0);
		}),
	);

	it(
		"requires a title when creating",
		withTempTodoDir(async () => {
			const harness = createExtensionHarness();
			todosExtension(harness.pi);
			const todo = harness.tools.get("todo");

			const result = await todo.execute(
				"call-1",
				{ action: "create", title: "" },
				new AbortController().signal,
				() => {},
				harness.ctx,
			);
			expect(result.details.error).toBe("title required");
		}),
	);
});
