# Project State Checkpoint — 2026-05-30

## Snapshot

- **Repo:** `CODE/Mobiel/exports/sound-materialize-faust-webapp-20260227-r7`
- **Branch:** `main`
- **HEAD:** `871ff6b` (`ui: integrate preset knob toggles into stock and user tabs`)
- **Working tree:** clean
- **Backup:** `backups/unimcom-871ff6b-20260530.tar.gz` (5.5 MB)

## Shipped since last checkpoint (14218d2 → 871ff6b)

| Commit | Message | Scope |
|--------|---------|-------|
| `2a2f670` | `perf: optimize startup caching and runtime responsiveness` | SW precache, RAF resize throttle, idle glyph mount, `.htaccess` compression |
| `3edd702` | `ui: expand stock preset lane by default` | `stockQuickPresetsExpanded=true` |
| `19781b3` | `ui: use ↻ glyph for preset knob toggles` | Toggle button glyphs |
| `79539e7` | `fix: exclude global gain from randomize` | `isGainControl` filter in Randomize |
| `f53f658` | `ui: set default global morph time to 2.10s` | `DEFAULT_GLOBAL_MORPH_DURATION_MS=2100` |
| `153ff60` | `ui: add DRK RM theme and default gain max` | New `drk-rm` theme + gain default to `-3` dB (max) |
| `b9ec9cd` | `ui: match preset strip height to top bar` | Unified `--hud-mode-button-row-height` → `--hud-control-row-height` |
| `871ff6b` | `ui: integrate preset knob toggles into stock and user tabs` | Dual-action tabs (label + embedded ↻), removed standalone toggles |

## Performance (measured and shipped)

- Service-worker precache: **2,054,617 B → 890,334 B** (−56.67%)
- Optional Three.js deferred to idle
- Resize path RAF-throttled
- `.htaccess` compression for JSON/WASM/text types

## Functional behavior (current live state)

- **Gain default:** −3 dB (max); excluded from Randomize
- **M.TIME default:** 2.10S (2100 ms)
- **Stock preset lane:** expanded by default on load
- **DRK RM theme:** available in VIBE dropdown (black/red palette)
- **Preset strip height:** matches main top bar (unified CSS var)
- **Preset tabs:** dual-action (click label toggles quick-lane, click ↻ toggles knob lane); standalone toggles removed

## Live deployment status

- Root (`https://unimcom.materialize.fun/`) and `/test/` are in sync
- Regression check: PASS (parity + runtime contract, `apiVersion=1.2.2`)
- Cache-bust namespace: `20260530gainmax1` (across `index.html`, `index.js`, `service-worker.js`)

## What remains open / next-up

### In-progress UI task
- USER tab parity with STOCK tab (same dual-action label+↻ behavior)
- Hover states on preset tab label and ↻ zones (color change on hover, state-dependent)

### From prior checkpoint (still relevant)

1. **MIDI + live-input reliability pass**
   - Richer I/O diagnostics in `__agentAPI.state.get()` / `.full()`
   - Harden failure handling for toggle paths
   - Validate with browser checks

2. **Docs / automation improvements**
   - Automate deploy regression in CI
   - Consider edge-case presets for regression coverage
