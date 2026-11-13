# Requirements

## Scope

The application lets a user specify a two-dimensional SVG target, configure a scalar far-field phase-only hologram, run GS, and inspect the target, resulting phase profile, and final hologram. It is an educational Fourier-optics example, not a full physical metasurface simulator.

## Requirements

- **GS-REQ-01 — Edit target:** Users can paste and edit one self-contained SVG string in the shared Model Editor control and set its centered physical far-field viewport width in rad/µm. The SVG control fills its Settings value column, starts 120 CSS pixels high, and is vertically resizable. Artwork size within the SVG `viewBox` determines its fraction of that span. Rasterization and the binary `0`/`1` far-field intensity target follow [contracts/scalar-far-field-gs.md](contracts/scalar-far-field-gs.md).
- **GS-REQ-02 — Configure design parameters and study:** The tree row **Design parameters** binds to `/model/illumination`. Users can edit wavelength, circular aperture radius, grid sampling, and illumination amplitude expression `A(x,y)` there. `N` is the number of samples per side; sample pitch sets the physical metasurface-plane width `L=NΔx` and far-field bin interval `Δk=2π/(NΔx)`. The wavelength sets `k₀=2π/λ` and excludes evanescent target bins. The selected Far-field hologram study exposes the iteration count and deterministic initialization seed in its Settings. `A=1` with the default inscribed circular aperture is uniform illumination over the disk; the bundled M example uses a centered Gaussian amplitude profile.
- **GS-REQ-03 — Study workflow:** A project contains one named Study row after its Inputs branch. Selecting that row exposes **Run Study**, **Clear Results**, and the retained Run history in its Settings. The actions and selection behavior follow [contracts/study-workflow.md](contracts/study-workflow.md).
- **GS-REQ-04 — Calculate hologram:** Run Study validates and snapshots the project inputs, then follows the scalar Fraunhofer and phase-only GS contract in [contracts/scalar-far-field-gs.md](contracts/scalar-far-field-gs.md).
- **GS-REQ-05 — Selection-driven graphics:** Selecting any input item shows the binary target in Graphics Console. Selecting the Study shows the target mask, metasurface phase profile, and reconstructed far-field hologram, or defined no-result/stale states. Detailed transitions are in [contracts/study-workflow.md](contracts/study-workflow.md).
- **GS-REQ-06 — Inspect results:** The selected Study's Graphics Console view shows its target, phase profile, and reconstructed hologram. Settings remain for editable input controls and the Study's Run Study action.
- **GS-REQ-07 — Repeat study:** Identical saved inputs, selected Study, and seed produce the same result within the declared numerical tolerance.
- **GS-REQ-08 — Letter M example:** A bundled example project contains a centered capital M target and a default Study; it can be opened and run in the application.
- **GS-REQ-09 — FullMeta document behavior:** Project inputs use the standard FullMeta document workflow and survive save and reopen without meaning or ordering changes. Study outputs are saved in project-local run directories, the two most recent completed runs remain available, and the latest run is restored when the project reopens.
- **GS-REQ-10 — Shared editor only:** The application uses FullMeta's existing schema editor/Model Editor and shared widgets for project structure and editing. It does not require an application-specific drawing widget or replacement editor UI.

## Exclusions

The first version has one fixed Study per project and does not offer Study creation, deletion, or sweeps. It retains two completed runs for selection and comparison. It does not model polarization, vector fields, near-field coupling, material response, fabrication constraints, meta-atom selection, or experimental measurement. The SVG is entered as a string; file import and a custom drawing canvas are outside scope.
