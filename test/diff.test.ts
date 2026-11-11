import assert from "node:assert/strict";
import { test } from "node:test";
import { buildContract } from "../src/contract.ts";
import { diffContracts } from "../src/diff.ts";
import type { Sample } from "../src/traffic.ts";

const samples = (body: unknown, path = "/v1/items/item_00000001"): Sample[] =>
	Array.from({ length: 40 }, () => ({
		method: "GET",
		path,
		status: 200,
		body,
	}));

const contractOf = (...groups: Sample[][]) => buildContract(groups.flat(), "s");

const summary = (base: Sample[][], current: Sample[][]) =>
	diffContracts(contractOf(...base), contractOf(...current)).map(
		(change) => `${change.field ?? "-"} ${change.detail} ${change.breaking}`,
	);

test("flags removed fields, type changes and new nulls as breaking", () => {
	const result = summary(
		[samples({ id: "a", amount: 1, name: "x", legacy: { code: 1 } })],
		[samples({ id: "a", amount: "1", name: null })],
	);
	assert.deepEqual(result.sort(), [
		"amount type number → string true",
		"legacy presence always → removed true",
		"name now nullable true",
		"name type string → null true",
	]);
});

test("treats additions and narrowing as non-breaking", () => {
	const result = summary(
		[samples({ id: "a" }), samples({ id: 1 })],
		[samples({ id: "a", extra: { deep: true } })],
	);
	assert.deepEqual(result.sort(), [
		"extra new field (always) false",
		"id type number|string → string false",
	]);
});

test("does not call unobserved endpoints breaking", () => {
	const result = summary(
		[samples({ id: "a" }), samples({ ok: true }, "/v1/health")],
		[samples({ id: "a" })],
	);
	assert.deepEqual(result, [
		"- endpoint not observed in current traffic false",
	]);
});
