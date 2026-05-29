# agent.unimcom — Hermes Agent Control Surface

**Site:** https://unimcom.materialize.fun/
**API Version:** 1.2.2
**Faust DSP:** ambient_m7_3.0 (61 hslider parameters, 1 audio input, 2 outputs)
**Stack:** Static HTML/CSS/JS + Faust WASM + Three.js (buildless)

---

## Initialization Flow

1. Navigate to the page. The app loads a Three.js canvas and Faust UI knobs.
2. No audio output is connected until the user (or agent) activates it.
3. **To start audio**, call `__agentAPI.audio.activate()`. This:
   - Resumes the WebAudio AudioContext
   - Connects the Faust WASM node to audio output
   - Applies the startup preset
4. After activation, all `__agentAPI.controls.*`, `__agentAPI.params.*`, and `__agentAPI.seq.*` methods become fully functional.

```js
// One-shot init from browser_console:
await __agentAPI.audio.activate();
__agentAPI.params.set("/ambient_m7_3.0/gain", -12);
```

---

## API Reference

### `__agentAPI` — namespace

All methods are safe to call before audio activation. They return `false` / `null` / `[]` if their dependency isn't ready.

---

### `__agentAPI.audio.*`

| Method | Returns | Description |
|--------|---------|-------------|
| `activate()` | `Promise<boolean>` | Resume AudioContext + connect Faust node |
| `isActive()` | `boolean` | True if audio has been activated since page load |
| `deactivate()` | `Promise<boolean>` | Suspend AudioContext, disconnect MIDI, stop live input |

---

### `__agentAPI.params.*`

| Method | Returns | Description |
|--------|---------|-------------|
| `set(path, value)` | `boolean` | Set a single Faust parameter. `path` is the full address e.g. `/ambient_m7_3.0/air`. Value is clamped + quantized automatically. |
| `get(path)` | `number \| null` | Current value from the live param map, or `null` if not found |
| `getAll()` | `object[]` | Every parameter with `{ address, label, min, max, step, init, value }` |
| `setBatch(entries)` | `boolean` | Batch set: `[{ path: "/ambient_m7_3.0/air", value: 0.04 }, ...]`. All entries are validated, clamped, and quantized before any values are applied. |
| `info(path)` | `object \| null` | Parameter metadata by address or short key — same shape as `getAll()` items |

**Parameter naming:** The full address is `/ambient_m7_3.0/<paramName>`. Examples:
- `/ambient_m7_3.0/air` — Air/high-frequency dampening
- `/ambient_m7_3.0/gain` — Master gain (-36 dB to -3 dB)
- `/ambient_m7_3.0/root` — Tonal root frequency (55–220 Hz)
- `/ambient_m7_3.0/chantAmt` — Chant voice amount
- `/ambient_m7_3.0/polyAmt` — Polyphonic shimmer amount
- `/ambient_m7_3.0/ritualPulseRate` — Percussion pulse rate
- `/ambient_m7_3.0/transmuteAmt` — Transmutation amount
- `/ambient_m7_3.0/invisibleAmt`, `materialAmt`, `ascendAmt` — Ascension parameters

Use `__agentAPI.params.getAll()` at runtime for the complete list with min/max/step per parameter.

---

### `__agentAPI.controls.*`

Toggle controls for HUD buttons. Each returns an object with:

```js
{ isEnabled(): boolean, enable(): Promise<boolean>, disable(): Promise<boolean>, toggle(): Promise<boolean> }
```

| Control | Description |
|---------|-------------|
| `controls.motion` | Device-motion sensor modulation (gyro, tilt) |
| `controls.midi` | Web MIDI input — connects MIDI devices to Faust |
| `controls.liveInput` | Live audio input (mic / line in). SOURCE selector is a separate DOM element: `#hud-audio-input-select` |

---

### `__agentAPI.seq.*`

The step sequencer drives linked Faust parameters on each beat.

