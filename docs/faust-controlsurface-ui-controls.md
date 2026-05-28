# Faust DSP Control Surface and UI Controls

## Scope

- DSP: `ambient_m7_2.0` (from `dsp-meta.json`).
- Total Faust UI parameters: **57** (all are `hslider`).
- This document is based on exhaustive search of project call sites that write parameter values in `create-node.js`, `index.js`, and `faust-ui/index.js`.

## Parameter Catalog (Exact Paths/Names)

| Path | Name | Type | Min | Max | Step | Default | Units | Smoothing / Nonlinear Mapping |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| `/ambient_m7_2.0/air` | `air` | `hslider` | 0 | 0.08 | 0.001 | 0.02 |  | UI scale is linear; no explicit per-control smoothing at input. |
| `/ambient_m7_2.0/ambiAmt` | `ambiAmt` | `hslider` | 0 | 1 | 0.001 | 0.26 |  | UI scale is linear; no explicit per-control smoothing at input. |
| `/ambient_m7_2.0/ambiDepth` | `ambiDepth` | `hslider` | 0 | 1 | 0.001 | 0.35 |  | UI scale is linear; no explicit per-control smoothing at input. |
| `/ambient_m7_2.0/ambiElev` | `ambiElev` | `hslider` | 0 | 1 | 0.001 | 0.5 |  | UI scale is linear; no explicit per-control smoothing at input. |
| `/ambient_m7_2.0/ambiFocus` | `ambiFocus` | `hslider` | 0 | 1 | 0.001 | 0.4 |  | UI scale is linear; no explicit per-control smoothing at input. |
| `/ambient_m7_2.0/ambiRotate` | `ambiRotate` | `hslider` | 0 | 1 | 0.001 | 0.5 |  | UI scale is linear; no explicit per-control smoothing at input. |
| `/ambient_m7_2.0/ambiSpin` | `ambiSpin` | `hslider` | 0 | 1 | 0.001 | 0.22 |  | UI scale is linear; no explicit per-control smoothing at input. |
| `/ambient_m7_2.0/ambiWidth` | `ambiWidth` | `hslider` | 0 | 1 | 0.001 | 0.35 |  | UI scale is linear; no explicit per-control smoothing at input. |
| `/ambient_m7_2.0/ascendAmt` | `ascendAmt` | `hslider` | 0 | 1 | 0.001 | 0 |  | UI scale is linear; no explicit per-control smoothing at input. |
| `/ambient_m7_2.0/attuneBuild` | `attuneBuild` | `hslider` | 0 | 1 | 0.001 | 0 |  | Smoothed in DSP when used: `attuneBuild : smoothCtl(0.9978)` |
| `/ambient_m7_2.0/attuneHit` | `attuneHit` | `hslider` | 0 | 1 | 0.001 | 0 |  | Smoothed in DSP when used: `attuneHit : smoothCtl(0.9988)` |
| `/ambient_m7_2.0/boadiceaAmt` | `boadiceaAmt` | `hslider` | 0 | 1 | 0.001 | 0.14 |  | UI scale is linear; no explicit per-control smoothing at input. |
| `/ambient_m7_2.0/boadiceaContour` | `boadiceaContour` | `hslider` | 0 | 1 | 0.001 | 0.48 |  | UI scale is linear; no explicit per-control smoothing at input. |
| `/ambient_m7_2.0/boadiceaRate` | `boadiceaRate` | `hslider` | 0.03 | 1.2 | 0.01 | 0.22 |  | UI scale is linear; no explicit per-control smoothing at input. |
| `/ambient_m7_2.0/cameraOrbitX` | `cameraOrbitX` | `hslider` | 0 | 1 | 0.001 | 0.5 |  | UI scale is linear; no explicit per-control smoothing at input. |
| `/ambient_m7_2.0/cameraOrbitY` | `cameraOrbitY` | `hslider` | 0 | 1 | 0.001 | 0.5 |  | UI scale is linear; no explicit per-control smoothing at input. |
| `/ambient_m7_2.0/cathedralAmt` | `cathedralAmt` | `hslider` | 0 | 1 | 0.001 | 0.3 |  | UI scale is linear; no explicit per-control smoothing at input. |
| `/ambient_m7_2.0/cathedralTime` | `cathedralTime` | `hslider` | 0.8 | 6 | 0.01 | 2.8 |  | UI scale is linear; no explicit per-control smoothing at input. |
| `/ambient_m7_2.0/chantAmt` | `chantAmt` | `hslider` | 0 | 1 | 0.001 | 0.12 |  | UI scale is linear; no explicit per-control smoothing at input. |
| `/ambient_m7_2.0/chantFormant` | `chantFormant` | `hslider` | 0 | 1 | 0.001 | 0.58 |  | UI scale is linear; no explicit per-control smoothing at input. |
| `/ambient_m7_2.0/chantMode` | `chantMode` | `hslider` | 0 | 1 | 0.001 | 0.35 |  | UI scale is linear; no explicit per-control smoothing at input. |
| `/ambient_m7_2.0/chantMotion` | `chantMotion` | `hslider` | 0.02 | 1.6 | 0.01 | 0.24 |  | UI scale is linear; no explicit per-control smoothing at input. |
| `/ambient_m7_2.0/chantReciteMix` | `chantReciteMix` | `hslider` | 0 | 1 | 0.001 | 0.55 |  | UI scale is linear; no explicit per-control smoothing at input. |
| `/ambient_m7_2.0/detune` | `detune` | `hslider` | 0 | 0.02 | 0.0001 | 0.0025 |  | UI scale is linear; no explicit per-control smoothing at input. |
| `/ambient_m7_2.0/gain` | `gain` | `hslider` | -36 | -3 | 0.1 | -12 | `dB` | Mapped in DSP from dB to linear gain: `: ba.db2linear` |
| `/ambient_m7_2.0/invisibleAmt` | `invisibleAmt` | `hslider` | 0 | 1 | 0.001 | 0 |  | UI scale is linear; no explicit per-control smoothing at input. |
| `/ambient_m7_2.0/lockCtl` | `lockCtl` | `hslider` | 0 | 1 | 0.001 | 0 |  | UI scale is linear; no explicit per-control smoothing at input. |
| `/ambient_m7_2.0/materialAmt` | `materialAmt` | `hslider` | 0 | 1 | 0.001 | 0 |  | UI scale is linear; no explicit per-control smoothing at input. |
| `/ambient_m7_2.0/mobileRotX` | `mobileRotX` | `hslider` | 0 | 1 | 0.001 | 0.5 |  | UI scale is linear; no explicit per-control smoothing at input. |
| `/ambient_m7_2.0/mobileRotY` | `mobileRotY` | `hslider` | 0 | 1 | 0.001 | 0.5 |  | UI scale is linear; no explicit per-control smoothing at input. |
| `/ambient_m7_2.0/motion` | `motion` | `hslider` | 0.02 | 0.8 | 0.01 | 0.2 |  | UI scale is linear; no explicit per-control smoothing at input. |
| `/ambient_m7_2.0/objectSpinCtl` | `objectSpinCtl` | `hslider` | 0 | 1 | 0.001 | 0 |  | UI scale is linear; no explicit per-control smoothing at input. |
| `/ambient_m7_2.0/organumAmt` | `organumAmt` | `hslider` | 0 | 1 | 0.001 | 0.22 |  | UI scale is linear; no explicit per-control smoothing at input. |
| `/ambient_m7_2.0/percussionDensity` | `percussionDensity` | `hslider` | 0 | 1 | 0.001 | 0.38 |  | UI scale is linear; no explicit per-control smoothing at input. |
| `/ambient_m7_2.0/percussionDrive` | `percussionDrive` | `hslider` | 0 | 1 | 0.001 | 0.46 |  | UI scale is linear; no explicit per-control smoothing at input. |
| `/ambient_m7_2.0/phaserDepth` | `phaserDepth` | `hslider` | 0 | 1 | 0.001 | 1 |  | Smoothed in DSP: `: smoothCtl(0.9995)` |
| `/ambient_m7_2.0/phaserFeedback` | `phaserFeedback` | `hslider` | -0.85 | 0.85 | 0.001 | 0.85 |  | Smoothed in DSP: `: smoothCtl(0.9997)` |
| `/ambient_m7_2.0/phaserMix` | `phaserMix` | `hslider` | 0 | 1 | 0.001 | 0.22 |  | Smoothed in DSP: `: smoothCtl(0.9994)` |
| `/ambient_m7_2.0/phaserRate` | `phaserRate` | `hslider` | 0.05 | 2.5 | 0.01 | 0.18 |  | Smoothed in DSP: `: smoothCtl(0.9993)` |
| `/ambient_m7_2.0/polyAmt` | `polyAmt` | `hslider` | 0 | 1 | 0.001 | 0.25 |  | UI scale is linear; no explicit per-control smoothing at input. |
| `/ambient_m7_2.0/polyChord` | `polyChord` | `hslider` | 0 | 1 | 0.001 | 0.35 |  | UI scale is linear; no explicit per-control smoothing at input. |
| `/ambient_m7_2.0/polyMotion` | `polyMotion` | `hslider` | 0 | 1 | 0.001 | 0.28 |  | UI scale is linear; no explicit per-control smoothing at input. |
| `/ambient_m7_2.0/polySpread` | `polySpread` | `hslider` | 0 | 1 | 0.001 | 0.22 |  | UI scale is linear; no explicit per-control smoothing at input. |
| `/ambient_m7_2.0/polyWarp` | `polyWarp` | `hslider` | 0 | 1 | 0.001 | 0.18 |  | UI scale is linear; no explicit per-control smoothing at input. |
| `/ambient_m7_2.0/proximityCtl` | `proximityCtl` | `hslider` | 0 | 1 | 0.001 | 0 |  | UI scale is linear; no explicit per-control smoothing at input. |
| `/ambient_m7_2.0/ritualDecay` | `ritualDecay` | `hslider` | 0.05 | 1.2 | 0.001 | 0.42 |  | UI scale is linear; no explicit per-control smoothing at input. |
| `/ambient_m7_2.0/ritualPercAmt` | `ritualPercAmt` | `hslider` | 0 | 1 | 0.001 | 0.08 |  | UI scale is linear; no explicit per-control smoothing at input. |
| `/ambient_m7_2.0/ritualPulseRate` | `ritualPulseRate` | `hslider` | 0.2 | 3 | 0.01 | 0.72 |  | UI scale is linear; no explicit per-control smoothing at input. |
| `/ambient_m7_2.0/ritualTone` | `ritualTone` | `hslider` | 40 | 240 | 0.1 | 96 |  | UI scale is linear; no explicit per-control smoothing at input. |
| `/ambient_m7_2.0/root` | `root` | `hslider` | 55 | 220 | 0.1 | 110 | `Hz` | UI scale is linear; no explicit per-control smoothing at input. |
| `/ambient_m7_2.0/sparkle` | `sparkle` | `hslider` | 0 | 0.8 | 0.001 | 0.14 |  | UI scale is linear; no explicit per-control smoothing at input. |
| `/ambient_m7_2.0/sparkleRate` | `sparkleRate` | `hslider` | 0.05 | 1.5 | 0.01 | 0.25 |  | UI scale is linear; no explicit per-control smoothing at input. |
| `/ambient_m7_2.0/sparkleTone` | `sparkleTone` | `hslider` | 0.2 | 0.98 | 0.01 | 0.75 |  | UI scale is linear; no explicit per-control smoothing at input. |
| `/ambient_m7_2.0/stageCtl` | `stageCtl` | `hslider` | 0 | 1 | 0.001 | 0 |  | UI scale is linear; no explicit per-control smoothing at input. |
| `/ambient_m7_2.0/transmuteAmt` | `transmuteAmt` | `hslider` | 0 | 1 | 0.001 | 0 |  | UI scale is linear; no explicit per-control smoothing at input. |
| `/ambient_m7_2.0/zoomIn` | `zoomIn` | `hslider` | 0 | 1 | 0.001 | 0 |  | UI scale is linear; no explicit per-control smoothing at input. |
| `/ambient_m7_2.0/zoomOut` | `zoomOut` | `hslider` | 0 | 1 | 0.001 | 0 |  | UI scale is linear; no explicit per-control smoothing at input. |

