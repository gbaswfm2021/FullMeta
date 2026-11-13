# Gerchberg-Saxton Hologram

This FullMeta application creates a scalar, phase-only hologram using the Gerchberg-Saxton (GS) algorithm. It treats the complex field at the metasurface plane as the near field and uses a centered two-dimensional Fourier transform to calculate the far-field complex amplitude.

## Project data

A project is a JSON document with this envelope:

```json
{
  "application": "gerchbergsaxton",
  "x-fullmeta-schema": "../../applications/gerchbergsaxton/gerchbergsaxton.schema.json",
  "format": "fullmeta-hologram/1",
  "metadata": { "id": "example", "name": "Example hologram" },
  "model": {
    "target": { "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><path d=\"...\"/></svg>" },
    "illumination": { "wavelengthNm": 532, "gridSize": 256, "samplePitchUm": 1, "apertureRadius": 50, "amplitudeFunction": "exp(-((x/89.6)^2+(y/89.6)^2))" },
    "study": [{ "id": "gs-study", "name": "Far-field hologram study", "type": "farFieldPhaseOnly", "iterations": 40, "seed": 20261110 }]
  }
}
```

The `x-fullmeta-schema` path is relative to the project document. `target.svg` is the desired far-field pattern as a self-contained SVG string with a positive `viewBox`. Paste or edit it in the multiline **Target SVG** Settings field. Keep the SVG canvas transparent; artwork color is ignored. At the selected grid size, alpha coverage of at least 0.5 becomes target intensity `1`, and lower coverage becomes `0`. The application rejects malformed SVG, scripts, event-handler attributes, embedded documents, and external resource references.

`illumination.wavelengthNm` is the wavelength in nanometres. `gridSize` is a square power-of-two sample count from 64 through 256. `samplePitchUm` is the sample pitch in micrometres. `apertureRadius` is a physical radius in micrometres; the example diameter is 100 µm. The expression uses physical x and y in µm. The selected Study contains `iterations` from 1 through 100 and an unsigned 32-bit `seed`.

## Design workflow

Edit Target SVG and Illumination in their direct rows under Inputs. Edit iterations and seed in Far-field hologram study Settings. The shared **Validate** button beside the project root checks the active JSON document. Click **Run Study** in Study Settings; the application saves valid pending values before running and stores completed outputs under the project's `gerchbergsaxton_runs/` folder. The two newest completed runs appear in Run history; reopening the project restores the newest result. **Clear Results** removes the retained runs after confirmation. The upper-right Graphics Console shows the target mask, metasurface phase profile, and final reconstructed hologram while Study is selected. Select Target SVG to show its binary target with physical `kx` and `ky` axes; select Illumination to show its full-plane profile and circular aperture.

The SVG is rasterized into the binary target intensity function `I_t(x,y) ∈ {0,1}`. GS takes its square root to obtain the desired far-field amplitude. Each iteration Fourier transforms the current near field, replaces the far-field amplitude with the target amplitude while retaining the computed phase, then inverse-transforms and restores the Gaussian illumination amplitude inside the circular aperture while retaining the updated near-field phase. The final near-field phase is the metasurface phase profile. The final hologram is `|FFT(U)|²`, normalized by its maximum for display.

This is an educational scalar Fraunhofer model. It does not model polarization, near-field coupling, material response, fabrication constraints, or physical meta-atom selection. Far-field plots use physical wavevector axes `kx=2πfx`, `ky=2πfy` in rad/µm, with displayed Nyquist extent `±π/dx`.

For the complete symbol table, grid and Fourier equations, SVG-to-k-space size mapping, the exact GS constraints, wavelength's current role, and a code-reuse map, see [notes.md](notes.md). Those notes distinguish what is implemented now from physical extensions that still need a deliberate design decision.

## Implementation

The application has one Rust executable built from `gs-rust/`. Its `--run-study`, `--save-run`, and `--clear-results` entries perform the numerical calculation and project-local result storage. Cargo builds debug or release versions of this same executable. JavaScript handles the Model Editor integration, SVG-to-grid input conversion, operation controls, and graphics display; FFTs and GS iterations run in Rust.
