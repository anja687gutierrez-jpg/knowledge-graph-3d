#!/usr/bin/env node
/**
 * parse-graph.js — Reads ~/.claude/knowledge/*.md → graph-data.json
 * No dependencies beyond Node.js built-ins.
 */

const fs = require('fs');
const path = require('path');

const KNOWLEDGE_DIR = path.join(process.env.HOME, '.claude', 'knowledge');
const OUTPUT_FILE = path.join(__dirname, 'graph-data.json');

// Recursively find all .md files
function findMarkdownFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findMarkdownFiles(fullPath));
    } else if (entry.name.endsWith('.md')) {
      results.push(fullPath);
    }
  }
  return results;
}

// Parse YAML-ish frontmatter via regex (no yaml lib)
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const fm = {};
  for (const line of match[1].split('\n')) {
    const m = line.match(/^(\w[\w-]*):\s*"?(.+?)"?\s*$/);
    if (m) fm[m[1]] = m[2];
  }
  return fm;
}

// Extract wikilinks, skipping code blocks and inline backticks
function extractWikilinks(content) {
  // Remove code blocks
  let cleaned = content.replace(/```[\s\S]*?```/g, '');
  // Remove inline code
  cleaned = cleaned.replace(/`[^`]+`/g, '');
  const links = [];
  const re = /\[\[([^\]]+)\]\]/g;
  let m;
  while ((m = re.exec(cleaned)) !== null) {
    links.push(m[1].trim());
  }
  return links;
}

// Derive node ID from file path (relative to knowledge dir, no extension)
function fileToId(filePath) {
  return path.relative(KNOWLEDGE_DIR, filePath).replace(/\.md$/, '');
}

// Humanize an ID to a display name
function humanize(id) {
  const base = id.split('/').pop();
  return base
    .replace(/^_/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/^Moc /, 'MOC: ')
    .replace(/^Adr /, 'ADR: ')
    .replace(/^Rb /, 'Runbook: ');
}

// Determine node type
function nodeType(id, fm) {
  if (id === '_index') return 'hub';
  if (id.includes('_moc-')) return 'moc';
  if (id === '_resolve' || id === 'dependencies') return 'meta';
  return 'leaf';
}

// Resolve a wikilink target to a node ID
function resolveLink(linkText, nodeIndex) {
  // Cross-layer links: rule:X, skill:X, memory:X
  const crossMatch = linkText.match(/^(rule|skill|memory):(.+)$/);
  if (crossMatch) {
    return `external/${crossMatch[1]}:${crossMatch[2]}`;
  }
  // Direct match by ID basename
  const candidates = Object.keys(nodeIndex);
  // Exact match on basename
  const exact = candidates.find(id => id.split('/').pop() === linkText);
  if (exact) return exact;
  // Partial match
  const partial = candidates.find(id => id.endsWith('/' + linkText) || id === linkText);
  if (partial) return partial;
  return null;
}

// --- Main ---
const files = findMarkdownFiles(KNOWLEDGE_DIR);
console.log(`Found ${files.length} markdown files`);

// Build node index
const nodeIndex = {}; // id → { id, name, domain, type, description, outLinks: [] }
for (const file of files) {
  const content = fs.readFileSync(file, 'utf-8');
  const fm = parseFrontmatter(content);
  const id = fileToId(file);
  const type = nodeType(id, fm);

  // Infer domain from frontmatter or path
  let domain = fm.domain || null;
  if (!domain) {
    const parts = id.split('/');
    if (parts.length > 1) {
      // e.g., projects/chrono/chrono-overview → projects
      domain = parts[0];
    } else {
      domain = 'meta';
    }
  }

  nodeIndex[id] = {
    id,
    name: humanize(id),
    domain,
    type,
    description: fm.description || '',
    created: fm.created || null,
    source: fm.source || null,
    status: fm.status || null,
    priority: fm.priority || null,
    outLinks: extractWikilinks(content),
    inDegree: 0,
    outDegree: 0,
  };
}

// Resolve links and build edges
const links = [];
const linkSet = new Set();
const phantomNodes = {};

for (const node of Object.values(nodeIndex)) {
  for (const rawLink of node.outLinks) {
    const targetId = resolveLink(rawLink, nodeIndex);
    if (!targetId) {
      // Phantom (broken link) — create dim placeholder
      const phantomId = `phantom/${rawLink}`;
      if (!phantomNodes[phantomId]) {
        phantomNodes[phantomId] = {
          id: phantomId,
          name: rawLink,
          domain: 'phantom',
          type: 'phantom',
          description: 'Unresolved link',
          created: null,
          source: null,
          status: null,
          priority: null,
          outLinks: [],
          inDegree: 0,
          outDegree: 0,
        };
      }
      const key = `${node.id}→${phantomId}`;
      if (!linkSet.has(key) && node.id !== phantomId) {
        linkSet.add(key);
        links.push({ source: node.id, target: phantomId });
        node.outDegree++;
        phantomNodes[phantomId].inDegree++;
      }
      continue;
    }

    // External cross-layer node
    if (targetId.startsWith('external/') && !nodeIndex[targetId]) {
      if (!phantomNodes[targetId]) {
        phantomNodes[targetId] = {
          id: targetId,
          name: rawLink,
          domain: 'external',
          type: 'external',
          description: `Cross-layer reference: ${rawLink}`,
          created: null,
          source: null,
          status: null,
          priority: null,
          outLinks: [],
          inDegree: 0,
          outDegree: 0,
        };
      }
      const key = `${node.id}→${targetId}`;
      if (!linkSet.has(key)) {
        linkSet.add(key);
        links.push({ source: node.id, target: targetId });
        node.outDegree++;
        phantomNodes[targetId].inDegree++;
      }
      continue;
    }

    // Normal internal link
    if (nodeIndex[targetId]) {
      const key = `${node.id}→${targetId}`;
      if (!linkSet.has(key) && node.id !== targetId) {
        linkSet.add(key);
        links.push({ source: node.id, target: targetId });
        node.outDegree++;
        nodeIndex[targetId].inDegree++;
      }
    }
  }
}

// Merge phantom/external nodes into final list
const allNodes = [
  ...Object.values(nodeIndex).map(({ outLinks, ...rest }) => rest),
  ...Object.values(phantomNodes).map(({ outLinks, ...rest }) => rest),
];

const domains = [...new Set(allNodes.map(n => n.domain))].sort();

const output = {
  metadata: {
    generated: new Date().toISOString(),
    sourceDir: KNOWLEDGE_DIR,
    nodeCount: allNodes.length,
    linkCount: links.length,
    domains,
  },
  nodes: allNodes,
  links,
};

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
console.log(`Written ${OUTPUT_FILE}`);
console.log(`  Nodes: ${allNodes.length} (${Object.keys(nodeIndex).length} real + ${Object.keys(phantomNodes).length} external/phantom)`);
console.log(`  Links: ${links.length}`);
console.log(`  Domains: ${domains.join(', ')}`);
