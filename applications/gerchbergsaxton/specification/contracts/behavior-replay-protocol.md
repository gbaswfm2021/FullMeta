# Level 2 behavior replay protocol

Run this protocol only after Level 1 schema acceptance passes for the same candidate. It verifies the registered application, Study operation, persisted run results, and Graphics Console behavior using disposable project documents authored from this specification. The bundled project is a useful final smoke check, but it is not the only replay input and must not be used as the source of expected values.

## Construct the replay projects

Create two disposable projects routed through the application's normal catalog/schema path. Each project must have its own project directory and run storage. Populate its JSON from [DATA_MODEL.md](../DATA_MODEL.md) and [contracts/scalar-far-field-gs.md](scalar-far-field-gs.md); do not copy an existing saved project JSON or a prior result. Record each starting JSON and its digest before running.

| Case ID | Target | Design parameters | Study | Coverage |
| --- | --- | --- | --- | --- |
| `GS-REPLAY-M` | Centered M SVG: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M 15 85 L 15 15 L 50 60 L 85 15 L 85 85" fill="none" stroke="#000" stroke-width="12" stroke-linejoin="round" stroke-linecap="round"/></svg>`; target width `2π` rad/µm. | Gaussian `exp(-((x/89.6)^2+(y/89.6)^2))`; radius 50 µm; N=256; pitch 1 µm; wavelength 532 nm. | Fixed Study ID `gs-study`; 40 iterations; seed 20261110. | Bundled Letter M physical and numerical baseline. |
| `GS-REPLAY-PLUS` | Centered plus SVG: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M 50 12 V 88 M 12 50 H 88" fill="none" stroke="#000" stroke-width="12" stroke-linecap="round"/></svg>`; target width 2 rad/µm. | Uniform amplitude `1`; radius 32 µm; N=64; pitch 2 µm; wavelength 633 nm. | Fixed Study ID `gs-study`; 24 iterations; seed 7. | Alternate target, illumination, aperture, grid, pitch, wavelength, iteration, and seed values in a second valid project. |

These values satisfy the documented grid, radius, target-span, and propagating-wave constraints. The protocol is not a full Cartesian product: it deliberately covers two distinct valid combinations, then uses isolated edits below to test each freshness trigger.

## Visible UI replay for each project

1. Open the disposable project through the normal application route. Confirm the project tree root uses the app display name; Inputs contains Target SVG and Design parameters as selectable leaves; the Study row is directly below the root. Validate the project and record both structural and model-validation outcomes.
2. Select Target SVG and inspect the binary mask, target width, and physical `kx`, `ky` axes. Select Design parameters and inspect the full-plane amplitude, aperture outline, and physical `x`, `y` axes. Select the Study and confirm its iterations, seed, Run Study and Clear Results actions, and current no-result state.
3. Run the Study from the selected Study row. Record operation completion, run ID, saved input snapshot, result files, and the three Graphics Console plots. Confirm the phase is transparent outside the effective aperture, result axes and units are correct, and the result is selectable through Run history.
4. Select Target SVG, Design parameters, then Study again. Confirm the Study result is restored without rerunning. Save and reopen the project; confirm the newest compatible result is restored. Confirm the two newest completed runs are retained, and Clear Results removes only this disposable project's runs after confirmation.
5. Repeat steps 1–4 for both project cases. Exercise wheel zoom, drag pan, and double-click reset on each input view and each Study plot; verify only the interacted plot repaints and axes/overlays stay aligned.

## Freshness variants

After a successful `GS-REPLAY-M` run, make and apply each edit in a separate disposable copy of the baseline. Confirm the existing result becomes stale for every edit; do not combine these edits when testing individual freshness triggers:

- SVG target content;
- target width;
- illumination expression;
- aperture radius;
- grid size;
- sample pitch;
- wavelength;
- Study iteration count;
- initialization seed.

For edits that remain physically valid, rerun and confirm the stale result is replaced by a current result. For invalid edits, confirm validation prevents dispatch and the previous completed result remains available but stale.

## Deterministic replay

Run each of the two unchanged project cases twice with the same candidate, executable, saved JSON, Study ID, and seed. Compare the saved results element by element:

- result dimensions and target arrays must match exactly;
- phase null locations must match exactly;
- each defined phase and intensity sample must differ by no more than absolute tolerance `1e-6`, as specified in [contracts/scalar-far-field-gs.md](scalar-far-field-gs.md);
- each result must have finite defined phase, finite nonnegative intensity, and null phase outside the effective aperture.

Record both run IDs and result paths. A repeated existing result, a target preview, or two runs made with changed inputs do not satisfy deterministic replay.

## Retest rule

Do not repeat a recorded PASS without a relevant cause. A changed schema, application implementation, runtime, dependency, or requirement calls for rerunning only the acceptance rows and replay cases affected by that change. A reported defect or new evidence that challenges a PASS is also a cause. A schema metadata-only change requires structural/schema validation but does not require numerical behavior replay; documentation-only changes do not invalidate existing replay evidence. Retain prior results and append focused evidence for any rerun. A required case that has not passed remains PENDING.
## Evidence record and outcome

For each case record candidate/schema/package/executable identity, initial JSON digest, all inputs and seed, selected tree-item sequence, validation outcomes, operation/run IDs, output paths, observed graphics and UI states, and array-comparison results. Mark each required row **PASS**, **FAIL**, **BLOCKED**, or **PENDING**. A fixed dependency failure remains unverified and must include its reproduction; missing evidence is PENDING. Level 2 passes only when both valid project cases, all freshness variants, the selection/result lifecycle, and both deterministic comparisons pass on the same candidate.

