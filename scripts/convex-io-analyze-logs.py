"""Summarize captured Convex function logs: per-function executions, cached share,
DB read/write bytes, p50/p95 execution time; plus sync activity and errors."""
import json, sys, statistics, collections
from datetime import datetime, timezone
path = sys.argv[1] if len(sys.argv) > 1 else "dev-logs.jsonl"
since = float(sys.argv[2]) if len(sys.argv) > 2 else 0
seen = set(); rows = []
for line in open(path):
    try: e = json.loads(line)
    except json.JSONDecodeError: continue
    if e.get("kind") != "Completion" or e["executionId"] in seen or e["timestamp"] < since: continue
    seen.add(e["executionId"]); rows.append(e)
def pct(xs, p):
    xs = sorted(xs); return xs[min(len(xs)-1, int(round(p*(len(xs)-1))))] if xs else 0
by = collections.defaultdict(list)
for e in rows: by[e["identifier"]].append(e)
print(f"window {datetime.fromtimestamp(min(r['timestamp'] for r in rows), timezone.utc):%F %T}Z .. {datetime.fromtimestamp(max(r['timestamp'] for r in rows), timezone.utc):%F %T}Z  executions {len(rows)}")
print(f"{'function':38} {'n':>6} {'cached':>6} {'readMB':>8} {'writeMB':>8} {'p50ms':>7} {'p95ms':>7} {'err':>4}")
tot_r = tot_w = 0
for name, es in sorted(by.items(), key=lambda kv: -sum(x['usageStats']['databaseReadBytes'] for x in kv[1])):
    r = sum(x["usageStats"]["databaseReadBytes"] for x in es); w = sum(x["usageStats"]["databaseWriteBytes"] for x in es)
    tot_r += r; tot_w += w
    live = [x for x in es if not x.get("cachedResult")]
    times = [x["executionTime"]*1000 for x in live] or [0]
    errs = sum(1 for x in es if x.get("error"))
    print(f"{name:38} {len(es):6} {len(es)-len(live):6} {r/1e6:8.3f} {w/1e6:8.3f} {pct(times,.5):7.1f} {pct(times,.95):7.1f} {errs:4}")
print(f"{'TOTAL':38} {len(rows):6} {'':6} {tot_r/1e6:8.3f} {tot_w/1e6:8.3f}")
errs = [(e["identifier"], str(e.get("error"))[:160]) for e in rows if e.get("error")]
print("errors:", len(errs)); [print("  ", x) for x in errs[:20]]
syncs = [e for e in rows if e["identifier"] in ("sync:fullSyncUser","sync:dispatchFullSync")]
for e in syncs: print(f"sync {e['identifier']} at {datetime.fromtimestamp(e['timestamp'], timezone.utc):%F %T}Z {e['executionTime']:.0f}s")
