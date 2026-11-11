# Oath

**The contract your traffic already wrote.**

Your OpenAPI spec says what your API promises. Your production traffic shows what it actually does — and with enough callers, every observable behavior becomes something someone depends on ([Hyrum's Law](https://www.hyrumslaw.com/)). Oath reads recorded traffic, builds that real behavioral contract, and tells you which changes will break callers before you ship.

```
$ npx oath-cli check --contract baseline.contract.json current.jsonl

Oath diff — baseline.contract.json → observed traffic

GET /v1/invoices/{id} 200
  ~  amount         type number → string          high  [breaking]
  ~  customer.name  now nullable                  high  [breaking]
  -  legacy_id      presence sometimes → removed  high  [breaking]
  +  tax            new field (always)            high  [non-breaking]

POST /v1/invoices/send
  -    endpoint not observed in current traffic  medium  [non-breaking]

Summary: 6 breaking, 3 non-breaking
```

Real output from `examples/` (the `GET /v1/invoices` list block is trimmed).

No account. No network calls. No payloads stored — only shapes.

## Try it in 60 seconds

```sh
git clone https://github.com/dawitlabs/oath && cd oath/examples
npx oath-cli contract baseline.jsonl --service billing --out baseline.contract.json --pretty
npx oath-cli contract current.jsonl --service billing --out current.contract.json
npx oath-cli diff baseline.contract.json current.contract.json
```

## Use it on your API

**1. Record traffic** — any of these work:

- **Browser:** DevTools → Network → right-click → _Save all as HAR_.
- **Proxy:** `mitmdump --set hardump=traffic.har` in front of your service.
- **Your own logs:** write one JSON object per line: `{"method","path" or "url","status","body"}`.

**2. Build the baseline contract** from traffic you trust (production, or main):

```sh
npx oath-cli contract traffic.har --service billing
```

This writes `oath.contract.json`. Commit it.

**3. Check new traffic** against it — locally or in CI:

```sh
npx oath-cli check --contract oath.contract.json new-traffic.har
```

Silent and exit `0` when nothing breaks. Prints the diff and exits `1` when something does.

## Commands

| Command                                       | What it does                                                                     |
| --------------------------------------------- | -------------------------------------------------------------------------------- |
| `oath contract <traffic...>`                  | Build a contract from `.har` / `.jsonl` files. `--out`, `--service`, `--pretty`  |
| `oath diff <a.json> <b.json>`                 | Compare two contracts                                                            |
| `oath check --contract <a.json> <traffic...>` | Build from traffic and compare to a baseline. `--verbose` prints even when clean |

Filters for `diff` and `check`: `--only-breaking`, `--min-confidence high|medium|low`, `--ignore <field>` (repeatable), `--json`.

Exit codes: `0` no breaking changes · `1` breaking changes · `2` error.

## What counts as breaking

| Change                                         | Breaking                        |
| ---------------------------------------------- | ------------------------------- |
| Field removed                                  | yes                             |
| Presence `always` → `sometimes`                | yes                             |
| Field gains a new type (`number` → `string`)   | yes                             |
| Field becomes nullable                         | yes                             |
| New field, new endpoint, new status code       | no                              |
| Field narrows its types or stops being null    | no                              |
| Endpoint or status not seen in the new traffic | no — reported as _not observed_ |

Every finding carries a confidence level from sample counts: `high` (30+), `medium` (5+), `low`.

## In CI

```yaml
- name: Behavioral contract check
  run: npx oath-cli check --contract oath.contract.json test-traffic.jsonl --only-breaking
```

Record `test-traffic.jsonl` from your integration tests, then let the check fail the build.

## What Oath can and cannot see

Oath sees what your service **sends**. It cannot see which fields a client actually **reads**. A field that has been present in every response for months is treated as relied on, because under Hyrum's Law it usually is. Treat findings as "risky to change", not "proven to break".

## Privacy

Contracts store field paths, types, presence and counts. Never values. Traffic files stay on your machine.

## Roadmap

- Local capture proxy (`oath capture`)
- Stable-ordering and error-shape rules
- Hosted history: which callers saw which fields, and since when

## License

MIT
