const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERIC = /^\d+$/;
const HEX = /^[0-9a-f]{12,}$/i;
const TOKEN_WITH_DIGIT = /^(?=.*\d)[A-Za-z0-9_-]{8,}$/;

export function isIdSegment(segment: string): boolean {
	return (
		NUMERIC.test(segment) ||
		UUID.test(segment) ||
		HEX.test(segment) ||
		TOKEN_WITH_DIGIT.test(segment)
	);
}

export function templatePath(path: string): string {
	let idCount = 0;
	return path
		.split("/")
		.map((segment) => {
			if (!isIdSegment(segment)) return segment;
			idCount++;
			return idCount === 1 ? "{id}" : `{id${idCount}}`;
		})
		.join("/");
}
