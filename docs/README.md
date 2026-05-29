# Docs Map

## Active (current runtime source of truth)

- `agent-control-system.md`
  - Canonical architecture + `__agentAPI` contract + deploy regression procedure.
- `faust-parameter-catalog.md`
  - Generated from current `dsp-meta.json` (ambient_m7_3.0, 61 controls).
- `plans/`
  - Implementation plans and historical execution notes.

## Archive (historical, do not treat as live contract)

- `archive/faust-controlsurface-ui-controls-legacy-ambient_m7_2.0.md`
  - Legacy catalog from `ambient_m7_2.0` / 57-control era.
- `archive/system-architecture-controlsurface-ui-legacy.md`
  - Legacy architecture snapshot with old line anchors and assumptions.

## Regenerate current parameter catalog

```bash
node scripts/generate-faust-parameter-catalog.cjs
```