## UI/Event Control Paths (Where Parameters Are Controlled)

All 61 parameters use the same base write path when controlled from the knob surface:

1. Knob UI gesture updates control value in Faust UI component (`faust-ui/index.js:1448`, `faust-ui/index.js:1486`, `faust-ui/index.js:1500`).
2. Component emits param change (`faust-ui/index.js:565`).
3. App bridge intercepts UI param change (`create-node.js:1103`).
4. Bridge writes to DSP (`create-node.js:1056`, `create-node.js:1058`).
5. DSP output callback mirrors value back into UI (`create-node.js:1104`).

Additional global write paths that can modify any/all parameters:

- Preset morph apply path: `setModeMorphAmount -> buildPresetMorphEntries -> applyParamValues` (`index.js:1309`, `index.js:1322`, `index.js:955`).
- `applyParamValues` writes through bridge batch setter when available (`index.js:958`); otherwise falls back to direct `faustNode.setParamValue` (`index.js:963`).
- Quick preset button morph (click): `runQuickPresetMorph` (`index.js:1548`, `index.js:1339`).
- Preset knob drag (mouse/touch pointer): `pointerdown/move` (`index.js:1460`, `index.js:1488`).
- Preset knob keyboard control: arrows/page/home/end (`index.js:1528`).
- Zero Out button (click): writes all controls using `zeroOutControlValue` (`index.js:1722`, `index.js:1731`).
- Randomize button (click): writes all controls using `randomizeControlValue` (`index.js:1740`, `index.js:1749`).
- Reset path restores snapshot values after rebuilding node/UI (`index.js:1015`, `index.js:1057`).
- Startup click on START applies preset `childhood_memory` once via quick morph (`index.js:45`, `index.js:1678`, `index.js:1691`).

