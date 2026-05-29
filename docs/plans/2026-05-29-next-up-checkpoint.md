# Next Up Checkpoint — 2026-05-29

## Snapshot

- Repo: `CODE/Mobiel/exports/sound-materialize-faust-webapp-20260227-r7`
- Branch: `main`
- HEAD: `14218d2` (`docs: normalize active/archive docs and regenerate DSP catalog`)
- Working tree: clean

## Live Deployment Status (verified)

`./scripts/deploy-regression-check.sh` ran successfully at:
- `2026-05-29T13:54:10.224Z`

Pass summary:
- File parity (local/root/test): `index.js`, `service-worker.js`, `index.html`, `AGENTS.md` all match
- Runtime contract on root + `/test/`: PASS
  - `apiVersion=1.2.2`
  - `paramCount=61`
  - `stockPresets=7`
  - invalid `seq.link()` rejected
  - no JS/page errors

So the live main site is currently in sync with the local build-critical files.

## Next Up (when resuming)

### Priority 1 — Move 3: MIDI + live-input reliability pass

1. Add richer I/O diagnostics in `__agentAPI.state.get()` / `.full()`:
   - MIDI: supported, active, available input count, bound input count, last error
   - Live input: supported, DSP input channels, available devices, selected device, active track count, last error
2. Harden failure handling for toggles:
   - `startMIDI()` / `startLiveAudioInput()` should consistently capture and expose failure reasons
3. Validate with browser checks:
   - root and `/test/` still pass regression script
   - confirm diagnostics fields serialize correctly from `browser_console`
4. Update docs + skill references if API shape changes.

### First command on resume

```bash
cd /Users/sysmiiii/CODE/Mobiel/exports/sound-materialize-faust-webapp-20260227-r7
./scripts/deploy-regression-check.sh
```
