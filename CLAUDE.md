# Oath

Open-source CLI that builds the real behavioral contract of an API from recorded traffic and flags breaking changes. Tagline: "The contract your traffic already wrote."

- **Customer:** backend engineers who own an API with callers outside their team.
- **Insight:** the written spec is not the contract; production traffic is (Hyrum's Law). Positioning angle: AI agents now write the changes.
- **Product source of truth:** Notion pages "Oath — Company & Product" and "Oath — Technical Design".

## Built (v0.1)

- `oath contract` (HAR + JSONL → `oath.contract.json`), `oath diff`, `oath check`
- Path templating, presence/type/nullability inference, confidence by sample count
- Filters: `--only-breaking`, `--min-confidence`, `--ignore`, `--json`

## Not built

- `oath capture` proxy, ordering/error-shape rules, hosted plane

## Stack

- TypeScript strict on Node, zero runtime dependencies, `node:util` parseArgs, `node:test`
- Source runs directly via Node type stripping; `tsc` builds `dist/` for npm
- Biome v2, pnpm

## Commands

- `pnpm test` · `pnpm typecheck` · `pnpm check` · `pnpm build`

See `docs/decisions.md` and `docs/gotchas.md`.
