# FullMeta model editor

**Current platform update, 8 November 2026:** the workspace and document editors use the shared React/JSX and WebMCP framework. Start with [the current interface guide](platform/workspace/docs/README.md) and [workspace files/layouts](platform/workspace/docs/workspace-files-and-layout.md). The FEM application schema has deliberately been cleared for its later specification-driven build; retained FEM implementation details below are historical/reference material until that build is accepted. Checked native-operation pilots are a separate, limited boundary acceptance.

FullMeta is a local browser workspace for application documents. FEM project models declare `modelFormat: "fem-model/2"`, and the launcher opens them through the shared `platform/loader.html` document host. The host resolves the interpreting schema and mounts its catalog-selected editor. The Model Editor widget edits both project models and model schema documents. Five FEM scenarios support editor and command-line Study runs: 2D/3D electromagnetics, 2D/3D acoustics, and stationary 2D thermal conduction. Start with the [current system notes](platform/workspace/docs/README.md) for architecture and component ownership.

## Run

On Windows, double-click `launch.cmd` to start FullMeta and open the scenario launcher. Or run `npm start` from this folder to build the Rust Kernel server if needed, start it in the background, and return to the prompt. Use `npm run server:status` to inspect the listener and `npm stop` to stop FullMeta. The Kernel owns the public HTTP port, handles registered routes, and links `core-rust`; browser expression and quantity work continues to use WASM locally. The stop command identifies managed servers by their process record and Kernel status API, and can still identify an older direct Node server left running by a previous version. Unrelated listeners are left alone. The launcher is at `http://127.0.0.1:8765/`. All profiles and existing projects open through `platform/loader.html`, which mounts the selected editor widget.

On the launcher, use the FEM card to create a project, choosing its physics and a supported dimension in the creation dialog. Entering an existing project folder adds a FEM model if none of its direct JSON files already declares the FEM application; otherwise creation reports that FEM already exists in that folder. Existing files are preserved, and a free FEM filename is chosen when `fem_model.json` is occupied. Project cards show their folder names, applications, and actions. Opening a project with one model JSON opens it directly; projects with several model JSON files show a chooser with each filename and application. The shared `platform/loader.html` host opens the selected file, resolves its application and interpreting schema, and starts the editor declared by that schema.

## Project files

Application model JSON files are stored directly in `projects/<project-id>/`. New FEM projects start with `fem_model.json`; other model filenames can live alongside it. Discovery identifies model documents by their `application` and `modelFormat` fields and skips unrelated JSON files and generated subfolders. Each selected filename is preserved in the editor URL and ordinary Save updates that file.

Only the FEM application package is currently installed. Its Study runner still requires `fem_model.json`; other filenames can be opened and edited, while unsupported execution is disabled. Save As and project-folder renaming currently require a single default model document. FullMeta writes compiled geometry, mesh, and Study artifacts into timestamped folders under `fem_runs/`; each run uses stable filenames inside its own `mesh/` folder. Saved figures go to `fem_results/`. Clearing generated results affects every model in the project folder. Other files, such as COMSOL references, can stay in the project folder.

The workspace discovers the current project/model files. See [workspace files and navigation](platform/workspace/docs/workspace-files-and-layout.md) for the folder layout.

## File identity and interpreting schemas

Each model selects its interpreting schema through `x-fullmeta-schema`, relative to that model JSON. The server follows its `$ref` graph for scenario declarations and resolves external programs/resources from schema metadata. `application.json` has been retired.

Canonical opened-file IDs select independent document Kernel contexts and retained schema/validation state. A busy file cannot be reopened; another model or its interpreting-schema source can be opened independently. Running native operations retain their schema snapshots. Model Editor shows only the opened file ID in its title for either document mode. See [Document Kernels and interpreting schemas](platform/docs/kernel-contexts-and-interpreting-schemas.md) for storage ownership, WASM responsibilities, and lifetime rules.

## Batch Study runner

Build the complete local runtime once, then run a project without opening the editor:

```powershell
npm run build:runtime
applications/fem/.runtime/x86_64-pc-windows-gnu/release/fullmeta-fem.exe SRR_tr_unit1
# Validation only: no geometry preflight, mesh generation, or solve
applications/fem/.runtime/x86_64-pc-windows-gnu/release/fullmeta-fem.exe SRR_tr_unit1 --validate
```

