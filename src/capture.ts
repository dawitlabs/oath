import { createWriteStream, type WriteStream } from "node:fs";
import {
	createServer,
	request as httpRequest,
	type IncomingMessage,
	type OutgoingHttpHeaders,
	type Server,
	type ServerResponse,
} from "node:http";
import { request as httpsRequest } from "node:https";
import { isRecord, normalizeCaller } from "./traffic.ts";

export type CaptureOptions = {
	target: URL;
	port: number;
	out: string;
	sampleRate: number;
	callerHeader: string;
};

export type CaptureSession = {
	port: number;
	recorded: () => number;
	stop: () => Promise<void>;
};

const MAX_BODY_BYTES = 5 * 1024 * 1024;

export function shapeOf(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(shapeOf);
	if (isRecord(value)) {
		return Object.fromEntries(
			Object.entries(value).map(([key, child]) => [key, shapeOf(child)]),
		);
	}
	if (typeof value === "string") return "";
	if (typeof value === "number") return 0;
	if (typeof value === "boolean") return false;
	return null;
}

function upstreamPath(target: URL, requestUrl: string): string {
	const base = target.pathname.replace(/\/$/, "");
	return `${base}${requestUrl}`;
}

function forwardHeaders(
	req: IncomingMessage,
	target: URL,
): OutgoingHttpHeaders {
	const headers: OutgoingHttpHeaders = { ...req.headers, host: target.host };
	delete headers["accept-encoding"];
	return headers;
}

function parseBody(chunks: Buffer[]): unknown {
	try {
		return JSON.parse(Buffer.concat(chunks).toString("utf8"));
	} catch {
		return undefined;
	}
}

type Recorder = (req: IncomingMessage, status: number, body: unknown) => void;

function proxy(
	req: IncomingMessage,
	res: ServerResponse,
	target: URL,
	record: Recorder,
): void {
	const send = target.protocol === "https:" ? httpsRequest : httpRequest;
	const upstream = send(
		{
			protocol: target.protocol,
			hostname: target.hostname,
			port: target.port,
			method: req.method,
			path: upstreamPath(target, req.url ?? "/"),
			headers: forwardHeaders(req, target),
		},
		(upstreamRes) => {
			const status = upstreamRes.statusCode ?? 502;
			res.writeHead(status, upstreamRes.headers);
			upstreamRes.pipe(res);
			const isJson = String(upstreamRes.headers["content-type"]).includes(
				"json",
			);
			if (!isJson) return;
			const chunks: Buffer[] = [];
			let size = 0;
			upstreamRes.on("data", (chunk: Buffer) => {
				size += chunk.length;
				if (size <= MAX_BODY_BYTES) chunks.push(chunk);
			});
			upstreamRes.on("end", () => {
				if (size > MAX_BODY_BYTES) return;
				const body = parseBody(chunks);
				if (body !== undefined) record(req, status, body);
			});
		},
	);
	upstream.on("error", () => {
		if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain" });
		res.end(`oath capture: cannot reach ${target.origin}\n`);
	});
	req.pipe(upstream);
}

function writer(
	out: WriteStream,
	options: CaptureOptions,
	count: () => void,
): Recorder {
	return (req, status, body) => {
		if (Math.random() >= options.sampleRate) return;
		const line: Record<string, unknown> = {
			method: req.method,
			path: req.url,
			status,
			body: shapeOf(body),
		};
		const caller = normalizeCaller(
			options.callerHeader,
			req.headers[options.callerHeader.toLowerCase()],
		);
		if (caller) line.caller = caller;
		out.write(`${JSON.stringify(line)}\n`);
		count();
	};
}

function listen(server: Server, port: number): Promise<number> {
	return new Promise((resolve, reject) => {
		server.once("error", (error: NodeJS.ErrnoException) => {
			const message =
				error.code === "EADDRINUSE"
					? `Port ${port} is already in use`
					: error.message;
			reject(new Error(message));
		});
		server.listen(port, "127.0.0.1", () => {
			const address = server.address();
			resolve(typeof address === "object" && address ? address.port : port);
		});
	});
}

export async function startCapture(
	options: CaptureOptions,
): Promise<CaptureSession> {
	const out = createWriteStream(options.out, { flags: "a" });
	let recorded = 0;
	const record = writer(out, options, () => {
		recorded++;
	});
	const server = createServer((req, res) =>
		proxy(req, res, options.target, record),
	);
	const port = await listen(server, options.port);
	return {
		port,
		recorded: () => recorded,
		stop: () =>
			new Promise((resolve) => {
				server.closeAllConnections();
				server.close(() => out.end(() => resolve()));
			}),
	};
}
