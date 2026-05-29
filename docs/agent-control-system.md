# Agent Control System — Architecture & Reference

**DSP Version:** ambient_m7_3.0
**API Version:** 1.2.2
**Site:** https://unimcom.materialize.fun/
**Last Updated:** 2026-05-29

---

## Overview

The Unimcom web app is a buildless static Faust/Three.js synthesizer control surface. It has no backend, no API server, and no database. All processing happens in the browser via WebAudio, WebAssembly (Faust), and WebGL (Three.js).

To enable full agent control, a **three-layer architecture** was implemented:

| Layer | File | Location | Purpose |
|-------|------|----------|---------|
| 1 — JS Bridge | Injected at end of `index.js` | Browser global `window.__agentAPI` | Programmatic API for every knob, button, sequencer, preset, MIDI |
| 2 — AGENTS.md | `AGENTS.md` | `https://unimcom.materialize.fun/AGENTS.md` | Agent discovery — API reference, recipes, pitfalls |
| 3 — Hermes Skill | `SKILL.md` | `~/.hermes/skills/autonomous-ai-agents/unimcom-agent/` | Reusable agent workflow with pre-baked recipe flows |

---

## Active vs Archived Documentation

- Active docs map: `docs/README.md`
- Current DSP parameter source of truth: `docs/faust-parameter-catalog.md` (generated from `dsp-meta.json`)
- Archived historical docs: `docs/archive/` (legacy 57-control / `ambient_m7_2.0` references)

---

## Layer 1: `__agentAPI` — JavaScript Control Bridge

### Design

A single IIFE appended to the end of `index.js` that wraps every internal control surface into a clean programmatic interface. All methods are safe to call before the page is ready — they return `false` / `null` / `[]` if their dependency isn't initialized.

The bridge accesses these top-level globals directly (declared at module scope in `index.js`):

| Global | Type | Used By |
|--------|------|---------|
| `faustUIBridge` | Object | `params.set()`, `params.setBatch()` |
| `dspControls` | Array | `params.getAll()`, `params.info()`, preset save/load |
| `dspControlIndex` | Map | `params.info()` |
| `currentParamValueMap` | Map | `params.get()`, `params.getAll()`, state snapshot |
| `faustNode` | Object | `midi.send()` |
| `audioActivated` | Boolean | `audio.isActive()`, state |
| `audioContext` | AudioContext | state |
| `motionModeState` | Object | `controls.motion.isEnabled()` |
| `midiInputState` | Object | `controls.midi.*` |
| `liveInputState` | Object | `controls.liveInput.*` |
| `sequencer` | StepSequencer | `seq.*` |
| `userPresetSlots` | Array | `preset.listUser()`, `preset.save()`, `preset.del()` |
| `MODE_PRESETS` | Array | `preset.list()` |
| `runQuickPresetMorphExternal` | Function | `preset.apply()`, `preset.load()` |
| `globalControlState` | Object | `preset.morphTo()`, `preset.load()` |

Global functions used:
- `ensureAudioActivated()`, `deactivateAudioMIDISensors()`
- `activateMotionMode()`, `deactivateMotionMode()`
- `startMIDI()`, `stopMIDI()`
- `stopLiveAudioInput()`
- `getDSPControl(key)`, `normalizeAgentParamEntry(path, value)`
- `buildAgentPresetEntries(targets)`
- `morphToPresetValues(entries, durationMs)`
- `runQuickPresetMorphExternal(id, durationMs)`
- `persistUserPresetSlots(slots)`
- `getUserPresetSlot(slotId)`, `saveUserPresetSlot(slotId, values)`

DOM queries used (for UI button clicks):
- `#hud-audio-input-select`
- `.hud-control-btn-seq`
- `.hud-seq-btn[aria-label="Play sequencer"]`
- `.hud-seq-btn[aria-label="Stop sequencer"]`
- `.hud-control-btn-live-input`

### Complete API Reference

