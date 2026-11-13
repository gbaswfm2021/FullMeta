# Scalar far-field Gerchberg-Saxton contract

This contract defines the normative optical and numerical model for GS-REQ-03.

## In plain language

The complex near field on the metasurface is Fourier transformed to obtain the complex far field. The target hologram specifies the desired far-field intensity. At every GS iteration, replace the calculated far-field amplitude with the square root of that desired intensity, while keeping the calculated far-field phase. The inverse Fourier transform returns an updated near field; reset its amplitude to the known illumination and keep its updated phase. Repeating these two amplitude constraints produces the phase-only metasurface pattern.

## Field and target

Use a scalar complex field on a uniformly sampled square grid. The user supplies the metasurface-plane illumination amplitude as a scalar expression `A(x,y)` and a circular aperture radius `R` in micrometres. For zero-based indices `j,ℓ=0,…,N−1`, sample centers are `x_j=(j+1/2−N/2)Δx`, `y_ℓ=(ℓ+1/2−N/2)Δx`. The full square has side `L=NΔx`; require `0<R≤L/2`. The hard aperture mask is `P(x,y)=1` where `x²+y²≤R²` and `0` elsewhere; the effective amplitude is `A_eff=A P`. Require `A` to be finite and nonnegative at every sampled point in the full square, and positive at least once inside the aperture. Normalize `A_eff` by its maximum inside the aperture for the phase-only design. The bundled example has `N=256`, `Δx=1 µm`, and a 100 µm aperture diameter (`R=50 µm`). An empty or missing expression means `A=1`, so the effective illumination is the circular disk mask. Support finite decimal/scientific-notation numbers, variables `x` and `y`, case-insensitive constants `pi` and `e`, unary `+`/`-`, binary `+ - * / ^`, parentheses, and calls to `abs`, `cos`, `exp`, `log`, `sin`, `sqrt`, `tan` (one argument) or `max`, `min`, `pow` (two arguments). Trigonometric arguments are radians and `log` is the natural logarithm. Use standard precedence: parentheses, right-associative exponentiation, unary signs, multiplication/division, then addition/subtraction. Reject unknown names, wrong function arity, unsupported tokens, negative samples, and non-finite samples. Parse this grammar in the application and engine; never evaluate the expression as JavaScript.

The target has a physical square viewport width `W_t = targetWidthRadPerUm` in rad/µm, default `2π rad/µm`. Map the whole SVG `viewBox` onto a centered square of side `s_t=N W_t Δx/(2π)` pixels in the `N × N` far-field grid. SVG rendering uses `preserveAspectRatio="xMidYMid meet"`; preserve the viewBox aspect ratio and center the rendered artwork on a transparent `N × N` canvas. Consequently, the SVG's artwork width as a fraction of its viewBox determines its physical k-space width as the same fraction of `W_t`. The field is centered; off-axis target placement is not supported. Require `2π/(NΔx) ≤ W_t ≤ 2π/Δx`: at least one far-field bin, and no wider than the plotted Nyquist span. A project with no stored target width uses the legacy fallback `W_t=2π/Δx` in memory; it is not written to the project file until the ordinary Save action persists it.

SVG image rows are stored top-to-bottom, but the application uses Cartesian plot coordinates with positive `y`/`ky` upward. Therefore, vertically reverse the SVG raster rows when mapping them into the computational target grid: SVG's top row maps to the largest `ky`, and its bottom row maps to the smallest `ky`. This conversion keeps an upright SVG letter upright in the target plot and makes it align with the reconstructed far field. In the row-major arrays passed to shared `plot-2d`, row zero corresponds to the smallest y-coordinate and is drawn along the bottom; subsequent rows increase upward. Apply the same row-to-coordinate convention to the metasurface-plane fields, where row zero is the smallest physical `y`.

Require a well-formed SVG XML root in the SVG namespace and a four-finite-number `viewBox` whose width and height are positive. Reject `DOCTYPE`/entity declarations; elements `script`, `foreignObject`, `image`, `iframe`, `object`, `embed`, `audio`, `video`, `feImage`, `animate`, `animateMotion`, `animateTransform`, and `set`; attributes whose lower-case name starts with `on`; non-fragment `href`/`src`; CSS imports; non-fragment CSS `url(...)`; and JavaScript URLs. Rasterize the SVG at `N×N` with `preserveAspectRatio="xMidYMid meet"` and draw its viewport into the centered square of side `s_t` on a transparent `N×N` canvas. Threshold the alpha byte at `128`: samples with alpha `≥128` have target far-field intensity `I_t(kx,ky)=1`; all other samples have `I_t(kx,ky)=0`. SVG artwork color does not change this binary occupancy rule. Set target amplitude `T(kx,ky)=sqrt(I_t(kx,ky))`, so the amplitude is also binary and normalized to a maximum of one. Reverse the SVG's top-down rows in the row-major Cartesian target array. Reject a target whose raster contains no foreground pixels.

