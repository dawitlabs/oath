import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDiffMarkdown } from "../src/markdown.ts";

test("renders a PR comment table with escaped cells", () => {
	const output = formatDiffMarkdown(
		[
			{
				method: "GET",
				path: "/v1/a",
				status: "200",
				field: "id",
				mark: "~",
				breaking: true,
				detail: "type number → number|string",
				confidence: "high",
				callers: ["web", "ios"],
			},
		],
		"base → current",
	);
	assert.match(output, /<!-- oath-diff -->/);
	assert.match(output, /\*\*1 breaking\*\*, 0 non-breaking/);
	assert.match(
		output,
		/\| ~ \| `id` \| type number → number\\\|string \| \*\*breaking\*\* \| high \| web, ios \|/,
	);
});

test("says so when nothing changed", () => {
	assert.match(formatDiffMarkdown([], "a → b"), /No behavioral differences\./);
});
