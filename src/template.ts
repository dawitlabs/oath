const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERIC = /^\d+$/;
const HEX = /^[0-9a-f]{12,}$/i;
const PREFIXED_ID = /^[a-z]{2,8}_[A-Za-z0-9]{8,}$/;
const LONG_TOKEN = /^(?=.*\d)(?=.*[A-Za-z])[A-Za-z0-9_-]{16,}$/;

const MIN_DISTINCT_FOR_PARAM = 10;
const MIN_DISTINCT_RATIO = 0.5;
const MIN_DIGIT_SHARE = 0.8;
const MIN_DISTINCT_WITHOUT_DIGITS = 50;

export function isIdSegment(segment: string): boolean {
	return (
		NUMERIC.test(segment) ||
		UUID.test(segment) ||
		HEX.test(segment) ||
		PREFIXED_ID.test(segment) ||
		LONG_TOKEN.test(segment)
	);
}

function name(parts: (string | null)[]): string {
	let idCount = 0;
	return parts
		.map((part) => {
			if (part !== null) return part;
			idCount++;
			return idCount === 1 ? "{id}" : `{id${idCount}}`;
		})
		.join("/");
}

export function templatePath(path: string): string {
	return name(
		path.split("/").map((segment) => (isIdSegment(segment) ? null : segment)),
	);
}

type PathParts = { parts: (string | null)[]; weight: number };

export function learnTemplates(paths: string[]): Map<string, string> {
	const counts = new Map<string, number>();
	for (const path of paths) counts.set(path, (counts.get(path) ?? 0) + 1);
	const entries = new Map<string, PathParts>();
	for (const [path, weight] of counts) {
		const parts = path
			.split("/")
			.map((segment) => (isIdSegment(segment) ? null : segment));
		entries.set(path, { parts, weight });
	}
	const all = [...entries.values()];
	const depth = Math.max(0, ...all.map((entry) => entry.parts.length));
	for (let position = 0; position < depth; position++) {
		templateHighCardinality(all, position);
	}
	return new Map(
		[...entries].map(([path, entry]) => [path, name(entry.parts)]),
	);
}

function templateHighCardinality(all: PathParts[], position: number): void {
	const groups = new Map<string, PathParts[]>();
	for (const entry of all) {
		if (typeof entry.parts[position] !== "string") continue;
		const prefix = entry.parts.slice(0, position).map(String).join("/");
		const key = `${entry.parts.length}|${prefix}`;
		groups.set(key, [...(groups.get(key) ?? []), entry]);
	}
	for (const group of groups.values()) {
		const values = new Map<string, number>();
		for (const entry of group) {
			const value = entry.parts[position] ?? "";
			values.set(value, (values.get(value) ?? 0) + entry.weight);
		}
		const total = group.reduce((sum, entry) => sum + entry.weight, 0);
		const withDigits = [...values.keys()].filter((v) => /\d/.test(v)).length;
		const looksVariable =
			withDigits / values.size >= MIN_DIGIT_SHARE ||
			values.size >= MIN_DISTINCT_WITHOUT_DIGITS;
		const isParam =
			looksVariable &&
			values.size >= MIN_DISTINCT_FOR_PARAM &&
			values.size / total >= MIN_DISTINCT_RATIO;
		if (!isParam) continue;
		for (const entry of group) entry.parts[position] = null;
	}
}
