# Step Sequencer Implementation Plan

> **For Hermes:** Use subagent-driven-development skill patterns: research first, targeted implementation, independent verification.

**Goal:** Add a step sequencer to the Unimcom Faust control surface that can automate any parameter in the 57-knob grid. The sequencer drives parameter values via `faustUIBridge.setParamValue()` from JavaScript — no Faust DSP changes required.

**Architecture:** Preserve the buildless static app. The sequencer is a JavaScript-side engine that writes values to Faust parameters at a configurable BPM rate. Each knob gets a small toggle button to link/unlink it to the sequencer. A collapsible SEQ panel provides step editing, BPM, step count, play/stop, and pattern controls.

**Tech Stack:** Static HTML/CSS/JS. Web Audio API clock (via `audioContext.currentTime`) for tight timing. `faustUIBridge.setParamValue()` for parameter modulation.

---

## Research Findings Summary

1. **Faust built-in sequencer**: `ba.automat` exists but is a record/replay primitive, not ideal for pre-programmed step sequencers.
2. **Recommended approach**: JS-side sequencer driving Faust parameters via `setParamValue()`. This is fast (single memory write), glitch-free at 16th-note rates (~125ms), and allows the UI to control sequencer state directly.
3. **Timing**: `setInterval` is adequate for 30-300 BPM. For tighter sync, `AudioParam` scheduling or `audioContext.currentTime` look-ahead scheduling can be used.
4. **Per-parameter routing**: `dspControls` array provides all 57 parameter addresses with min/max/step/init. `faustUIBridge.setParamValue(path, value)` and `faustUIBridge.setParamValues(entries)` are the APIs.

---

## Task 1: Sequencer Engine (pure JS class)

**Objective:** Create a `StepSequencer` class with no DOM dependencies that manages:
- BPM (30-300, default 120)
- Step count (8, 16, 32, default 16)
- Per-parameter step patterns: `{ [paramPath]: Float32Array(stepCount) }`
- Play/stop state
- Loop mode
- Timing via `setInterval` with `audioContext.currentTime` verification
- Optional: swing, direction (forward/reverse/ping-pong/random)

**File:** New inline module in `index.js` (or a small helper section)

**API:**
```js
class StepSequencer {
    constructor(audioContext)
    setBPM(bpm)
    setStepCount(count)
    linkParameter(path, control)   // link a param to sequencer
    unlinkParameter(path)          // unlink a param
    setStepValue(path, stepIndex, value)
    getStepValue(path, stepIndex)
    play()
    stop()
    isPlaying()
    getCurrentStep()
    onStep(callback)              // notification for UI update
    destroy()
}
```

**Steps:**
1. Define the class with internal state: bpm, stepCount, patterns map, linked params, playing flag, currentStep, intervalId.
2. Implement `play()` using `setInterval` at `60000 / bpm` ms per step.
3. Each tick: for every linked parameter, read `patterns[path][currentStep]`, normalize to the param's min/max range, call `faustUIBridge.setParamValue(path, normalizedValue)`.
4. Increment `currentStep` modulo `stepCount`.
5. Notify UI via `onStep` callback so the SEQ panel can highlight the active step.
6. `stop()` clears interval, resets step to 0.
7. `destroy()` stops and cleans up.

## Task 2: SEQ Button + Sequencer Control Panel

**Objective:** Add a SEQ button to the HUD control strip (same style as MIDI/motion) that toggles a collapsible sequencer panel below the control strip.

**Files:**
- Modify: `index.html` (CSS for sequencer panel)
- Modify: `index.js` (button creation, panel mount, SEQ state)

**UI Elements in the panel:**
1. **BPM display + adjust** — numeric readout with +/- buttons
2. **Step count selector** — 8 / 16 / 32 toggle buttons
3. **Play / Stop** — transport controls
4. **Step grid** — rows for each linked parameter, columns for steps. Each cell is a small clickable bar whose height represents the step value (0-1). Active step is highlighted.
5. **Clear pattern** — reset all steps to 0.5 (midpoint)
6. **Direction** — forward / reverse / ping-pong toggle (stretch goal)

**Visual style:**
- Monochrome, HUD-like, matching the existing control surface aesthetic
- Compact: the panel sits between the control strip and the knob grid
- Collapsible: only visible when SEQ is active
- Step cells are small (16-24px) with subtle borders

