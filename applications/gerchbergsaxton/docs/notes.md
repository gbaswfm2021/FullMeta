# Gerchberg-Saxton Hologram

These notes state the mathematical model used by Gerchberg–Saxton Hologram and connect each part to the code that implements it. They are intended for scientists reviewing or reusing the formulation and for future agents extending the application. They describe the current implementation explicitly; limitations are identified below.

The normative numerical contract is [the scalar far-field GS contract](../specification/contracts/scalar-far-field-gs.md). If code or these notes disagree with that contract, resolve the discrepancy deliberately and update the contract, notes, and implementation together.

## 1. Model and scope

The model designs a scalar, coherent, monochromatic, phase-only field on a sampled metasurface plane. It approximates propagation to the far field by a centered two-dimensional discrete Fourier transform (DFT), retaining only propagating wavevectors. Gerchberg–Saxton (GS) alternates between a fixed near-field amplitude constraint and a specified far-field amplitude constraint.

This is a scalar Fourier-optics design example. It does not calculate a finite-distance Fresnel field, vector polarization, material dispersion, meta-atom response, phase quantization, fabrication error, or coupling between meta-atoms. Wavelength sets the propagating-wave disk; see [Wavelength and physical interpretation](#7-wavelength-and-physical-interpretation).

## 2. Symbols and units

| Symbol | Meaning | Units / allowed values |
|---|---|---|
| `N` | Number of samples along each side of the square computational grid | 64, 128, or 256 |
| `Δx` | Metasurface-plane sample pitch; the y pitch is also `Δx` | µm, positive |
| `L` | Side length of the sampled square, `L = N Δx` | µm |
| `j, ℓ` | Sample indices along x and y | `0,…,N−1` |
| `xⱼ, yℓ` | Physical sample-center coordinates | µm |
| `R` | Circular metasurface aperture radius | µm, `0 < R ≤ L/2` |
| `A(x,y)` | User-specified incident amplitude profile | nonnegative scalar amplitude |
| `P(x,y)` | Circular aperture indicator | 0 or 1 |
| `Aₑff(x,y)` | Aperture-limited, normalized illumination amplitude | nonnegative scalar amplitude |
| `Uⱼℓ` | Complex field at a metasurface sample | complex amplitude |
| `φⱼℓ` | Phase of the metasurface field | radians, wrapped to `[0, 2π)` when displayed |
| `m,n` | Centered far-field frequency-bin indices | `−N/2,…,N/2−1` for even `N` |
| `kₓ,m, kᵧ,n` | Transverse wavevector coordinates of a far-field sample | rad/µm |
| `Wₜ` | Physical width of the centered square wavevector span represented by the SVG `viewBox` | rad/µm |
| `Iₜ(kₓ,kᵧ)` | Desired binary far-field intensity from the SVG, inside the propagating disk | 0 or 1 |
| `T(kₓ,kᵧ)` | Desired far-field amplitude, `sqrt(Iₜ)` after max normalization | relative amplitude |
| `λ` | Free-space wavelength entered by the user | µm in equations; UI stores nm |
| `k₀` | Free-space wavenumber, `2π/λ` | rad/µm |

The symbols `x,y` always describe the metasurface plane. The target is a function of `kₓ,kᵧ`, not `x,y`; keeping these coordinates distinct avoids confusing the input plane with the far-field plane.

## 3. Computational grid and sampling

The grid contains `N × N` samples. `N=256` means 256 samples along x and 256 along y. It is not a physical square whose side is 256 µm unless `Δx=1 µm`. The sampled metasurface-plane side is

```math
L = N\,\Delta x.
```

The current engine places sample centers at

```math
x_j = (j + \tfrac12 - \tfrac N2)\,\Delta x,\qquad
y_\ell = (\ell + \tfrac12 - \tfrac N2)\,\Delta x,
\quad j,\ell=0,\ldots,N-1.
```

The half-sample offset places the origin between the four central samples for even `N`. The plotted full-plane limits are shown as approximately `[-L/2, L/2]`.

The DFT frequency-bin spacing and Nyquist bound are

```math
\Delta k_x = \Delta k_y = \frac{2\pi}{N\,\Delta x}=\frac{2\pi}{L},\qquad
|k_x|,|k_y|\lesssim k_{\rm Nyquist}=\frac{\pi}{\Delta x}.
```

Thus `N` and `Δx` do different jobs; neither is redundant:

- At fixed `Δx`, increasing `N` makes the sampled physical plane wider and the k-space samples closer together. The Nyquist bound stays fixed.
- At fixed `N`, decreasing `Δx` makes the physical plane narrower, widens the represented k-space range, and makes its k-space samples farther apart.

For the bundled values `N=256` and `Δx=1 µm`, `L=256 µm`, `Δk≈0.02454 rad/µm`, and each axis has a Nyquist bound of approximately `±3.1416 rad/µm`. The 100 µm diameter aperture fits inside this square. These values are sampling choices, not a claim that the fabricated metasurface has 256 physical meta-atoms per side. The Schema Editor's declarative model V-rule accepts exactly `N∈{64,128,256}`; the engine repeats this supported-grid check before it allocates fields.

## 4. SVG target and its plotted size

The target SVG is unitless artwork. The rasterizer preserves its `viewBox` aspect ratio, centers it on a transparent `N × N` square, and thresholds alpha coverage at 0.5:

```math
I_t[k_x(m),k_y(n)] =
\begin{cases}
1,&\text{rasterized SVG alpha}\ge 0.5,\\
0,&\text{otherwise.}
\end{cases}
\qquad T[m,n]=\sqrt{I_t[m,n]}.
```

SVG rows are stored top-to-bottom (`+y` downward). The rasterizer reverses rows when filling the Fourier target array so that Cartesian `+kᵧ` points upward. Artwork color is ignored; transparent SVG space is target intensity zero.

The editable `targetWidthRadPerUm = Wₜ` sets the physical side width of the square k-space span represented by the complete SVG viewport. The SVG itself remains unitless: the width and height of its artwork *relative to its `viewBox`* determine the actual target width and height. For example, a centered letter occupying 70% of the `viewBox` width occupies approximately `0.7 Wₜ` in `kx`. Enlarging the SVG `viewBox` around unchanged artwork therefore makes the letter smaller within the same physical span; tightening it makes the letter larger. The implementation centers the viewport and the artwork, so off-axis target placement is not part of this model. The full viewport is rasterized to a centered subset of the `N × N` far-field array; its plotted axes remain set by `Δx`. Existing project JSON without this property is migrated in memory on open to `Wₜ=2π/Δx`, preserving the earlier full-Nyquist mapping; an ordinary project Save persists the new field.

If artwork spans a fraction `s` of the SVG viewport width, its physical target width is approximately `s Wₜ`; a target `p` bins wide spans approximately `p Δk`. This is a width in transverse wavevector, not a screen or image-plane length. The allowed viewport width lies between one bin `Δk` and the plotted Nyquist span `2π/Δx`.

## 5. Incident amplitude and aperture constraint

The user enters an amplitude expression `A(x,y)` with `x,y` in µm. The circular aperture is

```math
P(x,y)=\begin{cases}1,&x^2+y^2\le R^2,\\0,&x^2+y^2>R^2.\end{cases}
```

The near-field amplitude used by the GS calculation is

```math
A_{\rm eff}(x,y)=\frac{A(x,y)P(x,y)}{\max_{x,y}\{A(x,y)P(x,y)\}}.
```

It is zero outside the aperture in the GS field. The **Design parameters** view intentionally plots the incident expression over the full square and overlays the aperture circle so users can inspect the beam outside the fabricated aperture; those outside samples do not enter the constrained near field. The expression must be finite and nonnegative at every sampled point in the full square, with at least one positive sample inside the aperture.

The bundled Gaussian amplitude is

```math
A(x,y)=\exp\!\left[-\left(\frac{x}{89.6\,\mu\mathrm m}\right)^2
                  -\left(\frac{y}{89.6\,\mu\mathrm m}\right)^2\right].
```

This is an **amplitude** profile, not an intensity profile. Its intensity is proportional to `|A|²`. The application normalizes `Aₑff` by its maximum before the phase-only calculation.

## 6. Centered DFT and Gerchberg–Saxton iteration

The intended physical transform maps the centered metasurface grid to a centered `kx,ky` grid. Up to the omitted global quadrature factor `Δx²`, its Fourier-sum interpretation is

```math
\widetilde U(k_{x,m},k_{y,n})
\;\propto\;
\sum_{j=0}^{N-1}\sum_{\ell=0}^{N-1}
U_{j\ell}\,\exp[-i(k_{x,m}x_j+k_{y,n}y_\ell)],
```

where the displayed centered bin coordinates are

```math
k_{x,m}=(m-N/2)\,\Delta k,qquad
k_{y,n}=(n-N/2)\,\Delta k,
\quad m,n=0,\ldots,N-1.
```

For even `N`, the implementation takes the ordinary 2D DFT and applies a half-grid cyclic shift to its output so array index `(N/2,N/2)` is `kx=ky=0`. The inverse first undoes that output shift and then applies the inverse DFT. There is no checkerboard modulation of the input. This is the same centered-bin convention used by the target raster and plotted axes. An origin offset by half a cell contributes only a linear phase ramp across Fourier bins, not a change in the far-field intensity; the phase-only target does not prescribe that far-field phase.

Omitting `Δx²` does not alter the phase-only GS constraints or the normalized displayed intensity; it would matter when reporting calibrated absolute optical power.

The iteration is:

```math
U^{(0)}_{j\ell}=A_{\rm eff}(x_j,y_\ell)\,e^{i\phi^{(0)}_{j\ell}},
```

where `φ⁽⁰⁾` is deterministic pseudo-random phase from the saved seed. For `t=0,…,N_iter−1`:

```math
V^{(t)}=\mathcal F_c\{U^{(t)}\},
```

```math
V'^{(t)}_{mn}=\begin{cases}T_{mn}e^{i\arg(V^{(t)}_{mn})},&k_{x,m}^2+k_{y,n}^2\le k_0^2,\\0,&\text{otherwise,}\end{cases}
```

```math
U'^{(t)}=\mathcal F_c^{-1}\{V'^{(t)}\},\qquad
U^{(t+1)}_{j\ell}=A_{\rm eff}(x_j,y_\ell)\,e^{i\arg(U'^{(t)}_{j\ell})}.
```

Here `𝓕c` is the centered DFT convention above. The far-field step replaces amplitude and retains computed phase; the near-field step restores the specified illumination amplitude and retains the updated phase. Outside the aperture `Aₑff=0`, so `U=0` and its phase is undefined.

After the final iteration the application stores wrapped phase only on illuminated samples and stores `null` outside the aperture:

```math
\phi_{j\ell}=\arg(U_{j\ell})\bmod 2\pi\quad\text{if }A_{\rm eff}(x_j,y_\ell)>0;
\qquad \phi_{j\ell}=\mathrm{null}\quad\text{otherwise.}
```

The reconstructed display is

```math
I_{\rm rec}[m,n]=
\frac{|\mathcal F_c\{U\}_{mn}|^2}
     {\max_{m,n}|\mathcal F_c\{U\}_{mn}|^2}.
```

It is normalized for viewing, not calibrated absolute intensity. The target and reconstruction are intensity plots; their amplitudes in the iteration are square roots of their intensities.

## 7. Wavelength and physical interpretation

The free-space wavenumber and direction-cosine coordinates are

```math
k_0=\frac{2\pi}{\lambda},\qquad
q_x=\frac{k_x}{k_0},\qquad q_y=\frac{k_y}{k_0}.
```

For a propagating plane wave, `qₓ²+qᵧ²≤1`; `qₓ,qᵧ` are the transverse components of its unit propagation direction. A far-field coordinate in direction-cosine space maps approximately to a screen coordinate by `X≈z qₓ`, `Y≈z qᵧ` at distance `z` in the paraxial regime. For a lens, the corresponding back-focal-plane scale is approximately `X≈f qₓ`, `Y≈f qᵧ`. These approximations require distance or focal length information that this application does not currently request.

**Implemented wavelength behavior:** `wavelengthNm` determines `k₀` and therefore the propagating-wave disk in the far-field plane. The target must have zero samples outside `kx²+ky²≤k₀²`; a Study with nonzero target samples outside the disk is rejected with a diagnostic. Each GS far-field constraint sets all outside-disk samples to zero, and the displayed reconstructed intensity is zero there. The target preview marks the boundary when it falls inside the plotted Nyquist square. Wavelength does not change the `kx,ky` bin coordinates themselves, which remain determined by `N` and `Δx`.

For the bundled defaults `λ=532 nm=0.532 µm`, `k₀≈11.81 rad/µm`. With `Δx=1 µm`, the largest radial k at a displayed Nyquist-square corner is `√2π/Δx≈4.44 rad/µm`, so the complete display square is propagating. At longer wavelengths or smaller sample pitch, the disk can cut across the square; target bins outside it must be removed by changing target width/artwork or wavelength/sampling inputs rather than silently clipped.

## 8. Reuse map for future work

Before adding another implementation, reuse the existing modules and contracts:

| Formulation component | Existing implementation |
|---|---|
| SVG parsing, sanitization, alpha rasterization, row-orientation conversion | [`../js/gs.js`](../js/gs.js), `rasterizeTargetSvg` |
| Target, illumination, grid, wavelength, and Study schema | [`../gerchbergsaxton.schema.json`](../gerchbergsaxton.schema.json) |
| FFT kernels and centered-bin convention, deterministic initialization, aperture-limited amplitude, propagating-disk constraint, GS loop, output intensity and phase | [`../gs-rust/src/main.rs`](../gs-rust/src/main.rs), especially `forward_centered`, `inverse_centered`, `illumination_profile`, and `calculate_study` |
| JavaScript/Rust input and saved-run integration | [`../package.js`](../package.js) |
| Normative algorithm and data rules | [`../specification/contracts/scalar-far-field-gs.md`](../specification/contracts/scalar-far-field-gs.md) |

For a future change, first decide whether it changes the mathematical model or only its presentation. Update the normative contract and these symbol definitions before changing the Rust calculation. Keep unit conversions explicit at the JavaScript/Rust boundary. Reuse the centered FFT path and preserve the physical SVG-span-to-grid mapping; do not scale only the drawing while leaving the numerical target unchanged. If adding a physical propagation model, cover nonpropagating bins explicitly and record whether results are normalized or absolute.

## References

- [TUDelft Interactive Optics, Scalar Diffraction Optics](https://interactivetextbooks.tudelft.nl/interactive-optics/content/Chap6_Diffraction/DiffractiveOptics_2022_01Clean.html) derives the Fraunhofer transform and its mapping between observation-plane position and spatial frequency.
- [Fourier-transform metasurface holography](https://link.springer.com/article/10.1186/s43074-020-00016-8) expresses the far field in angular coordinates and relates those coordinates to the metasurface Fourier transform.
