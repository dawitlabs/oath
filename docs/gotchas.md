# Gotchas

- Imports use `.ts` extensions. `rewriteRelativeImportExtensions` turns them into `.js` in `dist/`. Do not switch to `.js` imports or source stops running under Node directly.
- `erasableSyntaxOnly` is on: no enums, namespaces, or parameter properties — Node type stripping cannot run them.
- Field paths: `a.b` for objects, `a[]` for array elements. Presence of `a[]` entries is always "always"; presence for keys is relative to how many objects were seen at the parent path.
- Confidence of a diff change is the lower of the baseline field's confidence and the current response's sample confidence.
- Path templating is a heuristic in `src/template.ts`. A static segment that is 8+ characters and contains a digit (e.g. `report2024`) will be templated as `{id}`.
- `examples/*.jsonl` are generated demo data with fake names; regenerate rather than hand-edit.
