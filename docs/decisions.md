# Decisions

## Rust for the CLI and collector
v0.1 is file replay only, but v0.2 adds a local proxy where overhead matters. Rust gives a single static binary and a fast proxy path later. Go was the alternative: faster to ship, weaker for the proxy.

## Dependencies
- `serde` + `serde_json`: the contract is JSON; std has no JSON support.
- No CLI parsing crate yet. `std::env::args` covers `oath contract` and `oath diff` until flags appear.

## Learning mode
Dawit writes the core logic. Tests in `tests/` define each step; the implementation is his.