Gesture details relevant to parameter changes:

- **Knob drag/touch**: pointer delta is vertical (`fromY - y`) mapped to normalized range and quantized to step (`faust-ui/index.js:1493` to `faust-ui/index.js:1500`).
- **Click**: preset quick-morph buttons and top control-strip buttons trigger programmatic parameter writes (see lines above).
- **Scroll**: grid scroll controls only move the UI viewport; they do not call `setParamValue` (`index.js:1791`, `index.js:1803`, `index.js:1808`, `index.js:1848`).
- **Wheel**: no wheel-based parameter mapping is wired in this build (`faust-ui/index.js:468` is empty and no wheel listener is attached).

Quantization behavior to replicate exactly:

- Faust UI item clamp/quantize uses floor-to-step (`faust-ui/index.js:545` to `faust-ui/index.js:550`).
- Macro operations (preset morph/random/zero) quantize by nearest step (`index.js:912` to `index.js:920`).

## Presets / Scenes

Preset definitions live in `MODE_PRESETS` (`index.js:182` to `index.js:596`). Each preset is normalized through `completeModeValues`, so the effective target map covers all control keys (`index.js:154` to `index.js:163`).

| ID | Title | Subtitle | Used As Startup Preset |
| --- | --- | --- | --- |
| `golden_discovery` | Golden Discovery | Lydian Dominant | No |
| `night_sky_wonder` | Night Sky Wonder | Ionian +9/+7 | No |
| `ancient_forest_curiosity` | Ancient Forest | Mixolydian b6 | No |
| `water_memory` | Water Memory | Dorian +9 | No |
| `crystal_cave` | Crystal Cave | Lydian Augmented | No |
| `childhood_memory` | Childhood Memory | Major Pent +4 | Yes |
| `heroic_gentle_adventure` | Heroic Adventure | Mixolydian | No |