| Method | Returns | Description |
|--------|---------|-------------|
| `isPlaying()` | `boolean` | Sequencer running? |
| `play()` | `boolean` | Start the sequencer (requires linked params) |
| `stop()` | `boolean` | Stop the sequencer |
| `setBPM(bpm)` | `boolean` | Set tempo (30–300) |
| `getBPM()` | `number` | Current BPM |
| `setStepCount(n)` | `boolean` | 8, 16, or 32 |
| `setDirection(dir)` | `boolean` | `"forward"`, `"reverse"`, or `"pingpong"` |
| `link(path)` | `boolean` | Link a Faust parameter to the sequencer. Returns `false` for unknown parameter paths |
| `unlink(path)` | `boolean` | Unlink a parameter |
| `setStep(path, index, value)` | `boolean` | Set a single step value (0–1 normalized) |
| `open()` | `boolean` | Show the sequencer panel |
| `close()` | `boolean` | Hide the sequencer panel |
| `toggle()` | `boolean` | Toggle panel visibility |
| `getState()` | `object \| null` | `{ playing, bpm, stepCount, direction, currentStep, linkedCount, linkedParams[] }` |

**Typical sequencer workflow:**

```js
// 1. Open seq panel
__agentAPI.seq.open();

// 2. Link a parameter to modulate
__agentAPI.seq.link("/ambient_m7_3.0/ambiAmt");

// 3. Set step values (0–1 normalized)
__agentAPI.seq.setStep("/ambient_m7_3.0/ambiAmt", 0, 0.75);
__agentAPI.seq.setStep("/ambient_m7_3.0/ambiAmt", 4, 0.25);
__agentAPI.seq.setStep("/ambient_m7_3.0/ambiAmt", 8, 1.0);

// 4. Play
__agentAPI.seq.play();
```

---

### `__agentAPI.preset.*`

| Method | Returns | Description |
|--------|---------|-------------|
| `list()` | `object[]` | Stock presets: `[{ id, title, subtitle }, ...]` |
| `apply(id, duration?)` | `Promise<boolean>` | Trigger a stock or saved user preset morph by ID (e.g. `"golden_discovery"` or `"user_01"`) |
| `morphTo(targets, duration?)` | `Promise<boolean>` | Morph to arbitrary values. `targets` is `{ path: value, ... }` or `[{ path, value }, ...]` |
| `listUser()` | `object[]` | User preset slots: `[{ id, label, hasData, count, updatedAt }, ...]` |
| `save(slotId, label?)` | `boolean` | Snapshot current preset-mode values into a fixed user preset slot. Slot accepts `1`, `"1"`, or `"user_01"`. |
| `load(slotId, duration?)` | `Promise<boolean>` | Load a user preset and morph to its values |
| `del(slotId)` | `boolean` | Clear a user preset slot while preserving the fixed slot list |

**Stock preset IDs:** `golden_discovery`, `night_sky_wonder`, `ancient_forest_curiosity`, `water_memory`, `crystal_cave`, `childhood_memory`, `heroic_gentle_adventure`. Use `__agentAPI.preset.list()` for the live list.

**Morph example:**

```js
// Morph to a specific state over ~1 second
await __agentAPI.preset.morphTo({
  "/ambient_m7_3.0/air": 0.06,
  "/ambient_m7_3.0/sparkle": 0.42,
  "/ambient_m7_3.0/cathedralAmt": 0.6
}, 1000);
```

---

### `__agentAPI.midi.*`

| Method | Returns | Description |
|--------|---------|-------------|
| `send(status, data1, data2)` | `boolean` | Send raw MIDI message to the Faust AudioNode |
| `isEnabled()` | `boolean` | MIDI input currently active? |

MIDI messages are routed via `faustNode.midiMessage()`. Faust metadata in the compiled DSP maps MIDI CC numbers to parameters. Example:

```js
// Note on (middle C, velocity 100)
__agentAPI.midi.send(0x90, 60, 100);

// CC 1 (mod wheel) at value 64
__agentAPI.midi.send(0xB0, 1, 64);
```

