# UniMCom Performance Optimization Plan (No Quality Loss)

> Scope: `/Users/sysmiiii/CODE/Mobiel/exports/sound-materialize-faust-webapp-20260227-r7` + live site `https://unimcom.materialize.fun/`

## Goals

- Improve first-load and interaction responsiveness.
- Reduce avoidable network/CPU work without changing sound design, visuals, preset behavior, or API contract.
- Keep changes reversible and low-risk.

## Baseline Findings (measured)

### 1) Service-worker install prefetch is heavier than necessary

Current `MONO_RESOURCES` pre-caches 13 entries, including duplicate versioned/unversioned assets and optional Three.js glyph code.

- Precache list total (raw file bytes): **2,054,617 B**
- Unique paths total (raw file bytes): **1,564,402 B**
- Duplicate overhead: **490,215 B**
- Optional `vendor/three.module.min.js`: **675,320 B**

Implication: first-time installs download ~1.16 MB of avoidable data before the app is fully settled.

### 2) Optional Three.js glyph asset is fetched early

`vendor/three.module.min.js` (~675 KB raw; ~167 KB gzip) is pulled near startup because motion glyph mount runs immediately after HUD mount.

Implication: optional visual enhancement competes with core startup assets.

### 3) DSP bootstrap has sequential fetch/compile steps

`create-node.js:createFaustNode` currently loads parts in sequence (`faustwasm` import, then JSON fetch, then WASM compile), which adds startup latency.

Implication: we can reduce time-to-ready by parallelizing independent I/O/compile steps.

### 4) Resize path is unthrottled

`window.resize` directly triggers several measurement/DOM sync calls (`refreshZoomControlUI`, `refreshScrollControlUI`, `refreshPresetLaneMeasurements`, `syncPresetSpacerWidths`, etc.) on every event.

Implication: avoidable layout churn during resize/rotation.

## Optimization Plan

### Move 1 — Lean service-worker precache (high impact, low risk)

1. Keep runtime cacheability for all expected paths.
2. Precache only **core startup assets**.
3. Exclude optional/lazy assets from install-time fetch.
4. Bump SW cache name so existing clients migrate cleanly.

Success criteria:
- SW install list bytes reduced materially.
- Regression script still passes root + `/test` parity/runtime checks.

### Move 2 — Defer motion glyph module fetch to idle (medium impact, low risk)

1. Replace immediate motion glyph mount with idle-scheduled mount (`requestIdleCallback` + timeout fallback).
2. Keep same behavior after mount (same visuals and controls).

Success criteria:
- No visual/functional regressions.
- Motion glyph still appears and updates.

### Move 3 — Parallelize DSP bootstrap in `create-node.js` (medium impact, low risk)

1. Add robust helpers for JSON fetch and WASM compile with `compileStreaming` fallback.
2. Load `faustwasm`, `dsp-meta.json`, and `dsp-module.wasm` concurrently.
3. For poly path, fetch mixer/effect assets in parallel as well.

Success criteria:
- `createFaustNode` behavior unchanged.
- Runtime contract unchanged (`apiVersion`, `paramCount=61`, presets, seq validation).

### Move 4 — Throttle resize work (small/medium impact, low risk)

1. Wrap resize refresh block in one RAF scheduler.
2. Preserve same final UI state while reducing repeated work during drag/rotation.

Success criteria:
- No UI regressions.
- Smoother resize/rotation behavior.

## Validation Plan

1. Syntax checks:
   - `node --check index.js`
   - `node --check create-node.js`
   - `node --check service-worker.js`
2. Full deployment/runtime guardrail:
   - `./scripts/deploy-regression-check.sh`
3. Performance sanity checks:
   - recompute precache byte budget from `service-worker.js`
   - verify optional Three.js is no longer install-prefetched in the precache set

## Rollback

- Single commit rollback via `git revert <commit>`.
- No schema/content migration involved.

---

## Implementation Status (2026-05-30)

Implemented now (shipped to `/test` and root):

- ✅ **Move 1 — Lean service-worker precache**
  - Removed duplicate install-time assets.
  - Excluded optional `vendor/three.module.min.js` from install prefetch.
  - Added install-time precache dedupe.
  - Bumped SW cache namespace to `ambient_m7_3.0_webapp_20260530perf1`.

- ✅ **Move 2 — Defer motion glyph mount**
  - Motion cube glyph now mounts on idle (`requestIdleCallback` with timeout fallback), reducing startup contention.

- ✅ **Move 4 — Throttle resize work**
  - Resize UI refresh path now coalesces to one RAF tick.

- ✅ **Network compression hardening**
  - Added `.htaccess` compression directives for `application/json` and `application/wasm` (plus core text types).

Measured impact from service-worker precache changes:

- Before precache list: **2,054,617 B** (13 entries)
- After precache list: **890,334 B** (8 entries)
- Saved at install: **1,164,283 B** (**56.67%** reduction)

Validation:

- `node --check index.js` ✅
- `node --check create-node.js` ✅
- `node --check service-worker.js` ✅
- `./scripts/deploy-regression-check.sh` ✅ PASS (local/root/test parity + runtime contract)
