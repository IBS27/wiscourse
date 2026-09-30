# Search matcher benchmark

The command palette ranks its loaded index synchronously when the query changes.
Word-boundary checks now visit term occurrences instead of every title character.
Exact/prefix matches, later word-match precedence, overlapping occurrences, fuzzy
fallback, scores, ordering and highlights retain their previous behavior.

Run the reusable comparison against a saved revision without switching branches:

```sh
git show 0969806fce230d83c5d2a1273ccfafd1fee43937:src/lib/search.ts > /tmp/search-baseline.ts
node scripts/search-benchmark.mjs /tmp/search-baseline.ts > /tmp/search-measurement.json
```

The script loads both implementations using the existing Vite dependency, checks
449 complete-result comparisons, and measures deterministic 500/2,000/5,000-entry
fixtures. Each query has 60 warmups and 120 alternating before/after samples of
five calls. Reported percentiles describe each sample's mean call time.

Two runs on Node 22.22.2 / V8 12.4, Ryzen 7 9700X, produced these median times
for 5,000 entries:

| Query | Before, ms | After, ms |
| --- | ---: | ---: |
| Empty query | 1.119 / 1.097 | 1.117 / 1.099 |
| `lecture` | 3.381 / 3.439 | 0.976 / 0.980 |
| `virtual memory` | 6.072 / 6.010 | 0.661 / 0.656 |
| `mwsv` | 4.013 / 4.102 | 0.622 / 0.638 |
| `zzzz` | 3.615 / 3.634 | 0.274 / 0.279 |

These are synthetic CPU measurements, not observed production index sizes or
browser latency. Small-index gains are fractions of a millisecond. The benchmark
starts no listener/backend and writes its temporary module cache outside the repo.
