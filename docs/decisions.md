# Decisions

## TypeScript for v0.1, not Rust

Started in Rust, switched on 2026-11-11 to ship faster. v0.1 is file replay only, so speed does not matter yet. Revisit Rust (or Go) when the `oath capture` proxy needs low overhead.

## Zero runtime dependencies

`node:util` parseArgs covers the CLI, `node:test` covers tests. Fewer deps means `npx oath-cli` starts fast and installs nothing.

## npm name `oath-cli`, binary `oath`

`oath` is taken on npm.

## Exit code 1 means breaking changes, not any difference

The Notion CLI spec says "1 = differences found". Failing CI on a new field would make people turn the check off, so only breaking changes exit 1.

## Unobserved endpoints and statuses are never breaking

Test or staging traffic rarely covers every endpoint. Missing traffic is reported as "not observed", not as a removal.

## No timestamp in contracts

Same captures must produce byte-identical contracts (SRS NFR-8), so contracts are diffable in git.

## Children of a removed or added field are collapsed

Removing `customer` reports one change, not one per nested field.

## No values stored

Contracts hold paths, types, presence and counts only. Enum detection (SRS FR-10) is skipped because it would store real values.

## Capture writes shapes, not values (v0.2)

`oath capture` replaces strings with `""`, numbers with `0`, booleans with `false`. Contracts only need types and presence, so real values never touch disk. This keeps the "no payloads" promise from the technical design.

## Callers come from one header

`--caller-header` (default `user-agent`, cut to the product token like `partner-sdk/2.1`). Teams with a client-id header get exact callers; everyone else gets something useful with zero setup. Up to 50 callers are stored per field.

## Spec mode labels

`oath spec` reuses the diff engine. "Breaking" there means "violates the spec" (wrong type, required field missing, unexpected null) and exits 1. Undocumented and never-observed items are info only.

## No YAML parser

Specs must be JSON to keep zero runtime dependencies. The error message tells users to convert with `npx js-yaml`. Add a YAML dependency only if users ask.

## Learned path templates

A path position becomes a parameter when it has 10+ distinct values, at least half the hits are distinct, and 80%+ of values contain a digit (or there are 50+ distinct values). The digit rule stops `/v1/users`, `/v1/orders`, … from collapsing into `/v1/{id}` on small traffic.

## GitHub Action is composite and uses npx

No bundled JS to maintain. One PR comment is found by the `<!-- oath-diff -->` marker and updated in place. Commenting is `continue-on-error` so fork PRs without write tokens still get the check.