```
__agentAPI
├── audio
│   ├── activate()          → Promise<boolean>
│   ├── isActive()          → boolean
│   └── deactivate()        → Promise<boolean>
├── params
│   ├── set(path, value)    → boolean
│   ├── get(path)           → number | null
│   ├── getAll()            → object[]
│   ├── setBatch(entries)   → boolean
│   └── info(path)          → object | null
├── controls
│   ├── motion              → { isEnabled, enable, disable, toggle }
│   ├── midi                → { isEnabled, enable, disable, toggle }
│   └── liveInput           → { isEnabled, enable, disable, toggle }
├── seq
│   ├── isPlaying()         → boolean
│   ├── play()              → boolean
│   ├── stop()              → boolean
│   ├── setBPM(bpm)         → boolean
│   ├── getBPM()            → number
│   ├── setStepCount(n)     → boolean
│   ├── setDirection(dir)   → boolean
│   ├── link(path)          → boolean
│   ├── unlink(path)        → boolean
│   ├── setStep(path, idx, value) → boolean
│   ├── open()              → boolean
│   ├── close()             → boolean
│   ├── toggle()            → boolean
│   └── getState()          → object | null
├── preset
│   ├── list()              → object[]
│   ├── apply(id, [duration]) → Promise<boolean>
│   ├── morphTo(targets, [duration]) → Promise<boolean>
│   ├── listUser()          → object[]
│   ├── save(slotId, [label]) → boolean
│   ├── load(slotId, [duration]) → Promise<boolean>
│   └── del(slotId)          → boolean
├── midi
│   ├── send(status, d1, d2) → boolean
│   └── isEnabled()         → boolean
└── state
    ├── get()               → object (lightweight)
    └── full()              → object (all 61 params)
```

### Parameter Naming

Full address format: `/ambient_m7_3.0/<paramName>`

61 total parameters, all `hslider` type. Complete list available at runtime:
```js
__agentAPI.params.getAll()
```

Notable parameters with non-standard ranges:

| Address | Min | Max | Step |
|---------|-----|-----|------|
| `/ambient_m7_3.0/air` | 0 | 0.08 | 0.001 |
| `/ambient_m7_3.0/gain` | -36 | -3 | 0.1 |
| `/ambient_m7_3.0/root` | 55 | 220 | 0.1 |
| `/ambient_m7_3.0/midiRoot` | 55 | 220 | 0.1 |
| `/ambient_m7_3.0/midiGain` | -36 | -3 | 0.1 |
| `/ambient_m7_3.0/midiTone` | 0.2 | 0.98 | 0.01 |
| `/ambient_m7_3.0/phaserFeedback` | -0.85 | 0.85 | 0.001 |
| `/ambient_m7_3.0/ritualTone` | 40 | 240 | 0.1 |
| `/ambient_m7_3.0/sparkleTone` | 0.2 | 0.98 | 0.01 |

### Audio Graph

```
ensureAudioActivated()
  → AudioContext.resume()
  → faustNode.connect(audioContext.destination)
  → audioActivated = true
  → refreshStartControlUI()
  → refreshLiveInputControlUI()
```

Param changes via `faustUIBridge.setParamValue(path, value, true)` are applied per audio block (real-time). The third argument `true` emits the change to the UI.

---

## Layer 2: AGENTS.md — Agent Discovery

**URL:** `https://unimcom.materialize.fun/AGENTS.md`

An agent navigating to the site should read this file first. It contains:

- Initialization sequence with exact code blocks
- Complete API method reference with signatures and return types
- Recipe flows (activate audio, create a drone bed, 16-step sequence, morph, MIDI notes, user presets)
- DOM selector table for direct click interactions
- Important parameter reference (non-standard ranges)
- Service worker and caching notes
- 10 common pitfalls
- Verification checklist

The AGENTS.md is deployed alongside the app files and is always up to date with the current `__agentAPI` version. It is **the authoritative discovery document**.

