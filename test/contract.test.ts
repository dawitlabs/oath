import assert from "node:assert/strict";
import { test } from "node:test";
import { buildContract, parseContract } from "../src/contract.ts";
import type { Sample } from "../src/traffic.ts";

const sample = (body: unknown, path = "/v1/items/item_00000001"): Sample => ({
	method: "GET",
	path,
	status: 200,
	body,
});

const SAMPLES = [
	sample({ id: "a", legacy: 1, tags: ["x"], owner: { name: "A" } }),
	sample({ id: "b", tags: [], owner: { name: null } }),
	sample({ id: "c", tags: ["y", "z"], owner: { name: "C" } }),
];

test("records presence, nullability and nested paths", () => {
	const contract = buildContract(SAMPLES, "items");
	const endpoint = contract.endpoints[0];
	assert.equal(endpoint?.path, "/v1/items/{id}");
	const fields = endpoint?.responses["200"]?.fields ?? {};
	assert.equal(fields.id?.presence, "always");
	assert.equal(fields.legacy?.presence, "sometimes");
	assert.equal(fields["owner.name"]?.type, "string");
	assert.equal(fields["owner.name"]?.nullable, true);
	assert.equal(fields["tags[]"]?.type, "string");
	assert.equal(fields["tags[]"]?.presence, "always");
});

test("is deterministic regardless of sample order", () => {
	const forward = JSON.stringify(buildContract(SAMPLES, "items"));
	const reversed = JSON.stringify(
		buildContract([...SAMPLES].reverse(), "items"),
	);
	assert.equal(forward, reversed);
});

test("round-trips through parseContract", () => {
	const contract = buildContract(SAMPLES, "items");
	assert.deepEqual(parseContract(JSON.stringify(contract), "x.json"), contract);
});

test("rejects files that are not contracts", () => {
	assert.throws(
		() => parseContract('{"oath":2}', "x.json"),
		/not an Oath contract/,
	);
	assert.throws(() => parseContract("nope", "x.json"), /not valid JSON/);
});
