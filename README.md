# Oath

**The contract your traffic already wrote.**

Your OpenAPI spec says what your API promises. Your traffic shows what it actually does — and with enough callers, every observable behavior becomes something someone depends on ([Hyrum's Law](https://www.hyrumslaw.com/)). Oath records that real behavioral contract, tells you **which callers** rely on each field, and catches breaking changes before you ship.

```
$ npx oath-cli diff baseline.contract.json current.contract.json --only-breaking

Oath diff — baseline.contract.json → current.contract.json

GET /v1/invoices/{id} 200
  ~  amount         type number → string          high  [breaking]  seen by ios-app, partner-acme, web-dashboard
  ~  customer.name  now nullable                  high  [breaking]  seen by ios-app, partner-acme, web-dashboard
  -  legacy_id      presence sometimes → removed  high  [breaking]  seen by ios-app, partner-acme

Summary: 6 breaking changes, 0 non-breaking
```

Real output from [`examples/`](examples) (the list endpoint block is trimmed).

No account. No network calls. No values stored — only shapes.

## Try it in 60 seconds

```sh
git clone https://github.com/dawitlabs/oath && cd oath/examples
npx oath-cli contract baseline.jsonl --service billing --out baseline.contract.json --pretty
npx oath-cli check --contract baseline.contract.json current.jsonl
npx oath-cli spec openapi.json baseline.jsonl
```

## Use it on your API

**1. Record traffic.** Put Oath in front of your service and use it normally:

```sh
npx oath-cli capture --target http://localhost:3000 --caller-header x-client-id
# point your app, tests, or curl at http://127.0.0.1:8787 — Ctrl+C to stop
```

This writes `traffic.jsonl` with response **shapes** (`"email": ""`, `"amount": 0`), never real values.

Already have traffic? Oath also reads:

- **HAR** — DevTools → Network → _Save all as HAR_, or `mitmdump --set hardump=traffic.har`
- **JSONL** — one `{"method","path" or "url","status","body","caller"}` object per line from your own logs

**2. Build the baseline contract** from traffic you trust:

```sh
npx oath-cli contract traffic.jsonl --service billing
```

Commit the resulting `oath.contract.json`.

**3. Check new traffic** locally or in CI:

```sh
npx oath-cli check --contract oath.contract.json new-traffic.jsonl
```

Silent with exit `0` when nothing breaks. Prints the diff and exits `1` when something does.

## Know who depends on what

Every field in a contract records the callers that received it, read from a header you choose (`--caller-header`, default `user-agent`). When a change breaks a field, Oath tells you who to warn:

```
-  legacy_id  presence sometimes → removed  high  [breaking]  seen by ios-app, partner-acme
```

## Find where your spec lies

`oath spec` compares real traffic with your OpenAPI 3 document:

```
$ npx oath-cli spec openapi.json baseline.jsonl

GET /v1/invoices/{id} 200
  +  legacy_id  undocumented field (sometimes)  high  [info]  seen by ios-app, partner-acme
  -  due_date   documented, never observed      high  [info]

POST /v1/invoices/send
  +    undocumented endpoint  medium  [info]

Summary: 0 violations, 5 info
```

The list endpoint block is trimmed. Violations — wrong types, missing required fields, unexpected nulls — exit `1`. Undocumented fields are the accidental contract your spec never mentions. JSON specs only for now; convert YAML with `npx js-yaml openapi.yaml > openapi.json`.

## Pull request comments

```yaml
name: Behavioral contract
on: pull_request
permissions:
  contents: read
  pull-requests: write
jobs:
  oath:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm test -- --record traffic.jsonl # however your tests record traffic
      - uses: dawitlabs/oath@main
        with:
          contract: oath.contract.json
          traffic: traffic.jsonl
          args: --only-breaking
```

The action posts the diff as a single PR comment, updates it on every push, writes it to the job summary, and fails the job on breaking changes. Inputs: `contract`, `traffic`, `args`, `comment`, `fail-on-breaking`, `version`.

Anywhere else, `--markdown` prints the same comment body.

## Commands

| Command                                                  | What it does                                                                                   |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `oath capture --target <url>`                            | Local proxy that records response shapes. `--port`, `--out`, `--sample 0.1`, `--caller-header` |
| `oath contract <traffic...>`                             | Build a contract from `.jsonl` / `.har`. `--out`, `--service`, `--pretty`                      |
| `oath diff <a.json> <b.json>`                            | Compare two contracts                                                                          |
| `oath check --contract <a.json> <traffic...>`            | Build from traffic and compare to a baseline. `--verbose` prints even when clean               |
| `oath spec <openapi.json> <contract.json \| traffic...>` | Compare observed behavior with an OpenAPI 3 spec                                               |

Filters: `--only-breaking`, `--min-confidence high|medium|low`, `--ignore <field>` (repeatable). Output: `--json`, `--markdown`.

Exit codes: `0` clean · `1` breaking changes or spec violations · `2` error.

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

## Path templates

`/v1/invoices/in_8qgma999635914` becomes `/v1/invoices/{id}`. Oath recognizes numeric, UUID, hex and prefixed IDs, and learns the rest from traffic: a path position with many distinct values is treated as a parameter.

## What Oath can and cannot see

Oath sees what your service **sends** and **who it sends it to**. It cannot see which fields a client actually **reads**. A field that every caller has received for months is treated as relied on, because under Hyrum's Law it usually is. Read findings as "risky to change, and here is who to ask", not "proven to break".

## Privacy

`oath capture` writes shapes, not values. Contracts store field paths, types, presence, counts and caller names. Nothing leaves your machine. If your traffic uses data as object keys (for example a map keyed by email), those keys are kept as field names — use `--ignore` or capture shapes from test data.

## License

MIT