---

## Layer 3: Hermes Skill — Reusable Workflows

**Location:** `~/.hermes/skills/autonomous-ai-agents/unimcom-agent/SKILL.md`

**Load with:** `skill_view(name='unimcom-agent')`

The skill contains:

- Skill trigger conditions
- `__agentAPI` bridge verification step
- 8 pre-baked recipe flows with exact code
- Complete API method table
- Important parameter reference
- 10 common pitfalls
- Verification checklist

Any Hermes agent that loads this skill immediately knows how to navigate and control the Unimcom surface without reading the source code.

---

## Sequencer Architecture

### `StepSequencer` class (defined in `index.js`)

A JavaScript step sequencer that modulates Faust parameters at audio-block rate. Pattern data is stored as `Float32Array` values normalized to 0–1 per step. The `_denormalize()` method maps normalized values to the parameter's actual range via:

```
denormalized = min + normalized * (max - min)
```

If the parameter has a `step > 0`, the result is quantized to the nearest step multiple.

### Data flow

```
StepSequencer._tick()
  → for each linked param:
      → _denormalize(param, pattern[currentStep])
      → _onParamUpdate(path, denormalized)
  → seqOnParamUpdate(path, value)
      → faustUIBridge.setParamValue(path, value, true)
```

### Valid states

| Property | Valid Values |
|----------|--------------|
| BPM | 30–300 |
| Step count | 8, 16, 32 |
| Direction | `forward`, `reverse`, `pingpong` |
| Step values | 0–1 (normalized) |
| Pattern fill | `SEQ_MIDPOINT` = 0 (all steps start silent) |

### Grid cell interaction

Click cycling: 0 → 0.25 → 0.50 → 0.75 → 1.0 → 0

Cells render bars via CSS `::after` pseudo-element with `height: calc(var(--seq-value, 0) * 100%)`. Beat markers appear every 4 steps via `[data-beat="1"]` with a `border-left`.

---

## MIDI Architecture

### Input (Web MIDI API)

The `startMIDI()` function (line 5925) requests `navigator.requestMIDIAccess()` and binds MIDI message handlers. Incoming MIDI messages are forwarded to `faustNode.midiMessage()`.

### Injection (`__agentAPI.midi.send()`)

Directly calls `faustNode.midiMessage(new Uint8Array([status, data1, data2]))` — bypasses Web MIDI entirely.

### Faust Metadata

The compiled `ambient_m7_3.0` DSP includes MIDI metadata mapping CC numbers to parameters. The metadata is embedded in `dsp-meta.json` under the `midi_on` field / per-parameter metadata blocks.

---

## Live Audio Input Architecture

### DSP Requirements

The Faust DSP must be compiled with `-inputs 1` (or higher). The v3.0 DSP has `inputs: 1`.

### Activation Flow

```
startLiveAudioInput()
  → navigator.mediaDevices.getUserMedia({ audio: true })
  → source = audioContext.createMediaStreamSource(stream)
  → source.connect(faustNode)
  → liveInputState.active = true
```

### Source Selector

The `#hud-audio-input-select` dropdown is populated from `enumerateDevices()`. The `SOURCE` label/button opens the browser's mic permission dialog.

---

## Preset Architecture

### Stock Presets

Defined in `MODE_PRESETS` array. Applied through `runQuickPresetMorphExternal(id, durationMs)`, which delegates to the HUD's preset controls and uses `morphToPresetValues()` to interpolate from current values to target values over `globalControlState.morphDurationMs`. Agent-supplied arbitrary targets are normalized with `buildAgentPresetEntries()` so every morph entry includes the DSP control metadata required by the morph engine.

### User Presets

Stored in `userPresetSlots` array, persisted via `persistUserPresetSlots()` to `localStorage['hermes-unimcom-preset-slots']`. Each slot has:

```js
{ id: number, label: string, values: { [address]: number } }
```

