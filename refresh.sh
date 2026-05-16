#!/bin/bash
# Regenerate knowledge graph data, commit, and push.
# Cloudflare Pages auto-deploys on push (Git integration).
set -e

cd "$(dirname "$0")"

echo "Parsing knowledge graph..."
node parse-graph.js

# Check if data changed
if git diff --quiet graph-data.json 2>/dev/null; then
  echo "No changes detected."
  exit 0
fi

echo "Committing and pushing..."
git add graph-data.json
git commit -m "Update graph data ($(date '+%Y-%m-%d %H:%M'))"
git push

echo ""
echo "Pushed."