### Exact Preset Value Maps

```json
[
  {
    "id": "golden_discovery",
    "title": "Golden Discovery",
    "subtitle": "Lydian Dominant",
    "values": {
      "air": 0.038,
      "ambiAmt": 0.46,
      "ambiDepth": 0.62,
      "ambiElev": 0.63,
      "ambiFocus": 0.52,
      "ambiRotate": 0.6,
      "ambiSpin": 0.33,
      "ambiWidth": 0.66,
      "ascendAmt": 0.31,
      "attuneBuild": 0.36,
      "attuneHit": 0.05,
      "boadiceaAmt": 0.26,
      "boadiceaContour": 0.68,
      "boadiceaRate": 0.34,
      "cameraOrbitX": 0.65,
      "cameraOrbitY": 0.57,
      "cathedralAmt": 0.4,
      "cathedralTime": 4.2,
      "chantAmt": 0.21,
      "chantFormant": 0.58,
      "chantMode": 0.46,
      "chantMotion": 0.34,
      "chantReciteMix": 0.61,
      "detune": 0.0042,
      "gain": -13,
      "invisibleAmt": 0.08,
      "lockCtl": 0.34,
      "materialAmt": 0.16,
      "mobileRotX": 0.6,
      "mobileRotY": 0.44,
      "motion": 0.31,
      "objectSpinCtl": 0.38,
      "organumAmt": 0.36,
      "percussionDensity": 0.26,
      "percussionDrive": 0.36,
      "phaserDepth": 0.64,
      "phaserFeedback": 0.29,
      "phaserMix": 0.26,
      "phaserRate": 0.2,
      "polyAmt": 0.5,
      "polyChord": 0.82,
      "polyMotion": 0.48,
      "polySpread": 0.52,
      "polyWarp": 0.42,
      "proximityCtl": 0.52,
      "ritualDecay": 0.6,
      "ritualPercAmt": 0.2,
      "ritualPulseRate": 1.02,
      "ritualTone": 112,
      "root": 136,
      "sparkle": 0.39,
      "sparkleRate": 0.32,
      "sparkleTone": 0.9,
      "stageCtl": 0.37,
      "transmuteAmt": 0.27,
      "zoomIn": 0.44,
      "zoomOut": 0.22
    }
  },
  {
    "id": "night_sky_wonder",
    "title": "Night Sky Wonder",
    "subtitle": "Ionian +9/+7",
    "values": {
      "air": 0.074,
      "ambiAmt": 0.76,
      "ambiDepth": 0.84,
      "ambiElev": 0.78,
      "ambiFocus": 0.66,
      "ambiRotate": 0.42,
      "ambiSpin": 0.08,
      "ambiWidth": 0.88,
      "ascendAmt": 0.24,
      "attuneBuild": 0.03,
      "attuneHit": 0.018,
      "boadiceaAmt": 0.08,
      "boadiceaContour": 0.32,
      "boadiceaRate": 0.07,
      "cameraOrbitX": 0.48,
      "cameraOrbitY": 0.45,
      "cathedralAmt": 0.77,
      "cathedralTime": 5.9,
      "chantAmt": 0.07,
      "chantFormant": 0.71,
      "chantMode": 0.62,
      "chantMotion": 0.08,
      "chantReciteMix": 0.79,
      "detune": 0.0008,
      "gain": -17.5,
      "invisibleAmt": 0.46,
      "lockCtl": 0.58,
      "materialAmt": 0.08,
      "mobileRotX": 0.49,
      "mobileRotY": 0.53,
      "motion": 0.07,
      "objectSpinCtl": 0.11,
      "organumAmt": 0.62,
      "percussionDensity": 0.05,
      "percussionDrive": 0.08,
      "phaserDepth": 0.27,
      "phaserFeedback": -0.24,
      "phaserMix": 0.08,
      "phaserRate": 0.05,
      "polyAmt": 0.22,
      "polyChord": 0.95,
      "polyMotion": 0.1,
      "polySpread": 0.45,
      "polyWarp": 0.06,
      "proximityCtl": 0.23,
      "ritualDecay": 1.05,
      "ritualPercAmt": 0.02,
      "ritualPulseRate": 0.26,
      "ritualTone": 58,
      "root": 82,
      "sparkle": 0.58,
      "sparkleRate": 0.08,
      "sparkleTone": 0.97,
      "stageCtl": 0.12,
      "transmuteAmt": 0.04,
      "zoomIn": 0.63,
      "zoomOut": 0.04
    }
  },
  {
    "id": "ancient_forest_curiosity",
    "title": "Ancient Forest",
    "subtitle": "Mixolydian b6",
    "values": {
      "air": 0.006,
      "ambiAmt": 0.29,
      "ambiDepth": 0.72,
      "ambiElev": 0.34,
      "ambiFocus": 0.81,
      "ambiRotate": 0.27,
      "ambiSpin": 0.28,
      "ambiWidth": 0.31,
      "ascendAmt": 0.08,
      "attuneBuild": 0.41,
      "attuneHit": 0.064,
      "boadiceaAmt": 0.67,
      "boadiceaContour": 0.81,
      "boadiceaRate": 0.71,
      "cameraOrbitX": 0.31,
      "cameraOrbitY": 0.68,
      "cathedralAmt": 0.14,
      "cathedralTime": 2.1,
      "chantAmt": 0.34,
      "chantFormant": 0.39,
      "chantMode": 0.27,
      "chantMotion": 0.42,
      "chantReciteMix": 0.33,
      "detune": 0.0068,
      "gain": -10.8,
      "invisibleAmt": 0.04,
      "lockCtl": 0.14,
      "materialAmt": 0.71,
      "mobileRotX": 0.35,
      "mobileRotY": 0.62,
      "motion": 0.37,
      "objectSpinCtl": 0.46,
      "organumAmt": 0.29,
      "percussionDensity": 0.62,
      "percussionDrive": 0.67,
      "phaserDepth": 0.72,
      "phaserFeedback": 0.43,
      "phaserMix": 0.34,
      "phaserRate": 0.27,
      "polyAmt": 0.28,
      "polyChord": 0.18,
      "polyMotion": 0.52,
      "polySpread": 0.23,
      "polyWarp": 0.31,
      "proximityCtl": 0.74,
      "ritualDecay": 0.93,
      "ritualPercAmt": 0.39,
      "ritualPulseRate": 1.22,
      "ritualTone": 62,
      "root": 74,
      "sparkle": 0.05,
      "sparkleRate": 0.09,
      "sparkleTone": 0.35,
      "stageCtl": 0.61,
      "transmuteAmt": 0.11,
      "zoomIn": 0.12,
      "zoomOut": 0.49
    }
  },
  {
    "id": "water_memory",
    "title": "Water Memory",
    "subtitle": "Dorian +9",
    "values": {
      "air": 0.05,
      "ambiAmt": 0.69,
      "ambiDepth": 0.8,
      "ambiElev": 0.68,
      "ambiFocus": 0.39,
      "ambiRotate": 0.56,
      "ambiSpin": 0.14,
      "ambiWidth": 0.86,
      "ascendAmt": 0.11,
      "attuneBuild": 0.07,
      "attuneHit": 0.022,
      "boadiceaAmt": 0.19,
      "boadiceaContour": 0.43,
      "boadiceaRate": 0.26,
      "cameraOrbitX": 0.58,
      "cameraOrbitY": 0.36,
      "cathedralAmt": 0.57,
      "cathedralTime": 5.1,
      "chantAmt": 0.18,
      "chantFormant": 0.67,
      "chantMode": 0.45,
      "chantMotion": 0.22,
      "chantReciteMix": 0.76,
      "detune": 0.0024,
      "gain": -15.8,
      "invisibleAmt": 0.44,
      "lockCtl": 0.5,
      "materialAmt": 0.34,
      "mobileRotX": 0.64,
      "mobileRotY": 0.62,
      "motion": 0.14,
      "objectSpinCtl": 0.2,
      "organumAmt": 0.33,
      "percussionDensity": 0.1,
      "percussionDrive": 0.16,
      "phaserDepth": 0.74,
      "phaserFeedback": -0.58,
      "phaserMix": 0.36,
      "phaserRate": 0.1,
      "polyAmt": 0.39,
      "polyChord": 0.64,
      "polyMotion": 0.16,
      "polySpread": 0.54,
      "polyWarp": 0.14,
      "proximityCtl": 0.34,
      "ritualDecay": 0.92,
      "ritualPercAmt": 0.06,
      "ritualPulseRate": 0.52,
      "ritualTone": 92,
      "root": 146.8,
      "sparkle": 0.2,
      "sparkleRate": 0.2,
      "sparkleTone": 0.68,
      "stageCtl": 0.24,
      "transmuteAmt": 0.06,
      "zoomIn": 0.46,
      "zoomOut": 0.2
    }
  },
  {
    "id": "crystal_cave",
    "title": "Crystal Cave",
    "subtitle": "Lydian Augmented",
    "values": {
      "air": 0.08,
      "ambiAmt": 0.82,
      "ambiDepth": 0.89,
      "ambiElev": 0.87,
      "ambiFocus": 0.38,
      "ambiRotate": 0.66,
      "ambiSpin": 0.36,
      "ambiWidth": 0.94,
      "ascendAmt": 0.48,
      "attuneBuild": 0.22,
      "attuneHit": 0.058,
      "boadiceaAmt": 0.11,
      "boadiceaContour": 0.9,
      "boadiceaRate": 0.18,
      "cameraOrbitX": 0.78,
      "cameraOrbitY": 0.34,
      "cathedralAmt": 0.86,
      "cathedralTime": 6,
      "chantAmt": 0.09,
      "chantFormant": 0.77,
      "chantMode": 0.73,
      "chantMotion": 0.16,
      "chantReciteMix": 0.74,
      "detune": 0.009,
      "gain": -18.5,
      "invisibleAmt": 0.21,
      "lockCtl": 0.63,
      "materialAmt": 0.04,
      "mobileRotX": 0.72,
      "mobileRotY": 0.38,
      "motion": 0.25,
      "objectSpinCtl": 0.44,
      "organumAmt": 0.52,
      "percussionDensity": 0.05,
      "percussionDrive": 0.12,
      "phaserDepth": 0.85,
      "phaserFeedback": 0.52,
      "phaserMix": 0.4,
      "phaserRate": 0.06,
      "polyAmt": 0.61,
      "polyChord": 1,
      "polyMotion": 0.31,
      "polySpread": 0.7,
      "polyWarp": 0.64,
      "proximityCtl": 0.28,
      "ritualDecay": 1.09,
      "ritualPercAmt": 0.04,
      "ritualPulseRate": 0.36,
      "ritualTone": 128,
      "root": 175,
      "sparkle": 0.72,
      "sparkleRate": 0.56,
      "sparkleTone": 0.98,
      "stageCtl": 0.42,
      "transmuteAmt": 0.58,
      "zoomIn": 0.91,
      "zoomOut": 0.09
    }
  },
  {
    "id": "childhood_memory",
    "title": "Childhood Memory",
    "subtitle": "Major Pent +4",
    "values": {
      "air": 0.014,
      "ambiAmt": 0.18,
      "ambiDepth": 0.24,
      "ambiElev": 0.52,
      "ambiFocus": 0.6,
      "ambiRotate": 0.5,
      "ambiSpin": 0.05,
      "ambiWidth": 0.22,
      "ascendAmt": 0.03,
      "attuneBuild": 0.02,
      "attuneHit": 0.012,
      "boadiceaAmt": 0.04,
      "boadiceaContour": 0.21,
      "boadiceaRate": 0.08,
      "cameraOrbitX": 0.5,
      "cameraOrbitY": 0.5,
      "cathedralAmt": 0.08,
      "cathedralTime": 1.4,
      "chantAmt": 0.05,
      "chantFormant": 0.49,
      "chantMode": 0.22,
      "chantMotion": 0.09,
      "chantReciteMix": 0.62,
      "detune": 0.0012,
      "gain": -9.8,
      "invisibleAmt": 0.03,
      "lockCtl": 0.08,
      "materialAmt": 0.12,
      "mobileRotX": 0.5,
      "mobileRotY": 0.5,
      "motion": 0.06,
      "objectSpinCtl": 0.04,
      "organumAmt": 0.14,
      "percussionDensity": 0.07,
      "percussionDrive": 0.08,
      "phaserDepth": 0.17,
      "phaserFeedback": -0.12,
      "phaserMix": 0.04,
      "phaserRate": 0.09,
      "polyAmt": 0.18,
      "polyChord": 0.1,
      "polyMotion": 0.08,
      "polySpread": 0.19,
      "polyWarp": 0.03,
      "proximityCtl": 0.1,
      "ritualDecay": 0.28,
      "ritualPercAmt": 0.03,
      "ritualPulseRate": 0.32,
      "ritualTone": 70,
      "root": 206,
      "sparkle": 0.12,
      "sparkleRate": 0.11,
      "sparkleTone": 0.58,
      "stageCtl": 0.07,
      "transmuteAmt": 0.02,
      "zoomIn": 0.18,
      "zoomOut": 0.02
    }
  },
  {
    "id": "heroic_gentle_adventure",
    "title": "Heroic Adventure",
    "subtitle": "Mixolydian",
    "values": {
      "air": 0.031,
      "ambiAmt": 0.52,
      "ambiDepth": 0.53,
      "ambiElev": 0.42,
      "ambiFocus": 0.62,
      "ambiRotate": 0.6,
      "ambiSpin": 0.49,
      "ambiWidth": 0.67,
      "ascendAmt": 0.23,
      "attuneBuild": 0.64,
      "attuneHit": 0.094,
      "boadiceaAmt": 0.21,
      "boadiceaContour": 0.47,
      "boadiceaRate": 0.41,
      "cameraOrbitX": 0.67,
      "cameraOrbitY": 0.69,
      "cathedralAmt": 0.26,
      "cathedralTime": 2.7,
      "chantAmt": 0.12,
      "chantFormant": 0.5,
      "chantMode": 0.31,
      "chantMotion": 0.41,
      "chantReciteMix": 0.41,
      "detune": 0.0056,
      "gain": -13.5,
      "invisibleAmt": 0.09,
      "lockCtl": 0.29,
      "materialAmt": 0.13,
      "mobileRotX": 0.62,
      "mobileRotY": 0.33,
      "motion": 0.43,
      "objectSpinCtl": 0.71,
      "organumAmt": 0.31,
      "percussionDensity": 0.77,
      "percussionDrive": 0.82,
      "phaserDepth": 0.71,
      "phaserFeedback": 0.44,
      "phaserMix": 0.22,
      "phaserRate": 0.27,
      "polyAmt": 0.59,
      "polyChord": 0.36,
      "polyMotion": 0.72,
      "polySpread": 0.58,
      "polyWarp": 0.35,
      "proximityCtl": 0.86,
      "ritualDecay": 0.61,
      "ritualPercAmt": 0.52,
      "ritualPulseRate": 1.62,
      "ritualTone": 126,
      "root": 123.47,
      "sparkle": 0.35,
      "sparkleRate": 0.29,
      "sparkleTone": 0.78,
      "stageCtl": 0.88,
      "transmuteAmt": 0.39,
      "zoomIn": 0.18,
      "zoomOut": 0.72
    }
  }
]
```

