import { isRecord } from "./traffic.ts";

export type SpecField = {
	types: Set<string>;
	required: boolean;
	nullable: boolean;
	freeform: boolean;
};

export type SpecResponse = Map<string, SpecField> | "untyped";

export type SpecEndpoint = {
	method: string;
	path: string;
	responses: Map<string, SpecResponse>;
};

type Schema = Record<string, unknown>;

const METHODS = ["get", "put", "post", "delete", "patch", "head", "options"];

export class SpecError extends Error {}

export function readOpenApi(doc: unknown): SpecEndpoint[] {
	if (!isRecord(doc) || typeof doc.openapi !== "string") {
		throw new SpecError(
			'Expected an OpenAPI 3.x document (missing "openapi" version)',
		);
	}
	if (!isRecord(doc.paths))
		throw new SpecError('OpenAPI document has no "paths"');
	const basePath = serverBasePath(doc.servers);
	const endpoints: SpecEndpoint[] = [];
	for (const [path, item] of Object.entries(doc.paths)) {
		if (!isRecord(item)) continue;
		for (const method of METHODS) {
			const operation = item[method];
			if (!isRecord(operation) || !isRecord(operation.responses)) continue;
			endpoints.push({
				method: method.toUpperCase(),
				path: `${basePath}${path}`,
				responses: readResponses(doc, operation.responses),
			});
		}
	}
	return endpoints;
}

function serverBasePath(servers: unknown): string {
	const url =
		Array.isArray(servers) && isRecord(servers[0]) ? servers[0].url : "";
	if (typeof url !== "string" || url === "") return "";
	const pathname = URL.canParse(url) ? new URL(url).pathname : url;
	return pathname.startsWith("/") ? pathname.replace(/\/$/, "") : "";
}

function readResponses(
	doc: Schema,
	responses: Schema,
): Map<string, SpecResponse> {
	const result = new Map<string, SpecResponse>();
	for (const [status, raw] of Object.entries(responses)) {
		const response = resolve(doc, raw, new Set());
		const content =
			response && isRecord(response.content) ? response.content : {};
		const jsonType = Object.keys(content).find((mime) => mime.includes("json"));
		const media = jsonType ? content[jsonType] : undefined;
		const schema = isRecord(media)
			? resolve(doc, media.schema, new Set())
			: undefined;
		if (!schema) {
			result.set(status, "untyped");
			continue;
		}
		const fields = new Map<string, SpecField>();
		flatten(doc, schema, {
			prefix: "",
			fields,
			seen: new Set(),
			optional: false,
		});
		result.set(status, fields);
	}
	return result;
}

function resolve(
	doc: Schema,
	value: unknown,
	seen: Set<string>,
): Schema | undefined {
	if (!isRecord(value)) return undefined;
	const ref = value.$ref;
	if (typeof ref !== "string") return value;
	if (seen.has(ref) || !ref.startsWith("#/")) return undefined;
	seen.add(ref);
	let target: unknown = doc;
	for (const part of ref.slice(2).split("/")) {
		const key = part.replaceAll("~1", "/").replaceAll("~0", "~");
		target = isRecord(target) ? target[key] : undefined;
	}
	return resolve(doc, target, seen);
}

function typesOf(schema: Schema): { types: Set<string>; nullable: boolean } {
	const declared = Array.isArray(schema.type) ? schema.type : [schema.type];
	const types = new Set<string>();
	let nullable = schema.nullable === true;
	for (const type of declared) {
		if (type === "null") nullable = true;
		else if (type === "integer") types.add("number");
		else if (typeof type === "string") types.add(type);
	}
	if (types.size === 0 && isRecord(schema.properties)) types.add("object");
	if (types.size === 0 && schema.items !== undefined) types.add("array");
	return { types, nullable };
}

type FlattenState = {
	prefix: string;
	fields: Map<string, SpecField>;
	seen: Set<string>;
	optional: boolean;
};

function flatten(doc: Schema, schema: Schema, state: FlattenState): void {
	for (const part of asArray(schema.allOf)) {
		const resolved = resolve(doc, part, new Set(state.seen));
		if (resolved) flatten(doc, resolved, state);
	}
	for (const part of [...asArray(schema.oneOf), ...asArray(schema.anyOf)]) {
		const resolved = resolve(doc, part, new Set(state.seen));
		if (resolved) flatten(doc, resolved, { ...state, optional: true });
	}
	if (isRecord(schema.properties)) {
		const required = new Set(asArray(schema.required).map(String));
		for (const [key, raw] of Object.entries(schema.properties)) {
			const path = state.prefix === "" ? key : `${state.prefix}.${key}`;
			addField(doc, raw, path, !state.optional && required.has(key), state);
		}
	}
	if (schema.items !== undefined) {
		addField(doc, schema.items, `${state.prefix}[]`, true, state);
	}
}

function addField(
	doc: Schema,
	raw: unknown,
	path: string,
	required: boolean,
	state: FlattenState,
): void {
	const seen = new Set(state.seen);
	const schema = resolve(doc, raw, seen);
	if (!schema) return;
	const { types, nullable } = typesOf(schema);
	const hasStructure =
		isRecord(schema.properties) ||
		schema.items !== undefined ||
		schema.allOf !== undefined ||
		schema.oneOf !== undefined ||
		schema.anyOf !== undefined;
	const field = {
		types,
		required,
		nullable,
		freeform: types.has("object") && !hasStructure,
	};
	mergeField(state.fields, path, field);
	flatten(doc, schema, {
		prefix: path,
		fields: state.fields,
		seen,
		optional: false,
	});
}

function mergeField(
	fields: Map<string, SpecField>,
	path: string,
	field: SpecField,
): void {
	const existing = fields.get(path);
	if (!existing) {
		fields.set(path, field);
		return;
	}
	for (const type of field.types) existing.types.add(type);
	existing.required &&= field.required;
	existing.nullable ||= field.nullable;
	existing.freeform ||= field.freeform;
}

function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}
