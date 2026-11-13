# Reusable selection-driven Study specification pattern

This guide shows how to specify an application where project inputs appear in a tree, a Study has an action available when selected, and the Graphics Console changes with the selected item. The Gerchberg-Saxton application is the worked example: its [Study workflow contract](study-workflow.md) is the concrete, normative instance. Use this guide as authoring advice for other application specifications; do not treat GS-specific names, paths, algorithm, or choices as universal FullMeta requirements.

## When to use this pattern

Use it when the tree is both an editor-navigation structure and a selector for what the Graphics Console displays. A typical project has editable input rows and one or more analysis rows. Selecting an analysis row exposes an operation such as **Run Study**; after completion, selecting that row shows its result, while selecting an input shows its input preview.

If the application has no operation, no selectable result item, or no selection-driven graphics, specify only the relevant parts rather than adopting the entire pattern.

## Where to specify it

Keep the common application specification documents and their roles as defined by the [application specification convention](../../../../platform/docs/application-specifications.md). Link one detailed contract from `specification/README.md` and from the relevant core documents:

- `REQUIREMENTS.md`: stable requirement IDs for the Study workflow, contextual operation, selection-driven scene, and result freshness.
- `DATA_MODEL.md`: identify persisted inputs and Study identity separately from transient progress, graphics selection, and calculated results.
- `UI.md`: summarize the tree and visible interaction; link to the detailed contract for exact states.
- `RUNTIME.md`: summarize operation preconditions and outputs; link to the contract for the end-to-end lifecycle.
- `ACCEPTANCE.md`: turn every state and transition in the contract into observable checks.

Keep detailed rules in one contract instead of repeating slightly different versions across these entry documents. The main `README.md` should identify the contract as normative for this application and point specification authors of similar applications to it as an example.

## Specify behavior without interaction ambiguity

State the behavior so the application has no unspecified interaction choices. Include these definitions, adapting each to the application:

1. **Tree and model paths.** Give the exact tree order, row labels or label rules, model paths, whether each row is selectable/editable, and any fixed IDs, counts, or collection behavior. State which nodes group children and which identify input or Study data.
2. **Contextual action.** Identify the exact selected row that exposes the action, its Settings placement and accessible name, and rows where it is absent. Specify disabled states and explanatory reasons.
3. **Preconditions and snapshot.** Define how drafts are committed, validation is run, dirty inputs are saved, and the operation resolves the selected Study and input snapshot. State what happens when validation or save fails.
4. **Operation lifecycle.** Name the progress surface, progress units and update points, cancellation behavior, terminal states, and what happens to an earlier result on stop or failure. Say whether selection can change while the operation runs and what completion does to that selection.
5. **Selection-to-scene mapping.** Include a table covering every meaningful selected-row class and result condition. For each, name the Graphics Console scene, including no-result and stale-result states. State whether changing selection hides, restores, or discards a result.
6. **Result identity and freshness.** Define which document, Study, and input revision own a result; exactly which edits make it stale; how stale output is labeled; and whether results survive save, close, or reload.
7. **Diagnostics and errors.** Specify where run diagnostics appear, their names and units, and how validation, numerical, and operation errors are presented.

Do not leave these as vague outcomes such as “show the appropriate result” or “run the selected study.” Name the paths, states, visible outcomes, and transitions.

## Derive acceptance from the contract

Make acceptance cases for each row of the scene-selection table and each operation transition. A compact minimum set is:

- Open a new project and verify exact tree order and Study identity.
- Select each input class and verify the specified input scene.
- Select the Study before any run and verify the action and no-result scene.
- Run successfully and verify progress, terminal status, diagnostics, result scene, and unchanged selection.
- Select an input after success, then reselect the Study; verify the input scene and restoration of the current result without rerunning.
- Edit a result-defining input and verify stale handling.
- Exercise validation failure, save failure, stop, and numerical failure; verify the operation state and prior-result policy for each.
- Close and reopen the project to verify the declared result lifetime.

Link each case to the requirement and contract rule it demonstrates. Keep the algorithm's numerical acceptance in a separate domain contract when it has independent equations, conventions, or tolerances.

## How to use the GS example

The [GS Study workflow contract](study-workflow.md) demonstrates a concrete tree with the project name at the root, a single fixed Study, **Run Study** and **Clear Results** actions, a two-run history, progress and stop behavior, and a complete Graphics Console selection table. Its exact `/model/...` paths, **Far-field hologram study** label, project-local run storage, and target-pattern/far-field scenes are decisions for this example. Replace them with the target application's own data paths, operation contract, scenes, and retention policy. Retain the explicit mapping and lifecycle structure so selection and results behave predictably.

The [scalar far-field GS contract](scalar-far-field-gs.md) defines the Fourier propagation and GS constraints. It is a separate domain-specific example, not part of this reusable UI/runtime pattern.
