import assert from "node:assert/strict";
import { test } from "node:test";
import { parseHar, parseJsonl } from "../src/traffic.ts";

test("parses JSONL with url, path and string bodies", () => {
	const text = [
		'{"method":"get","url":"https://api.test/v1/a?x=1","status":200,"body":{"id":1}}',
		'{"method":"GET","path":"/v1/b","status":200,"body":"{\\"ok\\":true}"}',
		'{"method":"GET","path":"/v1/c","status":200,"body":"<html>"}',
		"",
	].join("\n");
	const { samples, skipped } = parseJsonl(text, "t.jsonl");
	assert.equal(skipped, 1);
	assert.deepEqual(
		samples.map((s) => [s.method, s.path]),
		[
			["GET", "/v1/a"],
			["GET", "/v1/b"],
		],
	);
});

test("reports the line number of invalid JSONL", () => {
	assert.throws(() => parseJsonl('{"a":1}\nnope', "t.jsonl"), /t\.jsonl:2/);
});

test("parses HAR entries including base64 bodies", () => {
	const encoded = Buffer.from('{"id":7}').toString("base64");
	const har = {
		log: {
			entries: [
				{
					request: { method: "GET", url: "https://api.test/v1/x/12345" },
					response: {
						status: 200,
						content: {
							mimeType: "application/json",
							text: encoded,
							encoding: "base64",
						},
					},
				},
				{
					request: { method: "GET", url: "https://api.test/logo.png" },
					response: {
						status: 200,
						content: { mimeType: "image/png", text: "" },
					},
				},
			],
		},
	};
	const { samples, skipped } = parseHar(JSON.stringify(har), "t.har", {
		callerHeader: "user-agent",
	});
	assert.equal(skipped, 1);
	assert.deepEqual(samples[0]?.body, { id: 7 });
});

test("reads callers from JSONL and HAR headers", () => {
	const jsonl = parseJsonl(
		'{"method":"GET","path":"/a","status":200,"body":{},"caller":"ios-app"}',
		"t.jsonl",
	);
	assert.equal(jsonl.samples[0]?.caller, "ios-app");
	const har = {
		log: {
			entries: [
				{
					request: {
						method: "GET",
						url: "https://api.test/a",
						headers: [{ name: "User-Agent", value: "partner-sdk/2.1 (linux)" }],
					},
					response: {
						status: 200,
						content: { mimeType: "application/json", text: "{}" },
					},
				},
			],
		},
	};
	const parsed = parseHar(JSON.stringify(har), "t.har", {
		callerHeader: "user-agent",
	});
	assert.equal(parsed.samples[0]?.caller, "partner-sdk/2.1");
});