## Integration Notes (Reproducing This Control Surface in a New Project)

1. Instantiate Faust node and get UI metadata (`create-node.js:22`, `create-node.js:1018`).
2. Flatten all Faust UI controls and convert slider-like controls to knob widgets (`create-node.js:548`, `create-node.js:563`, `create-node.js:582`).
3. Keep a stable `controlPaths` list from UI descriptor addresses (`create-node.js:598`, `create-node.js:1090`).
4. Bind UI->DSP writes through one function (`setParamValueWithUI`) and always mirror to UI (`create-node.js:1056` to `create-node.js:1060`).
5. Bind DSP->UI updates with `setOutputParamHandler` (`create-node.js:1104`) and initial sync with `getParamValue` (`create-node.js:1062` to `create-node.js:1070`).
6. Build a control index by full path and short key to drive scene/preset targets (`index.js:877` to `index.js:905`).
7. Route all macro operations through a centralized multi-write helper (`index.js:955` to `index.js:965`).
8. For scene morphing, snapshot baseline values, interpolate with easing, and quantize per control (`index.js:985` to `index.js:1010`, `index.js:1112` to `index.js:1145`).
9. Preserve the same nonlinearity/smoothing behavior in DSP: `gain` uses `ba.db2linear`; `phaser*`, `attuneBuild`, and `attuneHit` are smoothed in DSP source (decoded from `dsp-meta.json` field `.code`).
