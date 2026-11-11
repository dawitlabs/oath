import assert from "node:assert/strict";
import { test } from "node:test";
import { templatePath } from "../src/template.ts";

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
