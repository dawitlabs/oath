import { readFile } from "node:fs/promises";

export type Sample = {
	method: string;
	path: string;
	status: number;
	body: unknown;
};

export type TrafficFile = {
	samples: Sample[];
	skipped: number;
};

export class TrafficError extends Error {}

export async function readTraffic(file: string): Promise<TrafficFile> {
	const text = await readFile(file, "utf8").catch(() => {
		throw new TrafficError(`Cannot read ${file}`);
	});
	if (file.endsWith(".har") || text.trimStart().startsWith('{"log"')) {
		return parseHar(text, file);
	}
	return parseJsonl(text, file);
}

export function parseJsonl(text: string, file: string): TrafficFile {
	const samples: Sample[] = [];
	let skipped = 0;
	const lines = text.split("\n");
	for (const [index, line] of lines.entries()) {
		if (line.trim() === "") continue;
		const record = parseJson(line);
		if (record === undefined) {
			throw new TrafficError(`${file}:${index + 1} is not valid JSON`);
		}
		const sample = toSample(record);
		if (sample) samples.push(sample);
		else skipped++;
	}
	return { samples, skipped };
}

export function parseHar(text: string, file: string): TrafficFile {
	const har = parseJson(text);
	const entries =
		isRecord(har) && isRecord(har.log) ? har.log.entries : undefined;
	if (!Array.isArray(entries)) {
		throw new TrafficError(`${file} is not a HAR file (missing log.entries)`);
	}
	const samples: Sample[] = [];
	let skipped = 0;
	for (const entry of entries) {
		const sample = harEntryToSample(entry);
		if (sample) samples.push(sample);
		else skipped++;
	}
	return { samples, skipped };
}

function harEntryToSample(entry: unknown): Sample | undefined {
	if (
		!isRecord(entry) ||
		!isRecord(entry.request) ||
		!isRecord(entry.response)
	) {
		return undefined;
	}
	const content = entry.response.content;
	if (!isRecord(content) || typeof content.text !== "string") return undefined;
	const mimeType = typeof content.mimeType === "string" ? content.mimeType : "";
	if (!mimeType.includes("json")) return undefined;
	const text =
		content.encoding === "base64"
			? Buffer.from(content.text, "base64").toString("utf8")
			: content.text;
	return toSample({
		method: entry.request.method,
		url: entry.request.url,
		status: entry.response.status,
		body: text,
	});
}

function toSample(record: unknown): Sample | undefined {
	if (!isRecord(record)) return undefined;
	const { method, status } = record;
	const path = normalizePath(record.path ?? record.url);
	if (typeof method !== "string" || typeof status !== "number" || !path) {
		return undefined;
	}
	const body =
		typeof record.body === "string" ? parseJson(record.body) : record.body;
	if (body === undefined) return undefined;
	return { method: method.toUpperCase(), path, status, body };
}

function normalizePath(value: unknown): string | undefined {
	if (typeof value !== "string" || value === "") return undefined;
	const pathname = URL.canParse(value)
		? new URL(value).pathname
		: (value.split("?")[0] ?? "");
	return pathname.startsWith("/") ? pathname : `/${pathname}`;
}

function parseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