## Propagation model

Use Fraunhofer propagation: the far-field complex amplitude is proportional to the centered two-dimensional discrete Fourier transform of the metasurface-plane field. Global scale and phase factors may be omitted because the algorithm constrains amplitude and retains relative phase. For even `N`, compute the unnormalized ordinary forward DFT

```math
F[p,q]=\sum_{j=0}^{N-1}\sum_{\ell=0}^{N-1}U[j,\ell]e^{-2\pi i(jp+\ell q)/N}.
```

Then cyclically shift both output axes by `N/2`, so output index `(N/2,N/2)` maps to `kx=ky=0`. Do not checkerboard-modulate the input. The inverse first undoes that output shift, then evaluates the inverse DFT with the `1/N²` normalization. This convention matches the SVG target and plot axes.

For a square grid with sample pitch `Δx` and size `N`, set `Δk=2π/(NΔx)`. For array indices `m,n=0,…,N−1`, assign the centered wavevectors `kx[m]=(m−N/2)Δk`, `ky[n]=(n−N/2)Δk`. DFT frequency samples are separated by `1/(NΔx)` cycles per micrometre; `kx=2πfx` and `ky=2πfy`. The displayed Nyquist extent is `[-π/Δx, +π/Δx)` on each axis (UI ticks may show rounded symmetric limits). These are wavevector coordinates, not distances on an observation plane. The optional direction-cosine view is `kx/k0`, `ky/k0`, where `k0=2π/λ`; do not substitute it for the current physical wavevector axes.

Use `k0=2π/λ`, with wavelength converted from nm to µm. A nonzero target bin is valid only when `kx²+ky²≤k0²`; reject artwork containing any nonpropagating target sample. During every far-field constraint, set bins outside the disk to zero, and show reconstructed intensity as zero there. The target preview marks the disk boundary when it falls inside the plotted Nyquist square. The bundled `N=256`, `dx=1 µm`, `λ=532 nm` case has its whole displayed square inside the disk; this is not guaranteed for other inputs. See [the formulation notes](../../docs/notes.md) for equations, units, sampling, and target-size mapping.

## Iteration

Let `A` be the fixed metasurface illumination amplitude, `T` the target far-field amplitude, and `U` the current metasurface field. Initialize `U = A exp(i phi)` from a deterministic pseudorandom phase generated from the stored seed. Use the Mulberry32 generator initialized with the unsigned 32-bit seed; consume one value for each row-major grid sample, including samples where `A=0`, and set `phi=2πr` for each returned `r∈[0,1)`.

For each requested iteration:

1. Compute `V = FFT2(U)` using the declared centering convention.
2. Inside the propagating disk, force the far-field amplitude to the target while retaining phase: `V' = T exp(i arg(V))`. Set `V'=0` outside the disk. Thus `abs(V')=T` on propagating bins and is zero elsewhere.
3. Compute `U' = IFFT2(V')` using the matching inverse convention.
4. Restore the aperture-plane field constraint: where `A > 0`, set `U = A exp(i arg(U'))`; where `A = 0`, set `U = 0`. Phase is undefined at zero amplitude and must not be interpreted or plotted there.

After the final iteration, the metasurface phase is `arg(U)` wrapped into `[0, 2 pi)` only where `A > 0`; serialize phase as JSON `null` where `A = 0`. Compute the displayed reconstruction from the centered transform's squared modulus, zero samples outside the propagating disk, and normalize by the in-disk maximum for display. Preserve the unnormalized calculation result only if the result contract explicitly records its normalization.

## Numerical behavior

Use the ordinary radix-2 Cooley–Tukey FFT on rows and then columns. The forward transform has no scale factor; the inverse applies `1/N` on each dimension (`1/N²` total). Use this normalization, the declared output shift, and Mulberry32 initialization so repeated runs of the same engine and input are deterministic. A failed or non-finite calculation must report an error and must not replace a previously completed result with partial output. JavaScript converts returned arrays to Float32 before persistence; repeat-run comparisons use absolute tolerance `1e-6` for finite phase and intensity samples.
