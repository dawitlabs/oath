import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const CLI = join(import.meta.dirname, "../src/cli.ts");
const EXAMPLES = join(import.meta.dirname, "../examples");
const dir = mkdtempSync(join(tmpdir(), "oath-"));

const oath = (...args: string[]) =>
	spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", cwd: dir });

test("contract then check exits 0 on unchanged traffic", () => {
	const baseline = join(dir, "baseline.json");
	const traffic = join(EXAMPLES, "baseline.jsonl");
	assert.equal(oath("contract", traffic, "--out", baseline).status, 0);
	const check = oath("check", "--contract", baseline, traffic);
	assert.equal(check.status, 0);
	assert.equal(check.stdout, "");
});

test("check exits 1 and prints breaking changes", () => {
	const baseline = join(dir, "baseline.json");
	oath("contract", join(EXAMPLES, "baseline.jsonl"), "--out", baseline);
	const check = oath(
		"check",
		"--contract",
		baseline,
		join(EXAMPLES, "current.jsonl"),
	);
	assert.equal(check.status, 1);
	assert.match(check.stdout, /legacy_id\s+presence sometimes → removed/);
	assert.match(check.stdout, /Summary: 6 breaking/);
});

test("exits 2 with a clear message on bad input", () => {
	const result = oath("diff", "missing.json", "other.json");
	assert.equal(result.status, 2);
	assert.match(result.stderr, /Cannot read missing\.json/);
});
