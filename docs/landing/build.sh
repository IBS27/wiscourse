#!/usr/bin/env bash
# Assemble the five design fragments into one page.
set -euo pipefail
cd "$(dirname "$0")"
{ cat shell-head.html; for f in d1 d2 d3 d4 d5; do [ -f "$f.html" ] && cat "$f.html"; done; cat shell-foot.html; } > index.html
echo "wrote $(wc -c < index.html) bytes to index.html"
