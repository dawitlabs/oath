# Gotchas

- Imports use `.ts` extensions. `rewriteRelativeImportExtensions` turns them into `.js` in `dist/`. Do not switch to `.js` imports or source stops running under Node directly.
- `erasableSyntaxOnly` is on: no enums, namespaces, or parameter properties — Node type stripping cannot run them.
- Field paths: `a.b` for objects, `a[]` for array elements. Presence of `a[]` entries is always "always"; presence for keys is relative to how many objects were seen at the parent path.
- Confidence of a diff change is the lower of the baseline field's confidence and the current response's sample confidence.
- Path templating lives in `src/template.ts`: regexes first, then `learnTemplates` over all paths in a contract build. Templates depend on the whole traffic set, so the same path can template differently with more traffic.
- `examples/*.jsonl` are generated demo data with fake names; regenerate rather than hand-edit.
- `shapeOf` keeps object keys. APIs that key objects by user data (emails, IDs) leak those keys into captures and contracts.
- `oath spec` matches paths segment by segment; `{param}` in the spec matches any observed segment, exact segments win ties. The spec's first `servers[].url` path is prepended.
- `capture` strips `accept-encoding` so upstream responses come back uncompressed and parseable. Clients of the proxy get uncompressed responses too.
- The capture test binds two ephemeral ports on 127.0.0.1 for a few milliseconds.
