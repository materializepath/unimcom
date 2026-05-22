# MIDI + Live Audio Input Controls Implementation Plan

> **For Hermes:** Use subagent-driven-development skill patterns: research first, targeted implementation, independent verification.

**Goal:** Add explicit HUD buttons for Web MIDI input and selectable live audio input to the Unimcom Faust control surface.

**Architecture:** Preserve the buildless static app. Add two square HUD buttons beside the existing motion button using the same motion-button sizing/style. Refactor the existing implicit MIDI/mic activation so START remains an audio-output unlock while MIDI and live input are opt-in user-gesture controls. Add a compact source selector for live audio input using the existing VIBE selector language.

**Tech Stack:** Static HTML/CSS/JS, Web Audio API, Web MIDI API, Faust WASM runtime, existing `connectToAudioInput()` helper.

---

## Task 1: Add durable state and refresh hooks

**Objective:** Track MIDI access, bound inputs, live input stream node, selected audio source, and refresh callbacks.

**Files:**
- Modify: `index.js`

**Steps:**
1. Add `refreshMIDIControlUI`, `refreshLiveInputControlUI`, and `refreshAudioInputDeviceListUI` stubs near existing refresh stubs.
2. Add state objects after `motionModeState`:
   - `midiInputState`
   - `liveInputState`
3. Preserve existing globals and startup preset behavior.

## Task 2: Add MIDI and live input HUD controls

**Objective:** Place MIDI and INPUT buttons next to motion control, with matching size/style, plus a selectable audio source picker.

**Files:**
- Modify: `index.html`
- Modify: `index.js`

**Steps:**
1. Add CSS so `.hud-control-btn-midi` and `.hud-control-btn-live-input` share `.hud-control-btn-motion` dimensions and active state.
2. Add an audio source picker style by reusing `.hud-theme-picker`/`.hud-theme-select`.
3. In `mountHUDControls()`, create `$midiMode`, `$liveInput`, and `$audioInputPicker`.
4. Append controls in order: motion → MIDI → INPUT → SOURCE.
5. Add refresh functions and event handlers near existing motion/start handlers.

## Task 3: Refactor MIDI activation

**Objective:** Make MIDI opt-in from the new MIDI button and avoid auto-requesting MIDI from START.

**Files:**
- Modify: `index.js`

**Steps:**
1. Replace old `startMIDI()`/`stopMIDI()` with cached `MIDIAccess` state.
2. Bind/unbind inputs via `addEventListener('midimessage', ...)`.
3. Handle `statechange` for hot-plugging.
4. Pass raw `event.data` to `faustNode.midiMessage(event.data)`.
5. Remove implicit `startMIDI()` call from `ensureAudioActivated()`.

## Task 4: Add selectable live audio input activation

**Objective:** Enable microphone/interface input only from the INPUT button and only when the Faust DSP exposes input channels.

**Files:**
- Modify: `index.js`

**Steps:**
1. Add helpers for `getFaustAudioInputCount()`, device enumeration, source select population, start/stop live input.
2. Use existing `connectToAudioInput(audioContext, selectedDeviceId || null, faustNode, oldNode)`.
3. Stop old `MediaStreamTrack`s on disconnect/reconnect.
4. Disable INPUT gracefully when current DSP reports 0 audio inputs.
5. Refresh labels after permission grants because device labels are often hidden before permission.

## Task 5: Fix verification blocker and update cache versions

**Objective:** Ensure syntax checks pass and deployed cache-bust touchpoints align.

**Files:**
- Modify: `create-node.js` only if needed to repair the pre-existing syntax error around the forced ScriptProcessor patch.
- Modify: `index.html`
- Modify: `service-worker.js`

**Steps:**
1. Preserve the existing forced ScriptProcessor intent while restoring valid syntax.
2. Bump `index.html` script query for `index.js`.
3. Bump `service-worker.js` `INDEX_ASSET_VERSION` and `CACHE_NAME`.

## Verification

1. `node --check index.js`
2. `node --check create-node.js`
3. Static inspect for new button order and refresh wiring.
4. Local browser smoke test when practical:
   - START still unlocks audio and applies startup preset once.
   - MIDI button toggles Web MIDI access without prompting from START.
   - INPUT button stays disabled/NO IN for current 0-input DSP, or connects selected source for a future input-capable DSP.

---

## Deferred: MIDI DSP Integration

The MIDI button UI is wired and `faustNode.midiMessage(event.data)` is called on incoming MIDI messages, but the current Faust DSP has no `[midi:...]` metadata declarations. To make MIDI functional:

1. Add Faust MIDI metadata to the DSP source (e.g., `[midi:ctrl 1]`, `[midi:noteon]`, etc.)
2. Rebuild the WASM module via `faust -lang wasm -json`
3. Verify `dsp-meta.json` reflects MIDI-capable inputs
4. Test with a connected MIDI controller

## Deferred: Live Audio Input DSP

The IN button and SOURCE selector are wired, but the current DSP reports `{ inputs: 0, outputs: 2 }`. To make live input functional:

1. Modify the Faust DSP to accept at least one audio input
2. Rebuild the WASM module
3. Verify `dsp-meta.json` reports `inputs > 0`
4. Test with a microphone or line-level source
