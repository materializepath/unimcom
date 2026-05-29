#!/usr/bin/env node
/*
 * UniMCom deploy regression check
 * - Verifies local/root/test SHA-256 parity for critical files
 * - Verifies runtime contract on root + /test via headless Chromium
 *
 * Usage:
 *   ./scripts/deploy-regression-check.sh
 *   node scripts/deploy-regression-check.cjs
 *
 * Optional env overrides:
 *   UNIMCOM_BASE_URL=https://unimcom.materialize.fun/
 *   UNIMCOM_EXPECT_MIN_API_VERSION=1.2.2
 *   UNIMCOM_EXPECT_PARAM_COUNT=61
 *   UNIMCOM_EXPECT_STOCK_PRESETS=7
 *   UNIMCOM_EXPECT_CANONICAL=https://unimcom.materialize.fun/
 *   UNIMCOM_PARITY_FILES=index.js,service-worker.js,index.html,AGENTS.md
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (error) {
  console.error('[FAIL] Missing Node module: playwright');
  console.error('       Run via ./scripts/deploy-regression-check.sh (it sets NODE_PATH for global Playwright installs).');
  process.exit(2);
}

const ROOT_DIR = path.resolve(__dirname, '..');
const BASE_URL = ensureTrailingSlash(process.env.UNIMCOM_BASE_URL || 'https://unimcom.materialize.fun/');
const TEST_URL = new URL('test/', BASE_URL).toString();

const EXPECT = {
  apiMinVersion: process.env.UNIMCOM_EXPECT_MIN_API_VERSION || '1.2.2',
  paramCount: Number(process.env.UNIMCOM_EXPECT_PARAM_COUNT || 61),
  stockPresets: Number(process.env.UNIMCOM_EXPECT_STOCK_PRESETS || 7),
  canonical: process.env.UNIMCOM_EXPECT_CANONICAL || 'https://unimcom.materialize.fun/',
};

const PARITY_FILES = (process.env.UNIMCOM_PARITY_FILES || 'index.js,service-worker.js,index.html,AGENTS.md')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const IGNORED_CONSOLE_ERROR_PATTERNS = [
  /frame-ancestors.*ignored when delivered via a <meta> element/i,
];

function ensureTrailingSlash(url) {
  return url.endsWith('/') ? url : `${url}/`;
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function compareVersions(a, b) {
  const aa = String(a).split('.').map((n) => Number.parseInt(n, 10) || 0);
  const bb = String(b).split('.').map((n) => Number.parseInt(n, 10) || 0);
  const len = Math.max(aa.length, bb.length);
  for (let i = 0; i < len; i += 1) {
    const av = aa[i] || 0;
    const bv = bb[i] || 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}

async function fetchBytes(url) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  const data = await response.arrayBuffer();
  return Buffer.from(data);
}

async function hashLocal(file) {
  const fullPath = path.join(ROOT_DIR, file);
  const data = await fs.readFile(fullPath);
  return sha256(data);
}

async function hashRemote(base, file) {
  const url = new URL(file, base).toString();
  const data = await fetchBytes(url);
  return sha256(data);
}

function boolPass(value) {
  return value ? 'PASS' : 'FAIL';
}

function printSection(title) {
  console.log(`\n=== ${title} ===`);
}

function summarizeFailures(failures) {
  if (!failures.length) {
    console.log('\n✅ Regression check PASSED');
    return;
  }
  console.log(`\n❌ Regression check FAILED (${failures.length} issue${failures.length === 1 ? '' : 's'})`);
  failures.forEach((f, i) => {
    console.log(`  ${i + 1}. ${f}`);
  });
}

async function checkParity() {
  const failures = [];
  printSection('FILE PARITY (local vs root vs /test)');

  for (const file of PARITY_FILES) {
    try {
      const [localHash, rootHash, testHash] = await Promise.all([
        hashLocal(file),
        hashRemote(BASE_URL, file),
        hashRemote(TEST_URL, file),
      ]);

      const ok = localHash === rootHash && rootHash === testHash;
      console.log(`- ${file}: ${boolPass(ok)}`);
      console.log(`    local ${localHash}`);
      console.log(`    root  ${rootHash}`);
      console.log(`    test  ${testHash}`);

      if (!ok) {
        failures.push(`File hash mismatch for ${file}`);
      }
    } catch (error) {
      console.log(`- ${file}: FAIL`);
      console.log(`    error ${error.message}`);
      failures.push(`File parity check failed for ${file}: ${error.message}`);
    }
  }

  return failures;
}

async function checkRuntimeScope(browser, label, url) {
  const page = await browser.newPage();
  const pageErrors = [];
  const consoleErrors = [];

  page.on('pageerror', (err) => pageErrors.push(String(err?.message || err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      const ignored = IGNORED_CONSOLE_ERROR_PATTERNS.some((re) => re.test(text));
      if (!ignored) {
        consoleErrors.push(text);
      }
    }
  });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => Boolean(window.__agentAPI?.state?.get), null, { timeout: 30000 });
  await page.waitForFunction(() => {
    const st = window.__agentAPI?.state?.get?.();
    return Boolean(st && st.faustReady && Number(st.paramCount) > 0);
  }, null, { timeout: 45000 });

  const result = await page.evaluate(() => {
    const A = window.__agentAPI;
    const csp = document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') || '';
    const bad = '/ambient_m7_3.0/not_real_param';

    A.seq.open();
    const seqBadRet = A.seq.link(bad);
    const st = A.seq.getState();
    const linkedParams = Array.isArray(st?.linkedParams) ? st.linkedParams : [];
    const seqBadLinked = linkedParams.includes(bad);
    if (seqBadLinked) A.seq.unlink(bad);

    const state = A.state.get();

    return {
      apiVersion: A._version,
      paramCount: state?.paramCount,
      stockPresets: state?.stockPresets,
      hasUnsafeEval: csp.includes("'unsafe-eval'"),
      hasWasmUnsafeEval: csp.includes("'wasm-unsafe-eval'"),
      seqBadRet: Boolean(seqBadRet),
      seqBadLinked,
      canonical: document.querySelector('link[rel="canonical"]')?.href || null,
      ogUrl: document.querySelector('meta[property="og:url"]')?.content || null,
      jsErrors: Array.isArray(window.__jsErrors) ? window.__jsErrors.slice() : [],
    };
  });

  await page.close();

  const checks = {
    apiMinVersion: compareVersions(result.apiVersion, EXPECT.apiMinVersion) >= 0,
    paramCount: result.paramCount === EXPECT.paramCount,
    stockPresets: result.stockPresets === EXPECT.stockPresets,
    hasUnsafeEvalFalse: result.hasUnsafeEval === false,
    hasWasmUnsafeEvalTrue: result.hasWasmUnsafeEval === true,
    seqBadRetFalse: result.seqBadRet === false,
    seqBadLinkedFalse: result.seqBadLinked === false,
    canonicalMatch: result.canonical === EXPECT.canonical,
    ogUrlMatch: result.ogUrl === EXPECT.canonical,
    jsErrorsEmpty: Array.isArray(result.jsErrors) && result.jsErrors.length === 0,
    pageErrorsEmpty: pageErrors.length === 0,
    consoleErrorsEmpty: consoleErrors.length === 0,
  };

  printSection(`RUNTIME CONTRACT (${label})`);
  console.log(`- URL: ${url}`);
  console.log(`- apiVersion=${result.apiVersion} (min ${EXPECT.apiMinVersion}) -> ${boolPass(checks.apiMinVersion)}`);
  console.log(`- paramCount=${result.paramCount} (expected ${EXPECT.paramCount}) -> ${boolPass(checks.paramCount)}`);
  console.log(`- stockPresets=${result.stockPresets} (expected ${EXPECT.stockPresets}) -> ${boolPass(checks.stockPresets)}`);
  console.log(`- hasUnsafeEval=${result.hasUnsafeEval} (expected false) -> ${boolPass(checks.hasUnsafeEvalFalse)}`);
  console.log(`- hasWasmUnsafeEval=${result.hasWasmUnsafeEval} (expected true) -> ${boolPass(checks.hasWasmUnsafeEvalTrue)}`);
  console.log(`- seqBadRet=${result.seqBadRet} (expected false) -> ${boolPass(checks.seqBadRetFalse)}`);
  console.log(`- seqBadLinked=${result.seqBadLinked} (expected false) -> ${boolPass(checks.seqBadLinkedFalse)}`);
  console.log(`- canonical=${result.canonical} -> ${boolPass(checks.canonicalMatch)}`);
  console.log(`- ogUrl=${result.ogUrl} -> ${boolPass(checks.ogUrlMatch)}`);
  console.log(`- window.__jsErrors count=${result.jsErrors.length} -> ${boolPass(checks.jsErrorsEmpty)}`);
  console.log(`- pageerror count=${pageErrors.length} -> ${boolPass(checks.pageErrorsEmpty)}`);
  console.log(`- console error count=${consoleErrors.length} -> ${boolPass(checks.consoleErrorsEmpty)}`);

  const failures = [];
  Object.entries(checks).forEach(([key, ok]) => {
    if (!ok) {
      failures.push(`${label}: ${key} failed`);
    }
  });

  return {
    failures,
    details: {
      label,
      url,
      result,
      pageErrors,
      consoleErrors,
      checks,
    },
  };
}

async function checkRuntime() {
  const browser = await chromium.launch({ headless: true });
  try {
    const scopes = [
      { label: 'root', url: BASE_URL },
      { label: 'test', url: TEST_URL },
    ];

    const failures = [];
    const details = [];

    for (const scope of scopes) {
      const out = await checkRuntimeScope(browser, scope.label, scope.url);
      failures.push(...out.failures);
      details.push(out.details);
    }

    return { failures, details };
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log('UniMCom deploy regression check');
  console.log(`- repo: ${ROOT_DIR}`);
  console.log(`- base: ${BASE_URL}`);
  console.log(`- test: ${TEST_URL}`);

  const failures = [];

  failures.push(...(await checkParity()));

  let runtime;
  try {
    runtime = await checkRuntime();
    failures.push(...runtime.failures);
  } catch (error) {
    failures.push(`Runtime checks failed to execute: ${error.message}`);
  }

  summarizeFailures(failures);

  const report = {
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    testUrl: TEST_URL,
    expect: EXPECT,
    parityFiles: PARITY_FILES,
    failures,
    ok: failures.length === 0,
    runtime: runtime?.details || null,
  };

  const reportPath = path.join(ROOT_DIR, '.last-deploy-regression-report.json');
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`- report: ${reportPath}`);

  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
