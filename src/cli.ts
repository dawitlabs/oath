#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { parseArgs } from "node:util";
import {
	buildContract,
	type Confidence,
	type Contract,
	parseContract,
} from "./contract.ts";
import { type Change, diffContracts, meetsConfidence } from "./diff.ts";
import { formatContract, formatDiff } from "./format.ts";
import { readTraffic, type Sample } from "./traffic.ts";

const HELP = `oath — the contract your traffic already wrote

Usage
  oath contract <traffic...> [--out oath.contract.json] [--service name] [--pretty]
  oath diff <baseline.json> <current.json> [filters] [--json]
  oath check --contract <baseline.json> <traffic...> [filters] [--json] [--verbose]

Traffic files
  .har    browser or proxy export (JSON responses only)
  .jsonl  one {"method","path"|"url","status","body"} object per line

Filters
  --only-breaking               hide non-breaking changes
  --min-confidence <level>      high | medium | low (default low)
  --ignore <field>              ignore a field and its children (repeatable)

Exit codes
  0 no breaking changes · 1 breaking changes found · 2 error`;

function parse(argv: string[]) {
	return parseArgs({
		args: argv,
		allowPositionals: true,
		options: {
			out: { type: "string", default: "oath.contract.json" },
			service: { type: "string" },
			pretty: { type: "boolean", default: false },
			contract: { type: "string" },
			json: { type: "boolean", default: false },
			verbose: { type: "boolean", default: false },
			"only-breaking": { type: "boolean", default: false },
			"min-confidence": { type: "string", default: "low" },
			ignore: { type: "string", multiple: true, default: [] },
			help: { type: "boolean", short: "h", default: false },
			version: { type: "boolean", short: "v", default: false },
		},
	});
}

type Values = ReturnType<typeof parse>["values"];

class UsageError extends Error {}

async function loadSamples(files: string[]): Promise<Sample[]> {
	if (files.length === 0) throw new UsageError("No traffic files given");
	const results = await Promise.all(files.map(readTraffic));
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

async function loadContract(file: string): Promise<Contract> {
	const text = await readFile(file, "utf8").catch(() => {
		throw new UsageError(`Cannot read ${file}`);
	});
	return parseContract(text, file);
}

function toConfidence(value: string): Confidence {
	if (value === "high" || value === "medium" || value === "low") return value;
	throw new UsageError(
		`--min-confidence must be high, medium, or low (got "${value}")`,
	);
}

function applyFilters(changes: Change[], values: Values): Change[] {
	const minimum = toConfidence(values["min-confidence"]);
	return changes.filter((change) => {
		if (values["only-breaking"] && !change.breaking) return false;
		if (!meetsConfidence(change.confidence, minimum)) return false;
		const field = change.field;
		if (!field) return true;
		return !values.ignore.some(
			(ignored) =>
				field === ignored ||
				field.startsWith(`${ignored}.`) ||
				field.startsWith(`${ignored}[]`),
		);
	});
}

function report(changes: Change[], title: string, values: Values): number {
	const output = values.json
		? JSON.stringify({ changes }, null, 2)
		: formatDiff(changes, title);
	process.stdout.write(`${output}\n`);
	return changes.some((change) => change.breaking) ? 1 : 0;
}

async function runContract(files: string[], values: Values): Promise<number> {
	const samples = await loadSamples(files);
	const service = values.service ?? basename(process.cwd());
	const contract = buildContract(samples, service);
	await writeFile(values.out, `${JSON.stringify(contract, null, 2)}\n`);
	if (values.pretty) process.stdout.write(`${formatContract(contract)}\n\n`);
	process.stdout.write(
		`Wrote ${values.out} — ${contract.endpoints.length} endpoints from ${samples.length} samples\n`,
	);
	return 0;
}

async function runDiff(files: string[], values: Values): Promise<number> {
	const [baseFile, currentFile] = files;
	if (!baseFile || !currentFile || files.length > 2) {
		throw new UsageError("diff needs exactly two contract files");
	}
	const [base, current] = await Promise.all([
		loadContract(baseFile),
		loadContract(currentFile),
	]);
	const changes = applyFilters(diffContracts(base, current), values);
	return report(changes, `${baseFile} → ${currentFile}`, values);
}

async function runCheck(files: string[], values: Values): Promise<number> {
	if (!values.contract)
		throw new UsageError("check needs --contract <baseline.json>");
	const [base, samples] = await Promise.all([
		loadContract(values.contract),
		loadSamples(files),
	]);
	const current = buildContract(samples, base.service);
	const changes = applyFilters(diffContracts(base, current), values);
	const hasBreaking = changes.some((change) => change.breaking);
	if (!hasBreaking && !values.verbose && !values.json) return 0;
	return report(changes, `${values.contract} → observed traffic`, values);
}

async function version(): Promise<string> {
	const text = await readFile(
		new URL("../package.json", import.meta.url),
		"utf8",
	);
	const pkg: unknown = JSON.parse(text);
	return typeof pkg === "object" && pkg !== null && "version" in pkg
		? String(pkg.version)
		: "unknown";
}

async function main(argv: string[]): Promise<number> {
	const { values, positionals } = parse(argv);
	const [command, ...files] = positionals;
	if (values.version) {
		process.stdout.write(`${await version()}\n`);
		return 0;
	}
	if (values.help || !command) {
		process.stdout.write(`${HELP}\n`);
		return values.help ? 0 : 2;
	}
	if (command === "contract") return runContract(files, values);
	if (command === "diff") return runDiff(files, values);
	if (command === "check") return runCheck(files, values);
	throw new UsageError(`Unknown command "${command}"`);
}

main(process.argv.slice(2)).then(
	(code) => {
		process.exitCode = code;
	},
	(error: unknown) => {
		const message = error instanceof Error ? error.message : String(error);
		const hint =
			error instanceof UsageError ? "\nRun oath --help for usage." : "";
		process.stderr.write(`oath: ${message}${hint}\n`);
		process.exitCode = 2;
	},
);