The `preset.save()` API call snapshots all 61 current parameter values. `preset.load()` reads them and morphs via `morphToPresetValues()`.

### Morph Engine

`morphToPresetValues(entries, durationMs)` animates from current values to targets over `durationMs` using `requestAnimationFrame`. Each frame calls `applyParamValues(entries)` which sets all parameters via `faustUIBridge.setParamValue()`.

---

## Motion Mode

`activateMotionMode()` binds device-orientation / gyroscope sensors. Randomly assigns N parameters (12–18) to sensor axes. Each frame, maps sensor values (tilt X/Y, gyro pitch/roll/spin) to parameter ranges and sets them via `faustUIBridge.setParamValue()`.

---

## Service Worker

The `service-worker.js` caches only an explicit allowlist of static app assets on the live domain. Cache-bust is handled by versioned query strings. Touchpoints that must be updated together:

| File | Variable |
|------|----------|
| `index.js` | `CREATE_NODE_MODULE_SPEC` (only when `create-node.js` changes; current `"./create-node.js?v=20260521seq4"`) |
| `index.html` | `<script src="./index.js?v=20260525agent1">` |
| `create-node.js` | `HUD_ASSET_VERSION` (when Faust UI assets change) |
| `service-worker.js` | `CACHE_NAME`, `INDEX_ASSET_VERSION`, `CREATE_NODE_MODULE_VERSION` |

---

## Deploy Workflow

### Credentials

Deployment identifiers are intentionally not stored in this project doc. Keep them in the local agent vault instead:

- Local vault reference: `~/.hermes/vault/unimcom-deploy.md`
- Credentials/passwords: use a credential file or terminal prompt; never paste them into chat or commit them to the repo.

### Rsync Command

Use the vault reference for the concrete SSH target. The public-safe shape is:

```bash
rsync -avz \
  --exclude='.git/' \
  --exclude='backups/' \
  --exclude='deploy/' \
  --exclude='audio/' \
  --exclude='docs/' \
  --exclude='docs frm notes/' \
  --exclude='*.md' \
  --exclude='.DS_Store' \
  -e "ssh -o StrictHostKeyChecking=accept-new" \
  ./ \
  [REDACTED_USER]@[REDACTED_HOST]:[REDACTED_TARGET_DIR]/
```

**Do NOT use `--delete`** — the server has extra directories (modal-synth experiments) that must be preserved.

### Selective file sync (agent bridge only)

```bash
rsync -avz \
  index.js AGENTS.md \
  -e "ssh -o StrictHostKeyChecking=accept-new" \
  [REDACTED_USER]@[REDACTED_HOST]:[REDACTED_TARGET_DIR]/
```

### Old test site (deprecated)
- Account/host details are redacted; see vault only if migration history is needed.
- Password was rotated after exposure incident
- Domain: `mcv09.materialize.fun` *(historical/deprecated reference only — do not use for live deploys)*

---

## DOM Selector Reference

| Element | CSS Selector |
|---------|--------------|
| START/ON button | `.hud-control-btn-start` |
| Motion mode | `.hud-control-btn-motion` |
| MIDI mode | `.hud-control-btn-midi` |
| Live input | `.hud-control-btn-live-input` |
| Audio source dropdown | `#hud-audio-input-select` |
| Source label | `.hud-audio-input-label` |
| SEQ toggle (top bar) | `.hud-control-btn-seq` |
| Play sequencer | `.hud-seq-btn[aria-label="Play sequencer"]` |
| Stop sequencer | `.hud-seq-btn[aria-label="Stop sequencer"]` |
| Per-knob S toggle | `.hud-knob-seq-toggle` |
| Theme select | `#hud-theme-select` |
| Reset button | `.hud-control-btn-reset` |
| Zero button | `.hud-control-btn-zero` |
| Random button | `.hud-control-btn-random` |
| Fullscreen button | `.hud-control-btn-fullscreen` |
| Footer console panel | `#footer-console-panel` |

---

