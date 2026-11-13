# Study workflow contract

This contract is normative for GS-REQ-03 through GS-REQ-06. It defines the model tree, input editing, root-level structural validation, selected-Study settings and action, operation lifecycle, and Graphics Console behavior. Follow the shared FullMeta Model Editor pattern used by the [FEM UI contract](../../../fem/specification/UI.md#tree-level-function-requirements).

## Project tree and settings ownership

```text
Letter M Hologram (project name)
├── Inputs
│   ├── Target SVG
│   └── Design parameters
└── Study
    └── Far-field hologram study
```

| Row | Model path | Required behavior |
| --- | --- | --- |
| Project root | document root | Displays the application display name from the selected schema (the example displays **Gerchberg-Saxton Hologram**, styled in uppercase) and the shared **Validate** action. The editable project name remains in metadata/project settings. Inputs and Study are direct children; do not insert another application-name group. |
| Inputs | `/model` | Non-editable grouping row. |
| Target SVG | `/model/target` | Selectable leaf row. Settings expose editable `/model/target/svg` and `/model/target/targetWidthRadPerUm`. The SVG field is a shared multiline Value Control, initially 120 CSS pixels high and full-width within its value cell; users can resize it vertically. |
| Design parameters | `/model/illumination` | Selectable leaf row. This is the visible row label; preserve the existing `model.illumination` JSON key. Settings expose editable amplitude expression, circular aperture radius, wavelength (nm), square grid size (samples), and sample pitch (µm). |
| Study | `/model/study` | Non-runnable collection heading. |
| Far-field hologram study | `/model/study/0` | One selectable Study row. Settings expose read-only Study identity, editable iterations (integer 1–100, default 40), editable initialization seed (unsigned 32-bit integer, default 20261110), **Run Study**, **Clear Results**, and Run history. |

Inputs and Study are the two top-level branches. Target SVG and Design parameters are selectable leaf rows directly under Inputs; do not show disclosure handles or add child rows beneath them. Design parameters selects `/model/illumination`, whose fields appear directly in the shared Settings panel. Preserve `model.illumination` in project JSON even though its user-facing tree label is Design parameters. GS iterations and seed belong to the selected Study's Settings and must not appear in a separate input row. Do not add nested drawing, shape, or configuration levels. Each input row selects its actual model object. The Study collection contains exactly one fixed item: ID `gs-study`, name `Far-field hologram study`, type `farFieldPhaseOnly`. Users cannot add, remove, rename, duplicate, or reorder this item.

The shared **Validate** action is beside the project root, as in FEM. It invokes the FullMeta Model Editor document-validation service on the active project JSON and reports structural JSON Schema and declarative GS V-rule errors in the shared validation UI. The V-rule requires grid size at `/model/illumination/gridSize` to be one of 64, 128, or 256. It is not duplicated in Study Settings. The SVG's exact propagating-disk support check remains a Study preflight because it depends on rasterized pixels; the Rust engine repeats it before iteration.

Settings are in the lower-right panel beneath Graphics Console. Selecting an input shows its editable settings. Selecting Study shows its identity, editable iterations and seed, **Run Study**, **Clear Results**, and Run history. Settings do not contain target, phase, or reconstructed-result images. Graphics Console is the upper-right display for target and Study graphics.

## Selected-Study action

Show **Run Study** and **Clear Results** at the top of Settings only when `/model/study/0` is selected. Do not show either action on Inputs, either input row, or the Study collection heading. Their accessible names are **Run Study** and **Clear Results**.

| State | Required behavior |
| --- | --- |
| Valid saved inputs and no active operation | Enabled; starts the selected Study. |
| Invalid committed project values | Disabled with a repair hint. If an invalid value is still an uncommitted Settings draft, clicking Run Study first commits that draft, then validation fails before saving or starting the native calculation and reports the first validation diagnostic. |
| Saving, switching documents, or another operation active | Disabled; explain that the current operation must finish first. |
| This Study is running | Visible and disabled; the shared Operation strip owns progress and Stop. |

**Clear Results** is enabled when the open project has one or more retained GS runs and no document operation is active. It opens a confirmation that names the current project folder and states that the retained GS run files will be removed. Cancel changes nothing. Confirm removes only this project's `gerchbergsaxton_runs/` entries owned by this Study, refreshes Run history, and clears the displayed result. It must not edit project inputs or affect any other project or application run folder.

The selected Study Settings show **Run history** below the actions. List at most the two retained completed runs, newest first. Each option's visible text is the completion timestamp formatted in the browser's local time zone, followed by `current` or `stale`; the run ID is the option's internal value and is not displayed. Selecting an option loads and validates that run's `result.json`; it does not rerun the algorithm. On project open, select and load the newest completed run by default. With no runs, show **No saved runs. Run the Study to create project results.** If a result artifact cannot be read or fails array-shape/value checks, report the error in shared application status and do not treat the artifact as a valid current result.

Before execution, commit Settings drafts, validate the active project, and save valid unsaved values through the normal Save path. Run against the saved snapshot and selected Study ID. If validation or Save fails, do not start. Do not issue a redundant Save when the document is already saved.

Keep the selected Study row and Settings visible for the full operation. The shared bottom Operation strip identifies **Gerchberg-Saxton**, reports an indeterminate running state and elapsed time, and provides **Stop** while the native Rust engine command is active. The engine runs as one registered process, so per-iteration progress is not available; on completion, report the requested iteration total. Stop terminates the registered command and prevents its result from being saved. Completion, failure, Stop, or selection changes do not force a new selection. Selecting an input during a run shows that input's view; operation status continues independently.

## Graphics Console selection behavior

Graphics Console is above Settings on the right side of the Model Editor, following FEM's layout. Its scene follows the selected tree row:

| Selected row and result state | Graphics Console content |
| --- | --- |
| Target SVG | Current binary target mask at the configured grid size, rendered black for `0` and white for `1`, with physical transverse wavevector axes `kx`, `ky` in rad/µm and Nyquist extent `±π/dx`. Show the configured centered SVG viewBox width in rad/µm and the propagating-wave circle `k₀=2π/λ` when it falls inside the plot. Display the SVG artwork upright using the standard plot convention that positive `ky` points upward. Show a visible note that SVG coordinates use a top-left origin with y increasing downward, while this plot uses Cartesian coordinates with positive `ky` upward. |
| Design parameters | Relative incident amplitude profile `A(x,y)` over the full square computational plane, including outside the aperture; draw the circular aperture boundary. Apply the hard aperture mask only in the GS calculation. Label `x` and `y` in µm, and display the physical aperture diameter and an amplitude scale from zero to maximum. Show that the Cartesian `+y` direction points upward. |
| Study collection heading | Study overview with **Select Far-field hologram study to inspect or run it.** |
| Study row, no saved completed run | Show current target mask; the phase plot is empty with **Run Study to calculate phase**, the reconstruction plot is empty with **No completed result**, and the target plot is current. |
| Study row, current completed run | Three labeled raster color maps together, ordered left to right: **Metasurface phase** wrapped to `[0, 2π)` with a phase color key; **Reconstructed hologram** intensity normalized to its maximum; and **Target hologram** (`0`/`1`). Keep each title centered over its own plot with enough horizontal spacing to avoid overlap. Phase is undefined wherever effective near-field amplitude is zero, including outside the aperture; serialize those samples as JSON `null` and render them transparent, not as phase colors. Render them with the shared `plot-2d` raster-grid mode. Draw and label coordinate axes with ticks on every graph: target and reconstructed hologram use physical `kx`, `ky` in rad/µm with extent `±π/dx`; metasurface phase uses physical `x`, `y` in µm with extent `±N dx/2`. Use the standard upward-increasing `ky` and `y` axes. Show a visible coordinate-convention note: Cartesian `+y`/`+ky` point upward, while the SVG source uses a top-left origin and rows increasing downward. Convert SVG's top-to-bottom row order to the plot's Cartesian orientation during rasterization so the M remains upright and the target and final result align. Each raster plot independently zooms around the pointer with the mouse wheel, pans with left-button drag, and resets its view on double-click; axes and ticks track the view. Keep `plot-2d`'s existing polygon-surface mode and the separate `plot-3d` widget unchanged.
| Study row, result stale after a committed input or Study setting edit | Show the current target and prior phase/reconstruction. Title the reconstruction **Previous hologram · stale** and show the banner **Inputs changed since this Study ran. Run Study again to update the phase and hologram.** Do not label prior phase/reconstruction current. |
| Study row, running with prior result | Keep the previous phase and reconstruction visible; title the reconstruction **Previous hologram · running**. Keep the current target and shared Operation progress. Without a prior result, use the no-result presentation. |

After successful completion, keep Study selected and display the saved run's target mask, phase profile, and final hologram together. Selecting Target SVG switches Graphics Console to the target mask with physical `kx`, `ky` axes; selecting Design parameters shows the full-plane amplitude profile and aperture; reselecting Study restores the selected saved run without rerunning. Do not place these graphics in Settings.

## Result identity, freshness, and failures

Persist each successful Study as `projects/<project>/gerchbergsaxton_runs/<runId>/` with `request.json`, `result.json`, then `run.json` (manifest written last). The run ID is a UTC timestamp with punctuation replaced by hyphens, a hyphen, and 12 hexadecimal characters. `run.json` records `runId`, `application: "gerchbergsaxton"`, `state: "completed"`, UTC `startedAt` and `completedAt`, `study.id` and `study.name`, `inputFingerprint`, and `artifacts: ["request.json", "result.json"]`. `request.json` is the exact validated saved project-document snapshot used for that run. `result.json` stores `size`, `wavelengthNm`, `samplePitchUm`, `targetWidthRadPerUm`, `k0RadPerUm`, `deltaKRadPerUm`, `kExtent`, and row-major `target`, `phase`, and `intensity` arrays. Phase values are JSON `null` where effective near-field amplitude is zero; intensity is normalized by its maximum propagating-bin value. Write to a new run directory; verify every required file before exposing success or selecting the new run. Never overwrite a prior run.

Retain at most the two most recent completed runs in this project's `gerchbergsaxton_runs/` folder, ordered by completion timestamp descending. The Study Settings Run history options show each completion time in local time plus current/stale status; the run ID remains an internal option value. Select the newest completed run by default on open. When the user selects an older retained run, load its checked result artifact and show that run's phase and intensity plots alongside the current target. Compare its input fingerprint to the current `model.target`, `model.illumination`, and `model.study` values and label it current or stale. Failed or cancelled attempts never replace a completed result or count toward retention. **Clear Results** confirms the exact open project, removes only this application's manifested run directories from its project-local `gerchbergsaxton_runs/` folder, and refreshes the history and Graphics Console. Disable it while a document operation is active.

Associate each run with document identity, Study ID, a fingerprint of target, illumination, iterations, and seed, grid size, binary target intensity, wrapped phase, and reconstructed intensity. Any committed result-defining input or Study setting edit makes a saved result stale. Selecting another row does not change freshness. Reloading or closing the project clears only editor memory; run files and run history remain on disk.

Only a complete successful run replaces the result. Validation, Save, calculation, cancellation, or finiteness failures must not replace a prior result with partial arrays. Report operation errors through shared status/operation feedback. A prior result remains visibly stale in Graphics Console when its fingerprint differs. Pending invalid drafts must not silently change a preview from committed project values.
