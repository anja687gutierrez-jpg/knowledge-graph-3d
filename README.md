# Thought Graph

Interactive 3D visualization of a personal knowledge graph. Built to see how concepts connect across projects, patterns, decisions, and workflows.

![Thought Graph](https://img.shields.io/badge/nodes-105-blue) ![Thought Graph](https://img.shields.io/badge/links-343-green) ![Thought Graph](https://img.shields.io/badge/domains-7-purple)

## What it does

Parses a folder of markdown files with wikilinks (`[[concept-name]]`) into a force-directed 3D graph. Each file becomes a node. Each wikilink becomes an edge. You can orbit, zoom, click nodes to see details, and filter by domain.

## Domains

- **patterns** — cross-project engineering lessons (dirty-checking, cache integrity, persistence layers)
- **decisions** — architecture decision records (why Vite over Next.js, why Supabase over Firebase)
- **runbooks** — step-by-step deploy and recovery procedures
- **workflow** — how I work: plan mode, verification steps, self-improvement loops
- **projects** — per-project nodes with stack, status, open issues
- **external** — references to external tools, rules, and memory files

## How it works

```
~/.claude/knowledge/ (markdown + wikilinks)
        ↓
  parse-graph.js (extracts nodes + edges)
        ↓
  graph-data.json (serialized graph)
        ↓
  index.html (3d-force-graph renders it)
```

## Run locally

```bash
# Just open index.html — no build step needed
open index.html
```

Or serve it:

```bash
npx serve .
```

## Bring your own knowledge

Replace `graph-data.json` with your own graph data, or point `parse-graph.js` at your own markdown folder. The parser expects files with wikilinks (`[[node-name]]`) and optional YAML frontmatter.

## Stack

- [3d-force-graph](https://github.com/vasturiano/3d-force-graph) (Three.js)
- Vanilla JS, no build step

## License

MIT
