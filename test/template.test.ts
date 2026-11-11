import assert from "node:assert/strict";
import { test } from "node:test";
import { learnTemplates, templatePath } from "../src/template.ts";

test("replaces id-like segments with numbered placeholders", () => {
	assert.equal(templatePath("/v1/charges/ch_3Nx8Kq2eZvKm"), "/v1/charges/{id}");
	assert.equal(
		templatePath("/users/42/orders/9b2f1c3e-1a2b-4c5d-8e9f-0a1b2c3d4e5f"),
		"/users/{id}/orders/{id2}",
	);
});

test("keeps static segments", () => {
	assert.equal(templatePath("/v1/invoices/send"), "/v1/invoices/send");
	assert.equal(templatePath("/oauth2/token"), "/oauth2/token");
});

test("learns high-cardinality segments as parameters", () => {
	const paths = Array.from(
		{ length: 12 },
		(_, i) => `/reports/report${2010 + i}/summary`,
	);
	const learned = learnTemplates([...paths, "/reports/latest/summary"]);
	assert.equal(
		learned.get("/reports/report2015/summary"),
		"/reports/{id}/summary",
	);
});

test("does not template a handful of static resource names", () => {
	const resources = [
		"users",
		"orders",
		"invoices",
		"teams",
		"plans",
		"events",
		"files",
		"tags",
		"notes",
		"keys",
	];
	const learned = learnTemplates(resources.map((name) => `/v1/${name}`));
	assert.equal(learned.get("/v1/users"), "/v1/users");
});

test("keeps short static segments with digits", () => {
	assert.equal(templatePath("/v2/report2024"), "/v2/report2024");
});
