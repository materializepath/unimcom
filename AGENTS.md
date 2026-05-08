# AGENTS.md

## Purpose

This file is the standing agent contract for `ctrl.surface` / `universal.matter.compiler.dsp.v.0.9`.

Use it to stay aligned with the current shipped app, not to invent a new architecture.

## Source of truth order

When sources disagree, trust them in this order:

1. Current code in this workspace
2. Live site: `https://mcv09.materialize.fun`
3. Existing Markdown docs in `docs/`
4. Notes PDFs in `docs frm notes/`

Important:
- The codebase and live site include later preset, footer-console, and vibe-selector work that older docs may not fully reflect.
- `docs/faust-controlsurface-ui-controls.md` intentionally omits haptics because iPhone haptics are still unreliable.

## Project shape

This is a buildless static web app, not a bundled app.

- No `npm`, bundler, or framework pipeline is present.
- The app is shipped as plain HTML, CSS, JS, WASM, JSON, images, and a service worker.
- Do not invent a bundler or package-manager workflow unless the project is explicitly restructured.

Core runtime files:
- `index.html`: page shell, inline CSS, footer/preset I/O console markup, cache-busted script and stylesheet includes
- `index.js`: main app runtime, HUD controls, preset system, localStorage persistence, audio activation flow, motion mode, footer console behavior
- `create-node.js`: Faust node creation, Faust UI bridge, theme application, HUD control styling, zoom support, iOS haptic fallback plumbing
- `service-worker.js`: offline cache, cache versioning, network-first paths, COOP/COEP response wrapping
- `faust-ui/` and `faustwasm/`: local UI/runtime dependencies
- `dsp-module.wasm` and `dsp-meta.json`: prebuilt Faust DSP artifacts

Reference docs:
- `docs/system-architecture-controlsurface-ui.md`
- `docs/faust-controlsurface-ui-controls.md`

Historical notes:
- `docs frm notes/*.pdf`

## Current shipped behavior to preserve

The current app is a dense single-page control surface with these important behaviors:

- A 57-parameter Faust control grid generated from the DSP UI descriptor
- `START` unlocks audio and applies the startup preset once
- Stock preset quick-morph buttons plus preset morph cards/knobs
- 8 local user preset slots persisted in `localStorage`
- Footer preset I/O console with transfer-code export/load/clear/copy/paste behavior
- VIBE/theme switching with persistence
- Global controls for motion sensitivity, gain, root, transpose, and morph time
- Zoom, scroll, and fullscreen controls for the grid
- Motion mode and sensor-driven parameter modulation
- Service-worker-backed caching for deployed builds

Current startup behavior matters:
- Audio starts from an explicit user gesture, not on page load.
- The startup preset is applied once after activation.
- Do not change this flow casually; it is easy to break browser gesture requirements.

## Visual and product guardrails

- Preserve the monochrome, retro, HUD-like interface language.
- Preserve the footer CRT / console / `.nfo` feel in the preset I/O area.
- Do not genericize the UI into a standard SaaS panel, generic synth UI, or framework-default styling.
- Keep the interface bold, dense, and intentionally authored.

If you change visual behavior, compare against the live site first so you know what the current product language actually is.

## Fragile systems

Treat these areas as sensitive and require explicit regression checks after edits:

- Audio unlock and `AudioContext` activation timing
- Pointer/touch gesture handling for knobs and preset morph controls
- Preset morph logic and baseline/target state handling
- Footer console sizing, typography, and boot-overlay behavior
- Theme switching and theme persistence
- Motion mode and sensor permission flows
- Service-worker cache/version behavior

### Haptics

Haptics are experimental on iPhone.

- Do not simplify or remove the hidden-switch fallback without real device testing.
- Do not remove gesture-time triggering, touch-action protections, or other iOS-specific workarounds just because they look unusual.
- If you touch haptics, assume regressions are likely unless tested on actual iPhone hardware.

## Workflow guidance

### Local preview

- Preview through a static HTTP server on `localhost`, not `file://`.
- Example: `python3 -m http.server 8000` from the project root.
- Local preview intentionally unregisters and clears the service worker. This is current behavior, not a bug.
- Because of that, localhost behavior and deployed behavior are intentionally different in caching/update flow.

### Backups and exported snapshots

- This workspace may be an exported snapshot without `.git`.
- Do not assume Git history exists.
- Prefer filesystem inspection and the existing `backups/` archives when you need historical context.
- Do not edit `backups/` or `deploy/` artifacts unless explicitly asked.
- For major UI or interaction rewrites, create a new timestamped backup first.

### Cache-bust and versioning touchpoints

When shipping frontend asset changes, update the relevant version strings together so deployed users do not get stale mixed assets.

Current touchpoints include:
- `index.html` script/style cache-bust query strings
- `index.js` `CREATE_NODE_MODULE_SPEC`
- `create-node.js` `HUD_ASSET_VERSION`
- `service-worker.js` `CACHE_NAME`
- `service-worker.js` `INDEX_ASSET_VERSION`
- `service-worker.js` `CREATE_NODE_MODULE_VERSION`

If you change runtime-loaded assets and forget one of these, the live build can serve mismatched code.

## Verification expectations

Run lightweight checks after edits:

- `node --check` on touched JS entrypoints
- Desktop smoke test
- Narrow/mobile-width smoke test

For UI or behavior changes, verify these flows as applicable:

- `START` audio unlock
- Startup preset application
- Stock preset quick morph and preset knob morph behavior
- User preset save/load/export/import behavior
- Footer console fit, typography, and boot overlay behavior
- Theme switching and persistence
- Zoom, scroll, and fullscreen controls
- Motion mode behavior and permission prompts

Prefer verifying visible UI changes against both local preview and the live site.

## Live-site notes

The current live site is `https://mcv09.materialize.fun`.

Known current warning:
- The live site presently emits non-fatal Three.js alpha warnings related to color parsing.

Do not treat those existing warnings as a fresh regression unless your changes alter them.

## Working style for future agents

- Read the existing code paths before changing behavior.
- Prefer small, targeted edits over broad rewrites.
- Keep architectural assumptions consistent with the existing app.
- Use the docs in `docs/` as deep background, but resolve final questions from the code and live site.
- If a requested change conflicts with the current shipped product language, call it out explicitly instead of silently steering the app into a different style.