**Steps:**
1. Add CSS for `.hud-seq-panel`, `.hud-seq-grid`, `.hud-seq-step`, `.hud-seq-cell`, transport buttons.
2. In `mountHUDControls()`, create `$seqMode` button (same class as MIDI/motion).
3. Create `mountSequencerPanel()` function that builds the SEQ panel DOM.
4. Wire the panel to the `StepSequencer` instance.
5. Show/hide panel on SEQ button toggle.
6. Refresh step highlights on each tick via `sequencer.onStep()`.

## Task 3: Per-Knob Sequencer Toggle Buttons

**Objective:** Add a small toggle button to each knob's overlay that links/unlinks the parameter to the sequencer.

**Files:**
- Modify: `create-node.js` (in `applyHUDStyles`, after the knob overlay is built)

**Design:**
- Small (16-20px) button positioned at the bottom-right of the knob overlay
- Shows "SEQ" text when linked, "—·—" or dimmed when unlinked
- Toggle state: `data.seqLinked = "0" | "1"`
- When linked, the parameter's current value populates all steps as the initial pattern
- Visual: matches existing HUD monochrome style, subtle border, dim when off

**Steps:**
1. In `applyHUDStyles()`, after building `$overlay`, create `$seqToggle` button.
2. Style it to fit in the bottom-right corner of the knob cell.
3. On click, toggle the linked state and call `sequencer.linkParameter(address, control)` or `sequencer.unlinkParameter(address)`.
4. Update the button's visual state (active/inactive).
5. Store link state so it survives grid re-renders (linked params are re-registered after `renderKnobGrid()`).

## Task 4: Wire Sequencer to Faust Parameters

**Objective:** Connect the sequencer engine to the actual Faust parameter system so that step values modulate linked knobs in real-time.

**Files:**
- Modify: `index.js`

**Steps:**
1. Instantiate `StepSequencer` after `faustUIBridge` is ready.
2. Pass `faustUIBridge.setParamValue` to the sequencer as the output callback.
3. On each tick, the sequencer writes values to linked parameters.
4. The knob overlays update automatically via the existing `paramChangeByDSP` path.
5. Handle edge cases:
   - If the user manually turns a linked knob, don't fight it — skip that step or let the manual value through for one tick.
   - If the sequencer is stopped, restore the last manual value or hold the last step.

## Task 5: Cache-Bust and Verification

**Objective:** Ensure syntax checks pass and deployed cache-bust touchpoints align.

**Files:**
- Modify: `index.html` (script cache-bust query)
- Modify: `index.js` (`CREATE_NODE_MODULE_SPEC`)
- Modify: `create-node.js` (`HUD_ASSET_VERSION`)
- Modify: `service-worker.js` (`CACHE_NAME`, version constants)

**Verification:**
1. `node --check index.js`
2. `node --check create-node.js`
3. `node --check service-worker.js`
4. Static DOM inspection: SEQ button appears after IN/SOURCE
5. SEQ panel opens/closes on toggle
6. Per-knob SEQ toggles visible on each knob
7. Linking a knob and pressing play modulates the parameter
8. BPM change adjusts step rate
9. Step count change resizes the grid
10. Existing controls (START, MIDI, IN, motion, presets) unaffected

---

## Implementation Order

1. **Task 1** (engine) — can be developed independently
2. **Task 2** (panel) + **Task 3** (per-knob toggles) — can be parallelized after Task 1
3. **Task 4** (wiring) — depends on Tasks 1-3
4. **Task 5** (verification) — final pass

## Subagent Delegation Strategy

- **Subagent A**: Implement the `StepSequencer` class (Task 1) — pure JS, no DOM
- **Subagent B**: Add SEQ button + panel CSS + HTML structure (Task 2) — DOM + CSS
- **Subagent C**: Add per-knob SEQ toggle in `create-node.js` (Task 3) — DOM modification in `applyHUDStyles`
- Then: Wire everything together + verify (Task 4 + Task 5) — needs coordinator context

---

## Future Enhancements (not in scope)

- Pattern save/load to localStorage
- Multiple pattern slots (A/B/C/D)
- Swing/groove templates
- Per-step probability
- AudioParam-based sample-accurate scheduling
- MIDI clock sync output
