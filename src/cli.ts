#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import {
	type Flags,
	runCapture,
	runCheck,
	runContract,
	runDiff,
	runSpec,
	UsageError,
} from "./commands.ts";
import { DEFAULT_CALLER_HEADER } from "./traffic.ts";

const HELP = `oath — the contract your traffic already wrote

Usage
  oath capture --target <url> [--port 8787] [--out traffic.jsonl] [--sample 1]
  oath contract <traffic...> [--out oath.contract.json] [--service name] [--pretty]
  oath diff <baseline.json> <current.json> [filters] [output]
  oath check --contract <baseline.json> <traffic...> [filters] [output] [--verbose]
  oath spec <openapi.json> <contract.json | traffic...> [filters] [output]

Traffic files
  .har    browser or proxy export (JSON responses only)
  .jsonl  one {"method","path"|"url","status","body","caller"?} object per line

Callers
  --caller-header <name>        header that identifies the caller (default user-agent)

Filters
  --only-breaking               hide non-breaking changes
  --min-confidence <level>      high | medium | low (default low)
  --ignore <field>              ignore a field and its children (repeatable)

Output
  --json                        machine-readable changes
  --markdown                    GitHub-flavored markdown for PR comments

Exit codes
  0 no breaking changes · 1 breaking changes or spec violations · 2 error`;

function parse(argv: string[]) {
	return parseArgs({
		args: argv,
		allowPositionals: true,
		options: {
			out: { type: "string" },
			service: { type: "string" },
			pretty: { type: "boolean", default: false },
			contract: { type: "string" },
			json: { type: "boolean", default: false },
			markdown: { type: "boolean", default: false },
			verbose: { type: "boolean", default: false },
			"only-breaking": { type: "boolean", default: false },
			"min-confidence": { type: "string", default: "low" },
			ignore: { type: "string", multiple: true, default: [] },
			"caller-header": { type: "string", default: DEFAULT_CALLER_HEADER },
			target: { type: "string" },
			port: { type: "string", default: "8787" },
			sample: { type: "string", default: "1" },
			help: { type: "boolean", short: "h", default: false },
			version: { type: "boolean", short: "v", default: false },
		},
	});
}

function toFlags(values: ReturnType<typeof parse>["values"]): Flags {
	return {
		out: values.out,
		service: values.service,
		pretty: values.pretty,
		contract: values.contract,
		json: values.json,
		markdown: values.markdown,
		verbose: values.verbose,
		onlyBreaking: values["only-breaking"],
		minConfidence: values["min-confidence"],
		ignore: values.ignore,
		callerHeader: values["caller-header"],
		target: values.target,
		port: values.port,
		sample: values.sample,
	};
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
	const flags = toFlags(values);
	if (command === "capture") return runCapture(flags);
	if (command === "contract") return runContract(files, flags);
	if (command === "diff") return runDiff(files, flags);
	if (command === "check") return runCheck(files, flags);
	if (command === "spec") return runSpec(files, flags);
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
