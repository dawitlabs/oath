import {
	type Confidence,
	type Contract,
	confidenceFor,
	type EndpointContract,
	type FieldContract,
	type ResponseContract,
} from "./contract.ts";

export type ChangeMark = "+" | "-" | "~";

export type Change = {
	method: string;
	path: string;
	status?: string;
	field?: string;
	mark: ChangeMark;
	breaking: boolean;
	detail: string;
	confidence: Confidence;
};

type Location = Pick<Change, "method" | "path" | "status">;

const CONFIDENCE_RANK: Record<Confidence, number> = {
	low: 0,
	medium: 1,
	high: 2,
};

export function meetsConfidence(
	actual: Confidence,
	minimum: Confidence,
): boolean {
	return CONFIDENCE_RANK[actual] >= CONFIDENCE_RANK[minimum];
}

function lowest(a: Confidence, b: Confidence): Confidence {
	return CONFIDENCE_RANK[a] <= CONFIDENCE_RANK[b] ? a : b;
}

export function diffContracts(base: Contract, current: Contract): Change[] {
	const key = (endpoint: EndpointContract): string =>
		`${endpoint.method} ${endpoint.path}`;
	const currentByKey = new Map(current.endpoints.map((e) => [key(e), e]));
	const baseKeys = new Set(base.endpoints.map(key));
	const changes: Change[] = [];

	for (const baseEndpoint of base.endpoints) {
		const currentEndpoint = currentByKey.get(key(baseEndpoint));
		if (currentEndpoint) {
			changes.push(...diffEndpoint(baseEndpoint, currentEndpoint));
			continue;
		}
		changes.push({
			method: baseEndpoint.method,
			path: baseEndpoint.path,
			mark: "-",
			breaking: false,
			detail: "endpoint not observed in current traffic",
			confidence: confidenceFor(baseEndpoint.samples),
		});
	}
	for (const currentEndpoint of current.endpoints) {
		if (baseKeys.has(key(currentEndpoint))) continue;
		changes.push({
			method: currentEndpoint.method,
			path: currentEndpoint.path,
			mark: "+",
			breaking: false,
			detail: "new endpoint",
			confidence: confidenceFor(currentEndpoint.samples),
		});
	}
	return changes;
}

function diffEndpoint(
	base: EndpointContract,
	current: EndpointContract,
): Change[] {
	const changes: Change[] = [];
	const statuses = new Set([
		...Object.keys(base.responses),
		...Object.keys(current.responses),
	]);
	for (const status of [...statuses].sort()) {
		const location = { method: base.method, path: base.path, status };
		const baseResponse = base.responses[status];
		const currentResponse = current.responses[status];
		if (baseResponse && currentResponse) {
			changes.push(...diffResponse(location, baseResponse, currentResponse));
		} else if (baseResponse) {
			changes.push({
				...location,
				mark: "-",
				breaking: false,
				detail: "status not observed in current traffic",
				confidence: confidenceFor(baseResponse.samples),
			});
		} else if (currentResponse) {
			changes.push({
				...location,
				mark: "+",
				breaking: false,
				detail: "new status code",
				confidence: confidenceFor(currentResponse.samples),
			});
		}
	}
	return changes;
}

function isUnder(path: string, parents: Set<string>): boolean {
	for (const parent of parents) {
		if (path.startsWith(`${parent}.`) || path.startsWith(`${parent}[]`))
			return true;
	}
	return false;
}

function diffResponse(
	location: Location,
	base: ResponseContract,
	current: ResponseContract,
): Change[] {
	const changes: Change[] = [];
	const currentConfidence = confidenceFor(current.samples);
	const removed = new Set<string>();
	for (const [field, baseField] of Object.entries(base.fields)) {
		if (isUnder(field, removed)) continue;
		const confidence = lowest(baseField.confidence, currentConfidence);
		const currentField = current.fields[field];
		if (!currentField) {
			removed.add(field);
			changes.push({
				...location,
				field,
				mark: "-",
				breaking: true,
				detail: `presence ${baseField.presence} → removed`,
				confidence,
			});
			continue;
		}
		for (const change of diffField(baseField, currentField)) {
			changes.push({ ...location, field, mark: "~", confidence, ...change });
		}
	}
	const added = new Set<string>();
	for (const [field, currentField] of Object.entries(current.fields)) {
		if (base.fields[field] || isUnder(field, added)) continue;
		added.add(field);
		changes.push({
			...location,
			field,
			mark: "+",
			breaking: false,
			detail: `new field (${currentField.presence})`,
			confidence: lowest(currentField.confidence, currentConfidence),
		});
	}
	return changes;
}

function diffField(
	base: FieldContract,
	current: FieldContract,
): Pick<Change, "breaking" | "detail">[] {
	const changes: Pick<Change, "breaking" | "detail">[] = [];
	if (base.presence !== current.presence) {
		changes.push({
			breaking: base.presence === "always",
			detail: `presence ${base.presence} → ${current.presence}`,
		});
	}
	if (base.type !== current.type) {
		const baseTypes = new Set(base.type.split("|"));
		const widened = current.type
			.split("|")
			.some((type) => !baseTypes.has(type));
		changes.push({
			breaking: widened,
			detail: `type ${base.type} → ${current.type}`,
		});
	}
	if (base.nullable !== current.nullable) {
		changes.push({
			breaking: current.nullable,
			detail: current.nullable ? "now nullable" : "no longer nullable",
		});
	}
	return changes;
}
