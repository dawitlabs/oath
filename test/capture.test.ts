import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { shapeOf, startCapture } from "../src/capture.ts";

test("shapeOf keeps structure and drops values", () => {
	assert.deepEqual(shapeOf({ a: "secret", b: [1, true, null], c: { d: 9 } }), {
		a: "",
		b: [0, false, null],
		c: { d: 0 },
	});
});

test("proxies requests and records response shapes with callers", async () => {
	const upstream = createServer((req, res) => {
		if (req.url?.startsWith("/page")) {
			res.writeHead(200, { "content-type": "text/html" });
			res.end("<p>hi</p>");
			return;
		}
		res.writeHead(201, { "content-type": "application/json" });
		res.end(JSON.stringify({ id: "inv_secret", amount: 4200 }));
	});
	await new Promise<void>((resolve) =>
		upstream.listen(0, "127.0.0.1", resolve),
	);
	const address = upstream.address();
	const upstreamPort =
		typeof address === "object" && address ? address.port : 0;
	const out = join(
		mkdtempSync(join(tmpdir(), "oath-capture-")),
		"traffic.jsonl",
	);
	const session = await startCapture({
		target: new URL(`http://127.0.0.1:${upstreamPort}`),
		port: 0,
		out,
		sampleRate: 1,
		callerHeader: "x-client",
	});
	const base = `http://127.0.0.1:${session.port}`;
	const json = await fetch(`${base}/v1/invoices?limit=1`, {
		method: "POST",
		headers: { "x-client": "billing-ui" },
		body: "{}",
	});
	assert.deepEqual(await json.json(), { id: "inv_secret", amount: 4200 });
	assert.equal(await (await fetch(`${base}/page`)).text(), "<p>hi</p>");
	await session.stop();
	await new Promise<void>((resolve) => upstream.close(() => resolve()));

	const lines = readFileSync(out, "utf8")
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line));
	assert.equal(session.recorded(), 1);
	assert.deepEqual(lines, [
		{
			method: "POST",
			path: "/v1/invoices?limit=1",
			status: 201,
			body: { id: "", amount: 0 },
			caller: "billing-ui",
		},
	]);
});
