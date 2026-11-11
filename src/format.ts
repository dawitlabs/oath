import type { Contract } from "./contract.ts";
import type { Change } from "./diff.ts";

const count = (n: number): string => n.toLocaleString("en-US");

const VISIBLE_CALLERS = 3;

export function describeCallers(callers: string[] | undefined): string {
	if (!callers || callers.length === 0) return "";
	const shown = callers.slice(0, VISIBLE_CALLERS).join(", ");
	const hidden = callers.length - VISIBLE_CALLERS;
	return hidden > 0 ? `${shown} +${hidden}` : shown;
}

function callerCount(callers: string[] | undefined): string {
	if (!callers) return "";
	return `${callers.length} caller${callers.length === 1 ? "" : "s"}`;
}

function table(rows: string[][]): string[] {
	const widths = rows[0]?.map((_, column) =>
		Math.max(...rows.map((row) => row[column]?.length ?? 0)),
	);
	return rows.map((row) =>
		row
			.map((cell, column) =>
				column === row.length - 1 ? cell : cell.padEnd(widths?.[column] ?? 0),
			)
			.join("  ")
			.trimEnd(),
	);
}

export function formatContract(contract: Contract): string {
	const lines = [
		`Oath contract — ${contract.service}`,
		`${count(contract.samples)} samples · ${count(contract.endpoints.length)} endpoints`,
	];
	for (const endpoint of contract.endpoints) {
		lines.push("", `${endpoint.method} ${endpoint.path}`);
		for (const [status, response] of Object.entries(endpoint.responses)) {
			lines.push(`  ${status} (${count(response.samples)} samples)`);
			const rows = Object.entries(response.fields).map(([field, f]) => [
				field,
				f.type,
				f.presence,
				f.nullable ? "nullable" : "non-null",
				f.confidence,
				callerCount(f.callers),
			]);
			if (rows.length === 0) lines.push("    (no JSON fields)");
			lines.push(...table(rows).map((row) => `    ${row}`));
		}
	}
	return lines.join("\n");
}

export type Labels = { breaking: string; safe: string };

export const DIFF_LABELS: Labels = {
	breaking: "breaking",
	safe: "non-breaking",
};

export function formatDiff(
	changes: Change[],
	title: string,
	labels: Labels = DIFF_LABELS,
): string {
	const lines = [`Oath diff — ${title}`];
	const groups = new Map<string, Change[]>();
	for (const change of changes) {
		const heading = [change.method, change.path, change.status ?? ""]
			.join(" ")
			.trim();
		groups.set(heading, [...(groups.get(heading) ?? []), change]);
	}
	for (const [heading, group] of groups) {
		lines.push("", heading);
		const rows = group.map((change) => [
			change.mark,
			change.field ?? "",
			change.detail,
			change.confidence,
			`[${change.breaking ? labels.breaking : labels.safe}]`,
			change.callers ? `seen by ${describeCallers(change.callers)}` : "",
		]);
		lines.push(...table(rows).map((row) => `  ${row}`));
	}
	const breaking = changes.filter((change) => change.breaking).length;
	lines.push(
		"",
		changes.length === 0
			? "No behavioral differences."
			: `Summary: ${breaking} ${labels.breaking}, ${changes.length - breaking} ${labels.safe}`,
	);
	return lines.join("\n");
}
