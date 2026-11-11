import {
	type Contract,
	confidenceFor,
	type EndpointContract,
	type FieldContract,
	type ResponseContract,
} from "./contract.ts";
import type { Change } from "./diff.ts";
import type { SpecEndpoint, SpecField, SpecResponse } from "./openapi.ts";

type Location = Pick<Change, "method" | "path" | "status">;

const segments = (path: string): string[] =>
	path.split("/").map((segment) => (/^\{.+\}$/.test(segment) ? "{}" : segment));

function matchScore(specPath: string, observedPath: string): number {
	const spec = segments(specPath);
	const observed = segments(observedPath);
	if (spec.length !== observed.length) return -1;
	let score = 0;
	for (const [index, segment] of spec.entries()) {
		if (segment === observed[index]) score++;
		else if (segment !== "{}") return -1;
	}
	return score;
}

function findSpecEndpoint(
	spec: SpecEndpoint[],
	endpoint: EndpointContract,
): SpecEndpoint | undefined {
	let best: SpecEndpoint | undefined;
	let bestScore = -1;
	for (const candidate of spec) {
		if (candidate.method !== endpoint.method) continue;
		const score = matchScore(candidate.path, endpoint.path);
		if (score > bestScore) {
			best = candidate;
			bestScore = score;
		}
	}
	return best;
}

function findSpecResponse(
	endpoint: SpecEndpoint,
	status: string,
): SpecResponse | undefined {
	return (
		endpoint.responses.get(status) ??
		endpoint.responses.get(`${status[0]}XX`) ??
		endpoint.responses.get("default")
	);
}

function isUnder(path: string, parents: Iterable<string>): boolean {
	for (const parent of parents) {
		if (path.startsWith(`${parent}.`) || path.startsWith(`${parent}[]`))
			return true;
	}
	return false;
}

function withCallers(change: Change, field: FieldContract): Change {
	return field.callers ? { ...change, callers: field.callers } : change;
}

export function compareToSpec(
	spec: SpecEndpoint[],
	observed: Contract,
): Change[] {
	const changes: Change[] = [];
	const matched = new Set<SpecEndpoint>();
	for (const endpoint of observed.endpoints) {
		const specEndpoint = findSpecEndpoint(spec, endpoint);
		if (!specEndpoint) {
			changes.push({
				method: endpoint.method,
				path: endpoint.path,
				mark: "+",
				breaking: false,
				detail: "undocumented endpoint",
				confidence: confidenceFor(endpoint.samples),
			});
			continue;
		}
		matched.add(specEndpoint);
		changes.push(...compareEndpoint(specEndpoint, endpoint));
	}
	for (const specEndpoint of spec) {
		if (matched.has(specEndpoint)) continue;
		changes.push({
			method: specEndpoint.method,
			path: specEndpoint.path,
			mark: "-",
			breaking: false,
			detail: "documented endpoint not observed",
			confidence: "low",
		});
	}
	return changes;
}

function compareEndpoint(
	spec: SpecEndpoint,
	observed: EndpointContract,
): Change[] {
	const changes: Change[] = [];
	for (const [status, response] of Object.entries(observed.responses)) {
		const location = { method: observed.method, path: observed.path, status };
		const specResponse = findSpecResponse(spec, status);
		if (!specResponse) {
			changes.push({
				...location,
				mark: "+",
				breaking: false,
				detail: "undocumented status code",
				confidence: confidenceFor(response.samples),
			});
			continue;
		}
		if (specResponse === "untyped") continue;
		changes.push(...compareFields(location, specResponse, response));
	}
	return changes;
}

function compareFields(
	location: Location,
	spec: Map<string, SpecField>,
	observed: ResponseContract,
): Change[] {
	const changes: Change[] = [];
	const freeform = [...spec]
		.filter(([, field]) => field.freeform)
		.map(([path]) => path);
	const undocumented = new Set<string>();
	for (const [path, field] of Object.entries(observed.fields)) {
		if (isUnder(path, freeform) || isUnder(path, undocumented)) continue;
		const specField = spec.get(path);
		const base = { ...location, field: path, confidence: field.confidence };
		if (!specField) {
			undocumented.add(path);
			changes.push(
				withCallers(
					{
						...base,
						mark: "+",
						breaking: false,
						detail: `undocumented field (${field.presence})`,
					},
					field,
				),
			);
			continue;
		}
		for (const violation of violations(specField, field)) {
			changes.push(
				withCallers(
					{ ...base, mark: "~", breaking: true, detail: violation },
					field,
				),
			);
		}
	}
	changes.push(...unobservedFields(location, spec, observed));
	return changes;
}

function violations(spec: SpecField, observed: FieldContract): string[] {
	const found: string[] = [];
	const observedTypes = observed.type
		.split("|")
		.filter((type) => type !== "null");
	const unexpected = observedTypes.filter((type) => !spec.types.has(type));
	if (spec.types.size > 0 && unexpected.length > 0) {
		found.push(
			`spec says ${[...spec.types].join("|")}, observed ${observed.type}`,
		);
	}
	if (spec.required && observed.presence === "sometimes") {
		found.push("required in spec, missing in some responses");
	}
	if (observed.nullable && !spec.nullable) {
		found.push("null observed, spec says non-nullable");
	}
	return found;
}

function unobservedFields(
	location: Location,
	spec: Map<string, SpecField>,
	observed: ResponseContract,
): Change[] {
	const changes: Change[] = [];
	const missing = new Set<string>();
	const confidence = confidenceFor(observed.samples);
	for (const [path, field] of spec) {
		if (observed.fields[path] || isUnder(path, missing)) continue;
		missing.add(path);
		changes.push({
			...location,
			field: path,
			mark: "-",
			breaking: field.required,
			detail: field.required
				? "required in spec, never observed"
				: "documented, never observed",
			confidence,
		});
	}
	return changes;
}
