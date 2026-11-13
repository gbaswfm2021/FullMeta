# Letter M Hologram

This project is a simple Gerchberg–Saxton example: its far-field target is the letter **M**.

The algorithm finds a metasurface phase profile `φ(x,y)` whose far-field intensity approaches that target:

```math
I_{\mathrm{ff}}(k_x,k_y) \propto
\left|\mathcal{F}_c\!\left\{A_{\mathrm{eff}}(x,y)e^{i\phi(x,y)}\right\}\right|^2
\approx I_{\mathrm{target}}(k_x,k_y).
```

Here `A_eff` is the incident amplitude inside the circular aperture, and `F` is the two-dimensional Fourier transform to the far field.

Open `gerchbergsaxton.json` in FullMeta and run the **Far-field hologram study** to calculate the metasurface phase profile and reconstructed hologram. Results are saved in `gerchbergsaxton_runs/`.