The build command compiles the shared model/core WASM modules and registered application executables for this machine's Windows x64 GNU target. Shared platform build outputs and Cargo cache live under `platform/.runtime/`; application-specific runtime outputs live under each application's `.runtime/` directory, such as `applications/fem/.runtime/`. Each application registers its native build targets through `applications/catalog.json` and its app-local runtime build plan. The FEM dispatcher reads the selected model schema and its embedded profile definitions at runtime to select a scenario executable. `npm start` starts the HTTP server; it does not compile Rust tools. Rebuild affected runtimes after changing Rust code.

A new scenario that fits existing shared contracts can supply its own schema and separately compiled executable. Import its schema through the selected root's `$ref` graph, register its executable in `x-fullmeta-runtime.externalPrograms`, select that registry ID through the scenario's `programId`, and register its result adapter in schema resources. Add shipped executables to the explicit build/package lists. New common algorithms or contracts require rebuilding their owning libraries. See [the scenario extension instructions](applications/fem/fem-rust/README.md#add-a-scenario-executable).

The CLI reads the selected project's `fem_model.json`; the browser editor sends its current model snapshot to `fullmeta-fem --server`. Both delegate validation, mesh preparation, solving, and result collection to the selected scenario executable. A CLI Study run automatically checks the model, prepares or reuses its mesh, runs the profile's solver, and writes results under the project's `fem_runs/`. `fullmeta-fem.exe <project> --validate` validates only and exits without meshing or solving. Use `fullmeta-fem.exe --help` for command-line options.

The editor's **Validate** action sends its current model snapshot to the Rust server's generic command runner, which invokes the schema-registered `fullmeta-fem --validate -` command. Native validation checks model structure, schema-declared semantic rules, scenario registration and sibling model-ID conflicts. The Rust server passes the opened document path as generic process context; the FEM native validator applies the sibling identity rule. Validation does not save the model, prepare a Study or check solver executable availability. Browser model WASM continues to supply local edit validation, schema navigation and edit transactions. Save retains its file identity and content-hash checks.

The runtime build lists `thermal2d` explicitly. To rebuild only that executable, retain Cargo's default features:

```powershell
cargo +stable-x86_64-pc-windows-gnu build --release --offline --locked --target x86_64-pc-windows-gnu --target-dir applications/fem/.runtime --manifest-path applications/fem/fem-rust/Cargo.toml --bin thermal2d
applications/fem/.runtime/x86_64-pc-windows-gnu/release/thermal2d.exe thermal_project --validate
applications/fem/.runtime/x86_64-pc-windows-gnu/release/fullmeta-fem.exe thermal_project --study stationary1
```

Create a thermal project in the launcher, define geometry, materials and temperature/heat-flux boundaries, configure its Stationary Study, and use **Run study**. The solver uses linear triangles and constant isotropic material conductivity, supports constant parameter expressions and zero-phase periodic temperature equality, and writes a temperature/flux field plus summary CSV. See [the thermal executable contract](applications/fem/fem-rust/README.md#thermal-2d) for boundary, reference-temperature and numerical limits.

The shared quantity core represents SI dimensions as five exponents `[m, kg, s, A, K]` and accepts legacy four-exponent JSON vectors with a zero temperature exponent. Install this framework change with one `npm run build:runtime`; later scenario additions using these shared contracts can compile their own executable independently.

Result-specific behavior is loaded from `x-fullmeta-runtime.resources.resultAdapters`: `*` selects `applications/fem/js/results/harmonic-fields.js`, and `thermal-2d` selects `applications/fem/js/results/thermal-fields.js`, relative to the FullMeta main folder. These application modules own artifact interpretation, file selection and stationary/frequency presentation.

## Code layout

- `index.html` opens the universal document host at `platform/loader.html`. The root `index.json` selects `platform/workspace/workspace.schema.json`; workspace JavaScript and documentation are under `platform/workspace/`. Applications are discovered from their individual `catalog.json` descriptors. The editor implementation belongs to `platform/ui/widgets/`, and `platform/kernel-server-rust/` builds the public local API and file server.
- `platform/js/` holds application-neutral editor infrastructure and document-navigation helpers. `platform/core-rust/js/` and `platform/model-rust/js/` expose their libraries' public JavaScript APIs, loading deployed binaries from each library's `wasm/` folder. Compiler output stays in `platform/.runtime/`. Shared plot and table widgets live under `platform/ui/widgets/`. FEM-specific browser and server adapters live under `applications/fem/js/`.
- `platform/model-rust/` supplies generic schema/rule validation, document-reference bundling, navigation and schema-directed edit transactions. `applications/fem/js/model/model-schema.js` supplies FEM interpretation and browser validation inputs. Native callers load their selected root and local `$ref` graph. The editor's **Validate** action invokes the schema-registered native validator through the Rust Kernel command runner.
- `applications/fem/fem-rust/src/model_validation.rs` provides common FEM geometry, reference, and expression checks. The four existing solver modules (`em2d.rs`, `em3d.rs`, `acoustic2d.rs`, and `acoustic3d.rs`) contain their scenario's non-schema semantic rules alongside their numerical implementations; `thermal2d.rs` owns thermal schema binding, validation, and solving.
- `applications/fem/mesh-rust/` is the standalone Rust command-line project for model JSON to `.geo` plus map, Gmsh meshing, and versioned FullMeta `.mesh` export. `applications/fem/fem-rust/` builds the routing-only `fullmeta-fem` dispatcher and five scenario executables, including `thermal2d`. Browser mesh integration helpers live in `applications/fem/js/mesh-rust/`.
- `fullmeta-fem` reads runtime scenario registrations and dispatches to the selected scenario executable. That executable owns validation, project/run folders, Study orchestration, and output collection. The editor uses `--server` mode; command-line users run a project folder directly. Scenario executables invoke the separate `fullmeta-mesh` executable for geometry and mesh generation.
- The browser FEM package sends registered mesh commands to the Rust Kernel, which runs the FEM executables registered under `applications/fem/.runtime/` for geometry compilation and preview meshing. Gmsh meshing uses one thread and random seed 1 for repeatable outputs.
- `fullmeta.css` contains the shared theme, reset, brand, and header styles. `model-editor.css` contains launcher and Model Editor styles.
- `applications/fem/` owns the FEM schema, native programs, documentation and [target application specification](applications/fem/specification/README.md). The application build remains paused; its specification defines the application-owned UI and runtime modules to deliver.

See the [system notes index](platform/workspace/docs/README.md), [architecture](platform/docs/architecture.md), [schema-document editing guide](platform/schema-editor/docs/schema-document-editing.md), [Model 2 contract](applications/fem/docs/fullmeta-model-2.md), and [current mesh formats](applications/fem/docs/fullmeta-mesh-1.md). The retired Program Editor sources are kept in [`backup/program-editor-retirement-2026-10-28/`](backup/program-editor-retirement-2026-10-28/README.md).

## Folder map

| Folder | Role |
| --- | --- |
| `projects/` | Project documents and application-owned artifacts, including nested branches. See [workspace files and navigation](platform/workspace/docs/workspace-files-and-layout.md). |
| `platform/` | Shared FullMeta editor, services, UI, schemas and build outputs under `platform/.runtime/`. |
| `platform/ui/widgets/` | Shared widget packages, each with its public interface, implementation and specific contracts; `catalog.json` lists them. |
| `platform/ui/schemas/` | Cross-widget UI annotation and catalog contracts, with common validation support. |
| `applications/fem/ui/widgets/` | FEM widget packages and catalog, following the same layout as platform widgets. |
| `applications/fem/` | FEM application package: schemas, UI profiles, widgets, graphics, actions, and icons. |
| `platform/model-rust/` | Rust/WASM model-schema and edit-transaction layer. See [`platform/model-rust/README.md`](platform/model-rust/README.md). |
| `tests/` | Automated software-contract and regression checks. See [`tests/README.md`](tests/README.md). |
| `scripts/` | Build, launch, packaging and maintenance tools; development dependencies live in `scripts/node_modules/`. See [`scripts/README.md`](scripts/README.md). |
| `docs/` | Human-readable model, mesh, architecture, and implementation notes. |
| `backup/` | Retained historical snapshots and archived reference data; not part of the normal editor workflow. |
| `tmp/` | Scratch files from manual debugging and verification; not a runtime data location. |

The repository-root `data/` folder has been archived under `backup/data-archive-2026-10-14/`. Current project outputs belong under each project's `fullmeta_*` folders.

## Verify

Run `npm run verify` to execute the current FullMeta software-contract/regression checks. They cover schema and editor/engine behavior but do not run a full FEM study or compare T/R against a numerical reference suite; that release-validation suite remains future work.

Tests and numerical reference comparisons were not run for the thermal integration.
