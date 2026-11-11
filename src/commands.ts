import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { startCapture } from "./capture.ts";
import {
	buildContract,
	type Confidence,
	type Contract,
	parseContract,
} from "./contract.ts";
import { type Change, diffContracts, meetsConfidence } from "./diff.ts";
import {
	DIFF_LABELS,
	formatContract,
	formatDiff,
	type Labels,
} from "./format.ts";
import { formatDiffMarkdown } from "./markdown.ts";
import { readOpenApi } from "./openapi.ts";
import { compareToSpec } from "./spec.ts";
import { readTraffic, type Sample } from "./traffic.ts";

export type Flags = {
	out: string | undefined;
	service: string | undefined;
	pretty: boolean;
	contract: string | undefined;
	json: boolean;
	markdown: boolean;
	verbose: boolean;
	onlyBreaking: boolean;
	minConfidence: string;
	ignore: string[];
	callerHeader: string;
	target: string | undefined;
	port: string;
	sample: string;
};

export class UsageError extends Error {}

const SPEC_LABELS: Labels = { breaking: "violation", safe: "info" };

async function loadSamples(files: string[], flags: Flags): Promise<Sample[]> {
	if (files.length === 0) throw new UsageError("No traffic files given");
	const options = { callerHeader: flags.callerHeader };
	const results = await Promise.all(
		files.map((file) => readTraffic(file, options)),
	);
	const skipped = results.reduce((total, result) => total + result.skipped, 0);
	const samples = results.flatMap((result) => result.samples);
	if (skipped > 0) {
		process.stderr.write(
			`Skipped ${skipped} entries without a JSON response body\n`,
		);
	}
	if (samples.length === 0) {
		throw new UsageError(`No JSON responses found in ${files.join(", ")}`);
	}
	return samples;
}

async function readText(file: string): Promise<string> {
	return readFile(file, "utf8").catch(() => {
		throw new UsageError(`Cannot read ${file}`);
	});
}

async function loadContract(file: string): Promise<Contract> {
	return parseContract(await readText(file), file);
}

function toConfidence(value: string): Confidence {
	if (value === "high" || value === "medium" || value === "low") return value;
	throw new UsageError(
		`--min-confidence must be high, medium, or low (got "${value}")`,
	);
}

function isIgnored(field: string | undefined, ignored: string[]): boolean {
	if (!field) return false;
	return ignored.some(
		(path) =>
			field === path ||
			field.startsWith(`${path}.`) ||
			field.startsWith(`${path}[]`),
	);
}

function applyFilters(changes: Change[], flags: Flags): Change[] {
	const minimum = toConfidence(flags.minConfidence);
	return changes.filter(
		(change) =>
			(!flags.onlyBreaking || change.breaking) &&
			meetsConfidence(change.confidence, minimum) &&
			!isIgnored(change.field, flags.ignore),
	);
}

function report(
	changes: Change[],
	title: string,
	flags: Flags,
	labels: Labels,
): number {
	let output = formatDiff(changes, title, labels);
	if (flags.markdown) output = formatDiffMarkdown(changes, title, labels);
	if (flags.json) output = JSON.stringify({ changes }, null, 2);
	process.stdout.write(`${output}\n`);
	return changes.some((change) => change.breaking) ? 1 : 0;
}

export async function runContract(
	files: string[],
	flags: Flags,
): Promise<number> {
	const samples = await loadSamples(files, flags);
	const out = flags.out ?? "oath.contract.json";
	const contract = buildContract(
		samples,
		flags.service ?? basename(process.cwd()),
	);
	await writeFile(out, `${JSON.stringify(contract, null, 2)}\n`);
	if (flags.pretty) process.stdout.write(`${formatContract(contract)}\n\n`);
	process.stdout.write(
		`Wrote ${out} — ${contract.endpoints.length} endpoints from ${samples.length} samples\n`,
	);
	return 0;
}

export async function runDiff(files: string[], flags: Flags): Promise<number> {
	const [baseFile, currentFile] = files;
	if (!baseFile || !currentFile || files.length > 2) {
		throw new UsageError("diff needs exactly two contract files");
	}
	const [base, current] = await Promise.all([
		loadContract(baseFile),
		loadContract(currentFile),
	]);
	const changes = applyFilters(diffContracts(base, current), flags);
	return report(changes, `${baseFile} → ${currentFile}`, flags, DIFF_LABELS);
}

export async function runCheck(files: string[], flags: Flags): Promise<number> {
	if (!flags.contract)
		throw new UsageError("check needs --contract <baseline.json>");
	const [base, samples] = await Promise.all([
		loadContract(flags.contract),
		loadSamples(files, flags),
	]);
	const current = buildContract(samples, base.service);
	const changes = applyFilters(diffContracts(base, current), flags);
	const hasBreaking = changes.some((change) => change.breaking);
	if (!hasBreaking && !flags.verbose && !flags.json && !flags.markdown)
		return 0;
	return report(
		changes,
		`${flags.contract} → observed traffic`,
		flags,
		DIFF_LABELS,
	);
}

export async function runSpec(files: string[], flags: Flags): Promise<number> {
	const [specFile, ...observedFiles] = files;
	if (!specFile || observedFiles.length === 0) {
		throw new UsageError(
			"spec needs an OpenAPI file and a contract or traffic files",
		);
	}
	if (/\.ya?ml$/i.test(specFile)) {
		throw new UsageError(
			`YAML specs are not supported yet. Convert first: npx js-yaml ${specFile} > openapi.json`,
		);
	}
	const specText = await readText(specFile);
	let doc: unknown;
	try {
		doc = JSON.parse(specText);
	} catch {
		throw new UsageError(`${specFile} is not valid JSON`);
	}
	const spec = readOpenApi(doc);
	const [onlyFile] = observedFiles;
	const observed =
		observedFiles.length === 1 && onlyFile?.endsWith(".json")
			? await loadContract(onlyFile)
			: buildContract(await loadSamples(observedFiles, flags), "observed");
	const changes = applyFilters(compareToSpec(spec, observed), flags);
	return report(changes, `${specFile} → observed traffic`, flags, SPEC_LABELS);
}

function parseTarget(value: string | undefined): URL {
	if (!value)
		throw new UsageError(
			"capture needs --target <url>, e.g. http://localhost:3000",
		);
	const withScheme = /^https?:\/\//.test(value) ? value : `http://${value}`;
	if (!URL.canParse(withScheme))
		throw new UsageError(`Invalid --target "${value}"`);
	return new URL(withScheme);
}

function parseNumber(
	value: string,
	flag: string,
	min: number,
	max: number,
): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
		throw new UsageError(
			`${flag} must be between ${min} and ${max} (got "${value}")`,
		);
	}
	return parsed;
}

export async function runCapture(flags: Flags): Promise<number> {
	const target = parseTarget(flags.target);
	const out = flags.out ?? "traffic.jsonl";
	const session = await startCapture({
		target,
		port: parseNumber(flags.port, "--port", 0, 65535),
		out,
		sampleRate: parseNumber(flags.sample, "--sample", 0.0001, 1),
		callerHeader: flags.callerHeader,
	});
	process.stdout.write(
		`Oath capture  http://127.0.0.1:${session.port} → ${target.origin}\nRecording response shapes to ${out}. Press Ctrl+C to stop.\n`,
	);
	return new Promise((resolve) => {
		const stop = async (): Promise<void> => {
			await session.stop();
			process.stdout.write(
				`\nCaptured ${session.recorded()} JSON responses → ${out}\n`,
			);
			resolve(0);
		};
		process.once("SIGINT", stop);
		process.once("SIGTERM", stop);
	});
}