## Pitfalls

1. **Audio requires gesture context.** `audio.activate()` works from `browser_console` only after the agent has interacted with the page (pointer/touch event).
2. **MIDI requires Web MIDI API.** Not available in Safari before 16.4 or any iOS browser.
3. **Live audio input** requires `getUserMedia` and a DSP with `inputs >= 1`.
4. **Service worker caching** means deployed updates may not appear immediately. Hard refresh or cache-bust version bump required.
5. **The `__agentAPI` is only accessible from the page's JS scope** — via `browser_console(expression=...)`. Not available as a remote endpoint.
6. **Param values are quantized** by the Faust `step` property (usually 0.001). Values snap, not smooth.
7. **`seq.setStep()` does not update the grid UI** immediately unless the cell element exists in the DOM (panel must be open).
8. **User preset deletion preserves the fixed slot list.** `preset.del()` clears a slot and refreshes the HUD rather than splicing the array.
9. **AGENTS.md is read only after the first page load** — if the agent navigates to the page before the service worker is active, the file may be stale until the next refresh.
10. **DO NOT use `--delete` on rsync** — the server has modal-synth experiment dirs that aren't in the local repo.

---

## One-Command Deploy Regression Check

Primary (repo-root) command:

```bash
./scripts/deploy-regression-check.sh
```

What it verifies automatically:
- Local vs root vs `/test/` SHA-256 parity for `index.js`, `service-worker.js`, `index.html`, `AGENTS.md`
- Runtime contract on root + `/test/`: API version floor, param/preset counts, CSP flags, invalid `seq.link()` rejection, canonical/OG URLs, and JS/page errors
- Writes machine-readable report to `.last-deploy-regression-report.json`

Manual fallback from `browser_console(expression=...)` on both root and `/test/`:

```js
(async () => {
  const csp = document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') || '';
  __agentAPI.seq.open();
  const bad = '/ambient_m7_3.0/not_real_param';
  const ret = __agentAPI.seq.link(bad);
  const st = __agentAPI.seq.getState();
  const linked = st?.linkedParams || [];
  const hasBad = linked.includes(bad);
  if (hasBad) __agentAPI.seq.unlink(bad);
  return {
    apiVersion: __agentAPI._version,
    paramCount: __agentAPI.state.get().paramCount,
    stockPresets: __agentAPI.state.get().stockPresets,
    hasUnsafeEval: csp.includes("'unsafe-eval'"),
    seqBadRet: ret,
    seqBadLinked: hasBad,
    canonical: document.querySelector('link[rel="canonical"]')?.href || null,
    ogUrl: document.querySelector('meta[property="og:url"]')?.content || null,
  };
})();
```

Expected pass values:
- `apiVersion` = `"1.2.2"` (or newer)
- `paramCount` = `61`
- `stockPresets` = `7`
- `hasUnsafeEval` = `false`
- `seqBadRet` = `false`
- `seqBadLinked` = `false`
- `canonical` + `ogUrl` = `https://unimcom.materialize.fun/`


---

## Version History

| Date | Version | Changes |
|------|---------|---------|
| 2026-05-21 | 1.0.0 | Initial bridge + AGENTS.md + Hermes skill |
| 2026-05-21 | 1.1.0 | Added `preset.morphTo()`, `seq.setStep()`, improved error handling |
| 2026-05-21 | 1.2.0 | Full motion/midi/liveInput toggle controls, stable release |
| 2026-05-25 | 1.2.1 | Fixed agent preset morph/save/load/delete paths, motion disable, param validation, service-worker cache allowlist, and security headers |
| 2026-05-28 | 1.2.2 | Fixed `seq.link()` validation: unknown parameter paths now return `false` and are not linked |
| 2026-05-29 | 1.2.2 | Docs normalization: active docs map, generated `faust-parameter-catalog.md` from `dsp-meta.json`, and archived legacy `ambient_m7_2.0` / 57-control docs |