---

### `__agentAPI.state.*`

| Method | Returns | Description |
|--------|---------|-------------|
| `get()` | `object` | Lightweight state — keys only, no param values |
| `full()` | `object` | Full state — includes `.params: { path: value, ... }` |

**`state.get()` returns:**
```js
{
  version: "1.2.2",
  audioActive: bool,
  audioContextState: "running" | "suspended" | "closed" | "unknown",
  faustReady: bool,
  paramCount: 61,
  motionEnabled: bool,
  midiEnabled: bool,
  liveInputEnabled: bool,
  sequencerPlaying: bool,
  seqLinkedCount: int,
  stockPresets: 7
}
```

**`state.full()`** adds `.params` with every parameter's current value by address.

---

## DOM Navigation

When clicking directly (not via API), these selectors are stable:

| Element | Selector |
|---------|----------|
| START/ON button | `.hud-control-btn-start` |
| Motion mode | `.hud-control-btn-motion` |
| MIDI mode | `.hud-control-btn-midi` |
| Live input | `.hud-control-btn-live-input` |
| Audio source | `#hud-audio-input-select` |
| SEQ toggle | `.hud-control-btn-seq` |
| Play seq | `.hud-seq-btn[aria-label="Play sequencer"]` |
| Stop seq | `.hud-seq-btn[aria-label="Stop sequencer"]` |
| BPM − / + | `.hud-seq-btn-sm` (first two in transport) |
| Step count 8/16/32 | `.hud-seq-step-select` |
| Direction | `.hud-seq-btn-sm[data-direction]` |
| Per-knob S toggle | `.hud-knob-seq-toggle` |
| Theme select | `#hud-theme-select` |
| Reset | `.hud-control-btn-reset` |
| Zero | `.hud-control-btn-zero` |
| Random | `.hud-control-btn-random` |
| Zoom + / − | `.hud-control-btn-zoom` |
| Fullscreen | `.hud-control-btn-fullscreen` |
| KNOB overlay container | `.faust-ui-component .faust-hud-overlay` |

---

## Service Worker

The app caches itself via service worker on the live domain (disabled on localhost).
Cache-bust is handled by versioned query strings (`?v=20260528agent2` etc.).
After deploying an update, the next page load triggers an `activate` event.
The old cache is purged when the new service worker activates.

---

## Audio Graph

```
User Gesture → ensureAudioActivated()
  → AudioContext.resume()
  → FaustNode destination ← AudioContext
  → FaustDSP (WASM, 61 params, MIDI, 1 audio input)
```

Param changes are applied per-audio-block (real-time). MIDI messages pass through `faustNode.midiMessage()` and the DSP processes them at audio rate.

---

## Limitations

1. **Audio requires a user gesture context.** `audio.activate()` works from `browser_console` only after the agent has clicked/pointed anywhere on the page first (browser autoplay policy).
2. **MIDI requires Web MIDI API support.** Not available in all browsers (Safari desktop only from v16.4+; iOS Safari unsupported).
3. **Live audio input** requires `getUserMedia` permission + a Faust DSP compiled with `inputs >= 1`. Current DSP: 1 input.
4. **The `__agentAPI` bridge exists only in the live page's JS scope** — it is not a separate file or remote endpoint. All access is through `browser_console(expression=...)`.
5. **Param values are quantized** by the Faust control's `step` property (usually 0.001). Values are NOT smoothed — they snap to the quantized value on the next audio block.

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

Manual fallback (page console or `browser_console(expression=...)`) if script execution is unavailable:

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
- `apiVersion`: `"1.2.2"` (or newer)
- `paramCount`: `61`
- `stockPresets`: `7`
- `hasUnsafeEval`: `false`
- `seqBadRet`: `false`
- `seqBadLinked`: `false`
- `canonical` + `ogUrl`: `https://unimcom.materialize.fun/`
