function parseTargetSvg(source) {
  if (typeof source !== 'string' || !source.trim()) throw new Error('Paste an SVG target before running the Study.');
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('The SVG target cannot contain a document type or entity declaration.');
  const parsed = new DOMParser().parseFromString(source, 'image/svg+xml');
  if (parsed.querySelector('parsererror') || parsed.documentElement?.localName !== 'svg'
    || parsed.documentElement.namespaceURI !== 'http://www.w3.org/2000/svg') throw new Error('Target SVG must be well-formed XML with an SVG <svg> root element and namespace.');
  const root = parsed.documentElement;
  const viewBox = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  if (viewBox.length !== 4 || !viewBox.every(Number.isFinite) || viewBox[2] <= 0 || viewBox[3] <= 0) throw new Error('Target SVG must declare a viewBox with positive width and height.');
  const forbidden = new Set(['script', 'foreignObject', 'image', 'iframe', 'object', 'embed', 'audio', 'video', 'feImage', 'animate', 'animateMotion', 'animateTransform', 'set']);
  for (const element of [root, ...parsed.querySelectorAll('*')]) {
    if (forbidden.has(element.localName)) throw new Error(`Target SVG element <${element.localName}> is not supported.`);
    if (element.localName === 'style') {
      const css = element.textContent || '';
      if (/@import/i.test(css)) throw new Error('Target SVG styles cannot import other stylesheets.');
      for (const match of css.matchAll(/url\s*\(\s*(['"]?)(.*?)\1\s*\)/gi)) {
        if (!match[2].trim().startsWith('#')) throw new Error('Target SVG styles cannot load external resources.');
      }
    }
    for (const attribute of element.attributes) {
      const name = attribute.localName.toLowerCase(), value = attribute.value.trim();
      if (name.startsWith('on')) throw new Error('Target SVG event-handler attributes are not supported.');
      if ((name === 'href' || name === 'src') && value && !value.startsWith('#')) throw new Error('Target SVG can reference only content inside the SVG string.');
      if (/url\s*\(/i.test(value) && !/^url\(\s*['"]?#[-\w:.]+['"]?\s*\)$/i.test(value)) throw new Error('Target SVG cannot load external resources.');
      if (/javascript\s*:/i.test(value) || /@import/i.test(value)) throw new Error('Target SVG cannot contain executable or imported content.');
    }
  }
  return new XMLSerializer().serializeToString(root);
}

export function validateTargetSvg(source) {
  try { parseTargetSvg(source); return null; }
  catch (error) { return error.message; }
}

export function defaultTargetWidthRadPerUm(samplePitchUm) {
  return 2 * Math.PI / samplePitchUm;
}

export function targetWidthIssue(targetWidthRadPerUm, n, samplePitchUm) {
  const binWidth = 2 * Math.PI / (n * samplePitchUm);
  const maximum = 2 * Math.PI / samplePitchUm;
  if (!Number.isFinite(targetWidthRadPerUm) || targetWidthRadPerUm < binWidth || targetWidthRadPerUm > maximum) {
    return `Target width must be at least one far-field bin (${binWidth.toPrecision(5)} rad/µm) and no wider than the plotted Nyquist span (${maximum.toPrecision(5)} rad/µm).`;
  }
  return null;
}

export function targetOutsidePropagatingDisk(mask, n, wavelengthNm, samplePitchUm) {
  const k0 = 2 * Math.PI / (wavelengthNm / 1000);
  const dk = 2 * Math.PI / (n * samplePitchUm);
  let outsideCount = 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (mask[y * n + x] > 0 && Math.hypot((x - n / 2) * dk, (y - n / 2) * dk) > k0 * (1 + 1e-12)) outsideCount++;
  }
  return outsideCount;
}

export async function rasterizeTargetSvg(source, n, { targetWidthRadPerUm, samplePitchUm = 1 } = {}) {
  const sanitized = parseTargetSvg(source);
  const width = targetWidthRadPerUm ?? defaultTargetWidthRadPerUm(samplePitchUm);
  const widthIssue = targetWidthIssue(width, n, samplePitchUm);
  if (widthIssue) throw new Error(widthIssue);
  const extentPx = n * width / defaultTargetWidthRadPerUm(samplePitchUm);
  const sizedDocument = new DOMParser().parseFromString(sanitized, 'image/svg+xml');
  sizedDocument.documentElement.setAttribute('width', String(n));
  sizedDocument.documentElement.setAttribute('height', String(n));
  sizedDocument.documentElement.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(sizedDocument.documentElement)], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('The target SVG could not be rasterized. Check its viewBox and vector data.'));
      image.src = url;
    });
    const canvas = document.createElement('canvas'); canvas.width = n; canvas.height = n;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.clearRect(0, 0, n, n);
    context.drawImage(image, (n - extentPx) / 2, (n - extentPx) / 2, extentPx, extentPx);
    const rgba = context.getImageData(0, 0, n, n).data, mask = new Float64Array(n * n);
    // SVG screen rows increase downward; the centered Fourier grid uses ky increasing upward.
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const svgIndex = y * n + x, fourierIndex = (n - 1 - y) * n + x;
      mask[fourierIndex] = rgba[svgIndex * 4 + 3] >= 128 ? 1 : 0;
    }
    if (!mask.some(value => value === 1)) throw new Error('The target SVG has no visible artwork at the selected grid size.');
    return mask;
  } finally { URL.revokeObjectURL(url); }
}

function parseAmplitudeExpression(source) {
  if (typeof source !== 'string' || !source.trim()) throw new Error('Enter an illumination amplitude expression such as 1.');
  const text = source.trim(), tokenPattern = /\s*(\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?|[A-Za-z_][A-Za-z0-9_]*|[()+\-*/^,])/y;
  const tokens = [];
  for (let position = 0; position < text.length;) {
    tokenPattern.lastIndex = position;
    const match = tokenPattern.exec(text);
    if (!match) throw new Error(`Unsupported character in illumination expression near “${text.slice(position, position + 12)}”.`);
    tokens.push(match[1]); position = tokenPattern.lastIndex;
  }
  tokens.push(null);
  let index = 0;
  const fail = () => { throw new Error(`Invalid illumination expression near “${tokens[index] ?? 'end of expression'}”.`); };
  const take = expected => { if (tokens[index] !== expected) fail(); index++; };
  const functions = {
    abs: [1, Math.abs], cos: [1, Math.cos], exp: [1, Math.exp], log: [1, Math.log], sin: [1, Math.sin], sqrt: [1, Math.sqrt], tan: [1, Math.tan],
    max: [2, Math.max], min: [2, Math.min], pow: [2, Math.pow],
  };
  function primary() {
    const token = tokens[index++];
    if (token === '(') { const value = additive(); take(')'); return value; }
    if (token === null) fail();
    if (/^(?:\d|\.)/.test(token)) { const value = Number(token); return () => value; }
    if (/^[A-Za-z_]/.test(token)) {
      const name = token.toLowerCase();
      if (tokens[index] === '(') {
        const spec = functions[name]; if (!spec) throw new Error(`Unsupported illumination function “${token}”.`);
        index++; const args = [additive()];
        if (tokens[index] === ',') { index++; args.push(additive()); }
        take(')');
        if (args.length !== spec[0]) throw new Error(`Illumination function ${token} requires ${spec[0]} argument${spec[0] === 1 ? '' : 's'}.`);
        return (x, y) => spec[1](...args.map(argument => argument(x, y)));
      }
      if (name === 'x') return x => x;
      if (name === 'y') return (x, y) => y;
      if (name === 'pi') return () => Math.PI;
      if (name === 'e') return () => Math.E;
      throw new Error(`Unknown illumination variable or constant “${token}”. Use x, y, pi, or e.`);
    }
    fail();
  }
  function power() { const left = primary(); if (tokens[index] !== '^') return left; index++; const right = unary(); return (x, y) => left(x, y) ** right(x, y); }
  function unary() { if (tokens[index] === '+') { index++; return unary(); } if (tokens[index] === '-') { index++; const value = unary(); return (x, y) => -value(x, y); } return power(); }
  function multiplicative() { let value = unary(); while (tokens[index] === '*' || tokens[index] === '/') { const op = tokens[index++], right = unary(), left = value; value = op === '*' ? (x, y) => left(x, y) * right(x, y) : (x, y) => left(x, y) / right(x, y); } return value; }
  function additive() { let value = multiplicative(); while (tokens[index] === '+' || tokens[index] === '-') { const op = tokens[index++], right = multiplicative(), left = value; value = op === '+' ? (x, y) => left(x, y) + right(x, y) : (x, y) => left(x, y) - right(x, y); } return value; }
  const evaluate = additive(); if (tokens[index] !== null) fail();
  return evaluate;
}

export function evaluateIncidentIlluminationProfile(source, n, samplePitchUm = 1) {
  if (!Number.isFinite(samplePitchUm) || samplePitchUm <= 0) throw new Error('Sample pitch must be finite and greater than zero.');
  const evaluate = parseAmplitudeExpression(source || '1'), amplitude = new Float64Array(n * n);
  let maximum = 0;
  for (let yIndex = 0; yIndex < n; yIndex++) for (let xIndex = 0; xIndex < n; xIndex++) {
    const x = (xIndex + 0.5 - n / 2) * samplePitchUm, y = (yIndex + 0.5 - n / 2) * samplePitchUm;
    const value = evaluate(x, y);
    if (!Number.isFinite(value) || value < 0) throw new Error(`Illumination amplitude must be finite and nonnegative at x=${x.toFixed(3)}, y=${y.toFixed(3)}.`);
    const offset = yIndex * n + xIndex; amplitude[offset] = value; maximum = Math.max(maximum, value);
  }
  if (maximum <= 0) throw new Error('Illumination amplitude must be greater than zero somewhere on the sampled plane.');
  for (let i = 0; i < amplitude.length; i++) amplitude[i] /= maximum;
  return amplitude;
}

export function evaluateIlluminationProfile(source, n, apertureRadiusUm = 50, samplePitchUm = 1) {
  const maximumInscribedRadiusUm = n * samplePitchUm / 2;
  if (!Number.isFinite(apertureRadiusUm) || apertureRadiusUm <= 0 || apertureRadiusUm > maximumInscribedRadiusUm) throw new Error(`Circular aperture radius must be greater than zero and no larger than ${maximumInscribedRadiusUm.toPrecision(5)} µm for this grid.`);
  const amplitude = evaluateIncidentIlluminationProfile(source, n, samplePitchUm);
  let maximum = 0;
  for (let yIndex = 0; yIndex < n; yIndex++) for (let xIndex = 0; xIndex < n; xIndex++) {
    const x = (xIndex + 0.5 - n / 2) * samplePitchUm, y = (yIndex + 0.5 - n / 2) * samplePitchUm;
    const offset = yIndex * n + xIndex;
    if (x * x + y * y <= apertureRadiusUm * apertureRadiusUm) maximum = Math.max(maximum, amplitude[offset]);
    else amplitude[offset] = 0;
  }
  if (maximum <= 0) throw new Error('Illumination amplitude must be greater than zero somewhere on the aperture.');
  for (let i = 0; i < amplitude.length; i++) amplitude[i] /= maximum;
  return amplitude;
}

export function validateIlluminationExpression(source, n = 64, apertureRadiusUm = 50, samplePitchUm = 1) {
  try { evaluateIlluminationProfile(source, n, apertureRadiusUm, samplePitchUm); return null; }
  catch (error) { return error.message; }
}

export async function prepareStudyFields(model) {
  const n = model.illumination.gridSize;
  const study = model.study?.[0];
  if (!Number.isInteger(n) || n < 64 || n > 256 || (n & (n - 1)) !== 0) throw new Error('Choose a square grid size that is a power of two from 64 through 256.');
  if (!Number.isFinite(model.illumination.wavelengthNm) || model.illumination.wavelengthNm <= 0
    || !Number.isFinite(model.illumination.samplePitchUm) || model.illumination.samplePitchUm <= 0) throw new Error('Wavelength and sample pitch must be finite positive values.');
  if (!Number.isInteger(study?.iterations) || study.iterations < 1 || study.iterations > 100) throw new Error('Choose between 1 and 100 GS iterations in the selected Study.');
  if (!Number.isInteger(study?.seed) || study.seed < 0 || study.seed > 0xffffffff) throw new Error('Choose an unsigned 32-bit initialization seed in the selected Study.');
  const targetWidthRadPerUm = model.target.targetWidthRadPerUm ?? defaultTargetWidthRadPerUm(model.illumination.samplePitchUm);
  const widthIssue = targetWidthIssue(targetWidthRadPerUm, n, model.illumination.samplePitchUm);
  if (widthIssue) throw new Error(widthIssue);
  const targetIntensity = await rasterizeTargetSvg(model.target.svg, n, { targetWidthRadPerUm, samplePitchUm: model.illumination.samplePitchUm });
  const nonpropagatingCount = targetOutsidePropagatingDisk(targetIntensity, n, model.illumination.wavelengthNm, model.illumination.samplePitchUm);
  if (nonpropagatingCount) throw new Error(`The SVG target includes ${nonpropagatingCount} far-field sample(s) outside the propagating-wave circle kx² + ky² ≤ k0² for this wavelength and sample pitch. Reduce the target width or increase the wavelength or sample pitch.`);
  return { size: n, target: Array.from(targetIntensity), iterations: study.iterations, seed: study.seed,
    wavelengthNm: model.illumination.wavelengthNm, samplePitchUm: model.illumination.samplePitchUm,
    targetWidthRadPerUm,
    apertureRadiusUm: model.illumination.apertureRadius ?? 50, amplitudeFunction: model.illumination.amplitudeFunction || '1' };
}
