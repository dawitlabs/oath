import { learnTemplates } from "./template.ts";
import { isRecord, type Sample } from "./traffic.ts";

export type Presence = "always" | "sometimes";
export type Confidence = "high" | "medium" | "low";

export type FieldContract = {
	type: string;
	presence: Presence;
	nullable: boolean;
	samples: number;
	confidence: Confidence;
	callers?: string[];
};

export type ResponseContract = {
	samples: number;
	fields: Record<string, FieldContract>;
};

export type EndpointContract = {
	method: string;
	path: string;
	samples: number;
	responses: Record<string, ResponseContract>;
};

export type Contract = {
	oath: 1;
	service: string;
	samples: number;
	endpoints: EndpointContract[];
};

type FieldStats = {
	present: number;
	nulls: number;
	types: Set<string>;
	callers: Set<string>;
	container: string;
};

type ResponseStats = {
	samples: number;
	containers: Map<string, number>;
	fields: Map<string, FieldStats>;
};

const HIGH_CONFIDENCE_SAMPLES = 30;
const MEDIUM_CONFIDENCE_SAMPLES = 5;
export const MAX_STORED_CALLERS = 50;

export function confidenceFor(observations: number): Confidence {
	if (observations >= HIGH_CONFIDENCE_SAMPLES) return "high";
	if (observations >= MEDIUM_CONFIDENCE_SAMPLES) return "medium";
	return "low";
}

export function buildContract(samples: Sample[], service: string): Contract {
	const endpoints = new Map<string, Map<number, ResponseStats>>();
	const templates = learnTemplates(samples.map((sample) => sample.path));
	for (const sample of samples) {
		const key = `${sample.method} ${templates.get(sample.path) ?? sample.path}`;
		const statuses = endpoints.get(key) ?? new Map<number, ResponseStats>();
		endpoints.set(key, statuses);
		const stats = statuses.get(sample.status) ?? newResponseStats();
		statuses.set(sample.status, stats);
		stats.samples++;
		visit(stats, sample.body, "", sample.caller);
	}
	return {
		oath: 1,
		service,
		samples: samples.length,
		endpoints: [...endpoints.entries()]
			.map(([key, statuses]) => toEndpoint(key, statuses))
			.sort(compareEndpoints),
	};
}

function newResponseStats(): ResponseStats {
	return { samples: 0, containers: new Map(), fields: new Map() };
}

function visit(
	stats: ResponseStats,
	value: unknown,
	path: string,
	caller: string | undefined,
): void {
	if (Array.isArray(value)) {
		const elementPath = `${path}[]`;
		for (const item of value) {
			increment(stats.containers, `${elementPath}#`);
			record(
				stats,
				{ path: elementPath, container: `${elementPath}#`, caller },
				item,
			);
			visit(stats, item, elementPath, caller);
		}
		return;
	}
	if (!isRecord(value)) return;
	increment(stats.containers, path);
	for (const [key, child] of Object.entries(value)) {
		const fieldPath = path === "" ? key : `${path}.${key}`;
		record(stats, { path: fieldPath, container: path, caller }, child);
		visit(stats, child, fieldPath, caller);
	}
}

type Slot = { path: string; container: string; caller: string | undefined };

function record(stats: ResponseStats, slot: Slot, value: unknown): void {
	const field = stats.fields.get(slot.path) ?? {
		present: 0,
		nulls: 0,
		types: new Set<string>(),
		callers: new Set<string>(),
		container: slot.container,
	};
	stats.fields.set(slot.path, field);
	field.present++;
	if (slot.caller) field.callers.add(slot.caller);
	if (value === null) field.nulls++;
	else field.types.add(jsonType(value));
}

function increment(counts: Map<string, number>, key: string): void {
	counts.set(key, (counts.get(key) ?? 0) + 1);
}

function jsonType(value: unknown): string {
	if (Array.isArray(value)) return "array";
	return typeof value;
}

function toEndpoint(
	key: string,
	statuses: Map<number, ResponseStats>,
): EndpointContract {
	const [method = "", path = ""] = key.split(" ");
	const sorted = [...statuses.entries()].sort(([a], [b]) => a - b);
	const responses: Record<string, ResponseContract> = {};
	let samples = 0;
	for (const [status, stats] of sorted) {
		responses[String(status)] = toResponse(stats);
		samples += stats.samples;
	}
	return { method, path, samples, responses };
}

function toResponse(stats: ResponseStats): ResponseContract {
	const fields: Record<string, FieldContract> = {};
	const paths = [...stats.fields.keys()].sort();
	for (const path of paths) {
		const field = stats.fields.get(path);
		if (!field) continue;
		const observations = stats.containers.get(field.container) ?? field.present;
		const contract: FieldContract = {
			type: [...field.types].sort().join("|") || "null",
			presence: field.present >= observations ? "always" : "sometimes",
			nullable: field.nulls > 0,
			samples: field.present,
			confidence: confidenceFor(observations),
		};
		if (field.callers.size > 0) {
			contract.callers = [...field.callers].sort().slice(0, MAX_STORED_CALLERS);
		}
		fields[path] = contract;
	}
	return { samples: stats.samples, fields };
}

function compareEndpoints(a: EndpointContract, b: EndpointContract): number {
	return a.path.localeCompare(b.path) || a.method.localeCompare(b.method);
}

export function parseContract(text: string, file: string): Contract {
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		throw new Error(`${file} is not valid JSON`);
	}
	if (!isContract(value)) {
		throw new Error(`${file} is not an Oath contract (expected "oath": 1)`);
	}
	return value;
}

function isContract(value: unknown): value is Contract {
	return (
		isRecord(value) &&
		value.oath === 1 &&
		typeof value.service === "string" &&
		Array.isArray(value.endpoints) &&
		value.endpoints.every(isEndpoint)
	);
}

function isEndpoint(value: unknown): value is EndpointContract {
	return (
		isRecord(value) &&
		typeof value.method === "string" &&
		typeof value.path === "string" &&
		isRecord(value.responses) &&
		Object.values(value.responses).every(isResponse)
	);
}

function isResponse(value: unknown): value is ResponseContract {
	return (
		isRecord(value) &&
		typeof value.samples === "number" &&
		isRecord(value.fields) &&
		Object.values(value.fields).every(isField)
	);
}

function isField(value: unknown): value is FieldContract {
	return (
		isRecord(value) &&
		typeof value.type === "string" &&
		(value.presence === "always" || value.presence === "sometimes") &&
		typeof value.nullable === "boolean" &&
		typeof value.samples === "number" &&
		(value.callers === undefined ||
			(Array.isArray(value.callers) &&
				value.callers.every((caller) => typeof caller === "string"))) &&
		(value.confidence === "high" ||
			value.confidence === "medium" ||
			value.confidence === "low")
	);
}
