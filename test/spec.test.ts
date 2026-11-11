import assert from "node:assert/strict";
import { test } from "node:test";
import { buildContract } from "../src/contract.ts";
import { readOpenApi } from "../src/openapi.ts";
import { compareToSpec } from "../src/spec.ts";
import type { Sample } from "../src/traffic.ts";

const DOC = {
	openapi: "3.1.0",
	servers: [{ url: "https://api.test/v1" }],
	paths: {
		"/invoices/{invoiceId}": {
			get: {
				responses: {
					"200": {
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/Invoice" },
							},
						},
					},
					"404": { $ref: "#/components/responses/NotFound" },
				},
			},
		},
		"/health": { get: { responses: { "200": { description: "ok" } } } },
	},
	components: {
		responses: {
			NotFound: {
				content: {
					"application/json": {
						schema: {
							type: "object",
							required: ["error"],
							properties: { error: { type: "string" } },
						},
					},
				},
			},
		},
		schemas: {
			Invoice: {
				allOf: [{ $ref: "#/components/schemas/Base" }],
				type: "object",
				required: ["amount", "customer"],
				properties: {
					amount: { type: "integer" },
					memo: { type: ["string", "null"] },
					customer: {
						type: "object",
						properties: { name: { type: "string" } },
					},
					metadata: { type: "object", additionalProperties: true },
					parent: { $ref: "#/components/schemas/Invoice" },
				},
			},
			Base: {
				type: "object",
				required: ["id"],
				properties: { id: { type: "string" } },
			},
		},
	},
};

const samples = (body: unknown, status = 200): Sample[] =>
	Array.from({ length: 40 }, () => ({
		method: "GET",
		path: "/v1/invoices/inv_12345678",
		status,
		body,
	}));

test("flattens refs, allOf, nullable unions and stops on cycles", () => {
	const [invoice] = readOpenApi(DOC);
	assert.equal(invoice?.path, "/v1/invoices/{invoiceId}");
	const fields = invoice?.responses.get("200");
	assert.ok(fields instanceof Map);
	assert.equal(fields.get("id")?.required, true);
	assert.deepEqual([...(fields.get("amount")?.types ?? [])], ["number"]);
	assert.equal(fields.get("memo")?.nullable, true);
	assert.equal(fields.get("metadata")?.freeform, true);
	assert.equal(fields.has("parent.parent"), false);
});

test("reports undocumented fields, violations and unobserved required fields", () => {
	const observed = buildContract(
		[
			...samples({
				id: "a",
				amount: "12",
				customer: { name: null },
				metadata: { k: 1 },
				legacy_id: "x",
			}),
			...samples({ error: "not_found" }, 404),
			...samples({ error: "boom" }, 500),
		],
		"billing",
	);
	const result = compareToSpec(readOpenApi(DOC), observed).map(
		(c) => `${c.status ?? ""} ${c.field ?? "-"}: ${c.detail} ${c.breaking}`,
	);
	assert.deepEqual(result.sort(), [
		" -: documented endpoint not observed false",
		"200 amount: spec says number, observed string true",
		"200 customer.name: null observed, spec says non-nullable true",
		"200 legacy_id: undocumented field (always) false",
		"200 memo: documented, never observed false",
		"200 parent: documented, never observed false",
		"500 -: undocumented status code false",
	]);
});

test("rejects documents that are not OpenAPI 3", () => {
	assert.throws(() => readOpenApi({ swagger: "2.0" }), /OpenAPI 3/);
});
