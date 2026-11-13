# Gerchberg-Saxton application specification

## Target

Define a FullMeta application for designing a scalar, phase-only hologram with the Gerchberg-Saxton (GS) algorithm. The editable target is a pasted SVG string rasterized into a binary far-field intensity; the Letter M project demonstrates the workflow.

This specification is the normative target for the application and its Letter M project. Acceptance evidence is recorded separately from these requirements.

## Identity

| Item | Value |
| --- | --- |
| Application ID | `gerchbergsaxton` |
| Display name | Gerchberg-Saxton Hologram |
| Application folder | `applications/gerchbergsaxton/` |
| Schema | `applications/gerchbergsaxton/gerchbergsaxton.schema.json` |

## Reading order

| Document | Purpose |
| --- | --- |
| [REQUIREMENTS.md](REQUIREMENTS.md) | Required application behavior and exclusions. |
| [PLATFORM.md](PLATFORM.md) | Shared FullMeta interfaces and options selected by this application. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Application and platform component responsibilities. |
| [DATA_MODEL.md](DATA_MODEL.md) | Persisted project inputs and generated result state. |
| [UI.md](UI.md) | Project tree, SVG and numeric inputs, Settings, and result views. |
| [VALIDATION.md](VALIDATION.md) | Input checks and user-visible errors. |
| [RUNTIME.md](RUNTIME.md) | GS execution and result lifecycle. |
| [ACCEPTANCE.md](ACCEPTANCE.md) | Observable checks for the example application. |
| [Behavior replay protocol](contracts/behavior-replay-protocol.md) | Project-derived Level 2 test cases, UI selection sequences, freshness variants, and deterministic result comparisons. |
| [Formulation notes](../docs/notes.md) | Explanatory derivation, symbols, units, sampling, and implementation map. The scalar GS contract remains normative if wording differs. |

## Detailed contracts

| Concern | Contract |
| --- | --- |
| Fourier propagation and phase-only GS iteration | [Scalar far-field GS](contracts/scalar-far-field-gs.md) |
| Tree, selected-Study action, Graphics Console scenes, progress, and result freshness | [Study workflow](contracts/study-workflow.md) |
| How to specify this pattern for another application | [Reusable selection-driven study pattern](contracts/selection-driven-study-pattern.md) |

Every document in the reading order and the two GS behavior contracts is normative for this application. If duplicated summaries conflict, resolve the behavior from the owning detailed contract: numerical and optical behavior from `scalar-far-field-gs.md`; tree, actions, result lifecycle, and selection-to-graphics behavior from `study-workflow.md`; persisted field names and types from `DATA_MODEL.md`; shared-platform ownership from `PLATFORM.md`. `ACCEPTANCE.md` verifies those requirements and does not create alternate behavior. `docs/notes.md` explains the derivation and current implementation for scientists and future agents; it is explanatory and does not override the contracts. The reusable pattern guide is authoring guidance for other applications, not an additional GS requirement. The [application specification convention](../../../platform/docs/application-specifications.md) defines the common document set used by FullMeta applications. The [FEM specification](../../fem/specification/README.md) is the reference for the project-root tree, selected-Study-row actions, saved run history, Clear Results, and selection-driven workflow. FEM-only solver and mesh behavior does not apply here.

## Reference for similar applications

Use this application as a worked example when another application needs editable inputs in the project tree, a selectable Study item with a contextual run action, and a Graphics Console that follows tree selection. Start with the reusable pattern guide, then read the concrete [Study workflow contract](contracts/study-workflow.md) to see those rules resolved into exact paths, states, and outcomes. The [scalar far-field GS contract](contracts/scalar-far-field-gs.md) is specific to hologram physics and should not be copied into another domain.

## Acceptance and evidence

The required application behavior is defined by these contracts. Acceptance has two required levels: schema acceptance, followed by project-based behavior replay. The replay protocol names the project inputs, tree selections, Study runs, result checks, and deterministic comparisons required for conformance. Any expected outcome not decided by a contract is a specification gap and must be resolved here before it can pass acceptance.

For the two required acceptance levels, begin with [ACCEPTANCE.md](ACCEPTANCE.md). The dated [acceptance and replay report](../implementation/acceptance-replay-2026-11-10.md) records evidence from one tested application candidate; the normative criteria and replay cases remain in this `specification/` folder.

## Maintaining this set

Keep the public user guide in `docs/README.md` aligned with delivered behavior. The specification describes the target application independently of the current implementation and is the source for future changes and acceptance.
