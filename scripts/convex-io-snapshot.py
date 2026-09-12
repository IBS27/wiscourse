"""Read-only deployment inventory. Records sizes/counts, never source content.

Run from a configured checkout. No push, env changes, billing changes, or writes.
"""
import argparse
import hashlib
import json
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--deployment", choices=["dev", "prod"], required=True)
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
cli = ["bun", "node_modules/convex/bin/main.js"]
selection = ["--prod"] if args.deployment == "prod" else []


def run(command):
    # A regular file avoids truncating large CLI output when Bun exits before
    # flushing stdout to a pipe.
    with tempfile.TemporaryFile(mode="w+") as output:
        subprocess.run(cli + command + selection, stdout=output, stderr=subprocess.PIPE, text=True, check=True)
        output.seek(0)
        return json.load(output)


spec = run(["function-spec"])
report = {
    "capturedAt": datetime.now(timezone.utc).isoformat(),
    "deployment": args.deployment,
    "url": spec["url"],
    "functionSpecSha256": hashlib.sha256(json.dumps(spec, sort_keys=True).encode()).hexdigest(),
    "functionCount": len(spec["functions"]),
    "note": "Function-spec hash identifies the API contract, not a deployed git revision. Sizes are UTF-8 JSON bytes, not billed I/O.",
    "usage": run(["deployment", "usage", "--json"]),
    "tables": {},
}
course_numbers = {}
for table, large_fields in {
    "courses": ["syllabusBody"],
    "assignments": ["description", "submission.comments"],
    "discussions": ["message"],
    "quizzes": ["description"],
}.items():
    sizes = []
    bodies = []
    cursor = None
    shapes = []
    for _ in range(1000):
        code = """
const batch = await ctx.db.query(TABLE).paginate({cursor: CURSOR, numItems: 100, maximumBytesRead: 524288});
const bytes = value => new TextEncoder().encode(JSON.stringify(value ?? null)).byteLength;
return {cursor: batch.continueCursor, done: batch.isDone,
  sizes: batch.page.map(row => bytes(row)),
  shapes: batch.page.map(row => ({ course: row.courseCanvasId ?? row.canvasId,
    active: (row.enrollmentState ?? 'active') === 'active',
    bodyChars: (row.description ?? row.message ?? row.syllabusBody ?? '').length,
    commentChars: (row.submission?.comments ?? []).reduce((sum, c) => sum + c.comment.length, 0),
    dueOffset: row.dueAt === undefined ? null : row.dueAt - Date.now(),
    createdOffset: row.canvasCreatedAt === undefined ? null : row.canvasCreatedAt - Date.now(),
    postedOffset: (row.submission?.postedAt ?? row.postedAt) === undefined ? null : (row.submission?.postedAt ?? row.postedAt) - Date.now(),
    announcement: row.isAnnouncement === true,
    linked: row.assignmentCanvasId !== undefined })),
  bodies: batch.page.map(row => FIELDS.reduce((sum, path) =>
    sum + bytes(path.split('.').reduce((obj, key) => obj?.[key], row)), 0))};
""".replace("TABLE", json.dumps(table)).replace("CURSOR", json.dumps(cursor)).replace("FIELDS", json.dumps(large_fields))
        batch = run(["run", "--inline-query", code, "--codegen", "disable"])
        sizes.extend(batch["sizes"])
        bodies.extend(batch["bodies"])
        for shape in batch["shapes"]:
            original_course = shape["course"]
            if original_course not in course_numbers:
                course_numbers[original_course] = len(course_numbers) + 1
            shape["course"] = course_numbers[original_course]
            shapes.append(shape)
        if batch["done"]:
            break
        cursor = batch["cursor"]
    else:
        raise RuntimeError("Inventory exceeded 1000 batches")
    sizes.sort()
    report["tables"][table] = {
        "count": len(sizes), "jsonBytes": sum(sizes), "largeFieldJsonBytes": sum(bodies),
        "medianJsonBytes": sizes[len(sizes) // 2] if sizes else 0,
        "maxJsonBytes": max(sizes, default=0),
        "syntheticShapes": shapes,
    }
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({"deployment": args.deployment, "tables": {
    table: {key: value for key, value in stats.items() if key != "syntheticShapes"}
    for table, stats in report["tables"].items()
}}, indent=2))
