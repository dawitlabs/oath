# Oath

Open-source CLI that builds the real behavioral contract of an API from recorded traffic and flags breaking changes. Tagline: "The contract your traffic already wrote."

- **Customer:** backend engineers who own an API with callers outside their team.
- **Insight:** the written spec is not the contract; production traffic is (Hyrum's Law). Positioning angle: AI agents now write the changes.
- **Product source of truth:** Notion pages "Oath — Company & Product" and "Oath — Technical Design".

## Built (v0.2)

- `oath capture` local proxy (shape-only JSONL), `oath contract` (HAR + JSONL), `oath diff`, `oath check`, `oath spec` (OpenAPI 3 JSON)
- Caller-aware contracts: each field lists callers from `--caller-header` (default user-agent)
- Path templating: ID regexes + learned high-cardinality segments
- Output: text, `--json`, `--markdown`; GitHub Action in `action.yml` posts PR comments
- Filters: `--only-breaking`, `--min-confidence`, `--ignore`

## Not built

- YAML OpenAPI, stable-ordering rules, hosted plane (history, who-depends-on-what across services)

## Stack

- TypeScript strict on Node, zero runtime dependencies, `node:util` parseArgs, `node:test`
- Source runs directly via Node type stripping; `tsc` builds `dist/` for npm
- Biome v2, pnpm

## Commands

- `pnpm test` · `pnpm typecheck` · `pnpm check` · `pnpm build`
- Release: bump `version`, `pnpm build`, Dawit runs `npm publish` (browser 2FA). The CI `action` job uses `oath-cli@latest`, so publish before merging features the action depends on.

See `docs/decisions.md` and `docs/gotchas.md`.
