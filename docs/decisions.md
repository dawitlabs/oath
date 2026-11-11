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
