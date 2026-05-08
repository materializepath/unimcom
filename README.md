# unimcom

**Universal Matter Compiler** — a Faust DSP control surface web app by [P.A.T.H.](https://github.com/materializepath)

> `universal.matter.compiler.dsp.v.0.9`

Live site: **[mcv09.materialize.fun](https://mcv09.materialize.fun)**

---

## What it is

A dense, monochrome, single-page control surface for a Faust/WASM-driven experimental drone synthesizer. 57 DSP parameters rendered as a touch-friendly knob grid, with preset morphing, motion/sensor modulation, theme switching, and offline caching — all in a buildless static web app.

## Features

- **57-parameter Faust control grid** generated from the DSP UI descriptor
- **Preset system** — stock presets with quick-morph buttons, morph cards/knobs, and 8 local user slots persisted in `localStorage`
- **Footer preset I/O console** — transfer-code export/load/clear/copy/paste with a CRT/console aesthetic
- **VIBE/theme switching** with persistence across sessions
- **Motion mode** — sensor-driven parameter modulation with permission flow
- **Service worker caching** — offline-capable with cache versioning
- **Global controls** — gain, root, transpose, morph time, motion sensitivity
- **Zoom, scroll, fullscreen** controls for the grid
- **Audio unlock** — explicit user gesture required, not auto-started on load

## Running locally

No build system, no package manager. Serve the directory with any static HTTP server:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

> ⚠️ Use a static server, not `file://`. Local preview intentionally unregisters the service worker — localhost and deployed caching behavior are intentionally different.

## Project structure

```
index.html              Page shell, inline CSS, footer/preset console markup
index.js                Main runtime, HUD, presets, persistence, audio activation
create-node.js          Faust node creation, UI bridge, theme/zoom, iOS haptics
service-worker.js       Offline cache, cache versioning, COOP/COEP headers
dsp-module.wasm         Prebuilt Faust DSP module
dsp-meta.json           Faust DSP metadata / UI descriptor
faust-ui/               Local Faust UI dependency (CSS + JS)
faustwasm/              Local Faust runtime JS
vendor/                 Vendored libraries (Three.js)
docs/                   System architecture and UI control reference
```

## Design language

Monochrome, retro, HUD-like interface with a CRT/console footer. Bold, dense, intentionally authored — not a generic synth panel or SaaS widget.

## Credits

**P.A.T.H.** ([@materializepath](https://github.com/materializepath))

Built with [Faust](https://faust.grame.fr/) and raw browser APIs.
