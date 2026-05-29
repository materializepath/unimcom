#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const META_PATH = path.join(ROOT, 'dsp-meta.json');
const OUT_PATH = path.join(ROOT, 'docs', 'faust-parameter-catalog.md');

function asMetaString(meta) {
  if (!Array.isArray(meta) || !meta.length) return '';
  return meta
    .flatMap((obj) => Object.entries(obj || {}).map(([k, v]) => `${k}:${v}`))
    .join(', ');
}

function walk(items, out = []) {
  for (const item of items || []) {
    if (Array.isArray(item?.items)) {
      walk(item.items, out);
    } else if (item && typeof item === 'object' && typeof item.address === 'string') {
      out.push(item);
    }
  }
  return out;
}

function fmt(value) {
  if (value === undefined || value === null || Number.isNaN(value)) return '';
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return String(value);
    return String(Number(value.toFixed(6)));
  }
  return String(value);
}

function main() {
  const raw = fs.readFileSync(META_PATH, 'utf8');
  const meta = JSON.parse(raw);
  const controls = walk(meta.ui).sort((a, b) => a.address.localeCompare(b.address));

  const byType = controls.reduce((acc, c) => {
    const key = c.type || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const lines = [];
  lines.push('# Faust Parameter Catalog (Active)');
  lines.push('');
  lines.push('- Status: **ACTIVE SOURCE OF TRUTH**');
  lines.push(`- Generated from: \`dsp-meta.json\``);
  lines.push(`- DSP: \`${meta.name || 'unknown'}\``);
  lines.push(`- Audio I/O: inputs=${meta.inputs ?? 'n/a'}, outputs=${meta.outputs ?? 'n/a'}`);
  lines.push(`- Total UI controls: **${controls.length}**`);
  lines.push('');
  lines.push('Control-type counts:');
  Object.keys(byType).sort().forEach((k) => {
    lines.push(`- \`${k}\`: ${byType[k]}`);
  });
  lines.push('');
  lines.push('## Parameters');
  lines.push('');
  lines.push('| Path | Label | Type | Min | Max | Step | Init | Meta |');
  lines.push('| --- | --- | --- | ---: | ---: | ---: | ---: | --- |');

  for (const c of controls) {
    lines.push(`| \`${c.address}\` | ${c.label || ''} | \`${c.type || ''}\` | ${fmt(c.min)} | ${fmt(c.max)} | ${fmt(c.step)} | ${fmt(c.init)} | ${asMetaString(c.meta)} |`);
  }

  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- This file is generated. Re-run: `node scripts/generate-faust-parameter-catalog.cjs`.');
  lines.push('- Runtime bridge contract remains documented in `AGENTS.md` and `docs/agent-control-system.md`.');

  fs.writeFileSync(OUT_PATH, `${lines.join('\n')}\n`, 'utf8');
  console.log(`Wrote ${OUT_PATH} (${controls.length} controls)`);
}

main();
