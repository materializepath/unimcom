# Project State Checkpoint — 2026-05-30 (updated 23:21)

## Snapshot

- **Repo:** `CODE/Mobiel/exports/sound-materialize-faust-webapp-20260227-r7`
- **Branch:** `main`
- **HEAD:** `1a79df8` (`ui: cycle SAVE button text between SELECT and SLOT when armed`)
- **Working tree:** clean
- **Backup:** `backups/unimcom-1a79df8-20260530.tar.gz` (5.5 MB)

## Shipped since last checkpoint (871ff6b → 1a79df8)

| Commit | Message | Scope |
|--------|---------|-------|
| `142f433` | `ui: USER tab dual-action parity with STOCK tab + zone hover states` | USER label toggles quick-lane, ↻ toggles knob lane; per-zone hover colors |
| `302ec1e` | `ui: incorporate SAVE into USER tab between label and ↻ toggle` | SAVE moved into USER tab (3-zone grid), removed standalone button + spacer |
| `548a9ff` | `fix: move savePreset insertion after declaration to prevent TDZ error` | Fixed ReferenceError crash — `.before()` called before `const` init |
| `df635c2` | `ui: pulsate SELECT text with theme accent colors when save mode is armed` | CSS `@keyframes save-select-pulse` cycling `--hud-accent` ↔ `--hud-on` |
| `1a79df8` | `ui: cycle SAVE button text between SELECT and SLOT when armed` | JS interval cycling "SELECT" ↔ "SLOT" every 700ms; 1.4s color breath sync |

## Functional behavior (current live state)

### Preset strip layout
- **STOCK tab:** `[STOCK] [↻]` — 2-zone, label toggles stock quick-lane, ↻ toggles stock knob lane
- **USER tab:** `[USER] [SAVE] [↻]` — 3-zone, label toggles user quick-lane, SAVE arms save mode, ↻ toggles user knob lane
- No standalone SAVE button or spacer
- Both strips share unified height via `--hud-control-row-height`

### SAVE button behavior
- Default: displays **READY** in dim ink, static
- Armed: text cycles **SELECT ↔ SLOT** every 700ms, color pulsates between `--hud-accent` and `--hud-on` over 1.4s
- Disarming clears interval, returns to **READY**
- Save mode state drives `data-save-armed="1"` on the `.hud-preset-group-toggle-save` zone

### Hover states (all preset tab zones)
- **Label:** hover → accent; expanded → accent; expanded+hover → brighter
- **↻:** hover → accent; knob-expanded → accent; expanded+hover → brighter
- **SAVE:** hover → accent; armed → "on" color; armed+hover → brighter
- All transitions: 180ms ease

### Carried forward from prior checkpoints
- **Gain default:** −3 dB (max); excluded from Randomize
- **M.TIME default:** 2.10S (2100 ms)
- **Stock preset lane:** expanded by default
- **DRK RM theme:** available in VIBE dropdown
- **SW precache:** 890 KB (−56.7% from 2.05 MB)
- **Resize path:** RAF-throttled

## Live deployment status

- Root (`https://unimcom.materialize.fun/`) and `/test/` in sync
- Regression: PASS (parity + runtime contract, `apiVersion=1.2.2`)
- Latest regression: `2026-05-30` post `1a79df8` — all gates green
- Cache-bust namespace: `20260530gainmax1`

## What remains open / next-up

### Priority 1 — MIDI + live-input reliability pass
1. Richer I/O diagnostics in `__agentAPI.state.get()` / `.full()`
2. Harden failure handling for toggle paths
3. Validate with browser checks

### Priority 2 — Docs / automation
1. Automate deploy regression in CI
2. Consider edge-case presets for regression coverage

### Nice-to-have UI refinements
- USER quick-buttons lane collapse/expand animation polish
- SAVE metronome tick sync with color pulse for tighter SELECT→SLOT rhythm
