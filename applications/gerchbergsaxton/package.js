import { createSchemaProjectPackage } from '../../platform/ui/widgets/model-editor/widget.js';
import { modelEditorActionBindings } from '../../platform/ui/widgets/model-editor-behavior/widget.js';
import { beginPlot2dFrame, drawPlot2d } from '../../platform/ui/widgets/plot-2d/widget.js';
import { defaultTargetWidthRadPerUm, evaluateIncidentIlluminationProfile, evaluateIlluminationProfile, prepareStudyFields, rasterizeTargetSvg, targetOutsidePropagatingDisk, targetWidthIssue, validateIlluminationExpression, validateTargetSvg } from './js/gs.js';
import { activeModelSchema, activateModelSchema, loadModelSchema } from './schema-documents.js';

const workspaceUrl = new URL('../../', import.meta.url);
let latestResult = null;
let resultPanel = null;
let runBusy = false;
let runStudyAction = null;
let actionServices = null;
let lastPreviewArgs = null;
let clearResultsAction = null;
let runRecords = [];
let selectedRunId = '';
let activePreviewRenderer = null;

function defaultModel() {
  return {
    application: 'gerchbergsaxton',
    'x-fullmeta-schema': '../../applications/gerchbergsaxton/gerchbergsaxton.schema.json',
    format: 'fullmeta-hologram/1',
    metadata: { id: 'hologram-draft', name: 'Hologram' },
    model: {
      target: { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M 15 85 L 15 15 L 50 60 L 85 15 L 85 85" fill="none" stroke="#000" stroke-width="12" stroke-linejoin="round" stroke-linecap="round"/></svg>', targetWidthRadPerUm: 2 * Math.PI },
      illumination: { wavelengthNm: 532, gridSize: 256, samplePitchUm: 1, apertureRadius: 50, amplitudeFunction: 'exp(-((x/89.6)^2+(y/89.6)^2))' },
      study: [{ id: 'gs-study', name: 'Far-field hologram study', type: 'farFieldPhaseOnly', iterations: 40, seed: 20261110 }],
    },
  };
}

function fingerprint(model) {
  return JSON.stringify({ study: model?.model?.study, target: model?.model?.target, illumination: model?.model?.illumination });
}

function domainValidation(model) {
  const issues = [], n = model?.model?.illumination?.gridSize;
  const svgIssue = validateTargetSvg(model?.model?.target?.svg);
  if (svgIssue) issues.push(svgIssue);
  const illumination = model?.model?.illumination || {};
  if (!Number.isFinite(illumination.wavelengthNm) || illumination.wavelengthNm <= 0) issues.push('Wavelength must be finite and greater than zero.');
  if (!Number.isFinite(illumination.samplePitchUm) || illumination.samplePitchUm <= 0) issues.push('Sample pitch must be finite and greater than zero.');
  const targetWidth = model?.model?.target?.targetWidthRadPerUm ?? (Number.isFinite(illumination.samplePitchUm) && illumination.samplePitchUm > 0 ? defaultTargetWidthRadPerUm(illumination.samplePitchUm) : NaN);
  const targetWidthError = targetWidthIssue(targetWidth, Number.isInteger(n) ? n : 256, illumination.samplePitchUm);
  if (targetWidthError) issues.push(targetWidthError);
  const apertureRadius = illumination.apertureRadius ?? 50;
  const maximumApertureRadius = Number.isInteger(n) && Number.isFinite(illumination.samplePitchUm) ? n * illumination.samplePitchUm / 2 : 0;
  if (!Number.isFinite(apertureRadius) || apertureRadius <= 0 || apertureRadius > maximumApertureRadius) issues.push(`Circular aperture radius must be greater than zero and no larger than ${maximumApertureRadius.toPrecision(5)} µm for this grid.`);
  const illuminationIssue = validateIlluminationExpression(illumination.amplitudeFunction || '1', Number.isInteger(n) ? n : 64, apertureRadius, illumination.samplePitchUm);
  if (illuminationIssue) issues.push(illuminationIssue);
  const studies = model?.model?.study;
  if (!Array.isArray(studies) || studies.length !== 1 || studies[0]?.id !== 'gs-study'
    || studies[0]?.name !== 'Far-field hologram study' || studies[0]?.type !== 'farFieldPhaseOnly') {
    issues.push('Restore the required Far-field hologram study item.');
  }
  const study = Array.isArray(studies) ? studies[0] || {} : {};
  if (!Number.isInteger(study.iterations) || study.iterations < 1 || study.iterations > 100) issues.push('GS iterations must be an integer from 1 through 100.');
  if (!Number.isInteger(study.seed) || study.seed < 0 || study.seed > 0xffffffff) issues.push('Initialization seed must be an unsigned 32-bit integer.');
  return issues;
}

function renderResultPanel(model, result = latestResult) {
  if (!resultPanel) return;
  const button = resultPanel.querySelector('#gs-run-study');
  const clearButton = resultPanel.querySelector('#gs-clear-results');
  const history = resultPanel.querySelector('#gs-run-history');
  const invalid = domainValidation(model).length > 0;
  const busy = runBusy || actionServices?.operation.busy();
  if (button) {
    button.disabled = Boolean(busy || invalid);
    button.title = runBusy ? 'A study is already running.' : actionServices?.operation.busy() ? 'Finish the active operation first.' : invalid ? 'Correct the project inputs before running the Study.' : 'Run the selected Study.';
  }
  if (clearButton) {
    clearButton.disabled = Boolean(busy || runRecords.length === 0);
    clearButton.title = runRecords.length ? 'Remove this project’s saved Gerchberg-Saxton results.' : 'There are no saved runs to clear.';
  }
  if (history) {
    if (!runRecords.length) history.innerHTML = '<p class="gs-history-empty">No saved runs. Run the Study to create project results.</p>';
    else history.innerHTML = `<label for="gs-run-history-select">Run history</label><select id="gs-run-history-select" ${busy ? 'disabled' : ''}>${runRecords.map(record => {
      const date = record.completedAt ? new Date(record.completedAt).toLocaleString() : record.runId;
      const freshness = record.inputFingerprint === fingerprint(model) ? 'current' : 'stale';
      return `<option value="${record.runId}" ${record.runId === selectedRunId ? 'selected' : ''}>${date} · ${freshness}</option>`;
    }).join('')}</select>`;
    history.querySelector('#gs-run-history-select')?.addEventListener('change', event => {
      const record = runRecords.find(item => item.runId === event.target.value);
      if (record && actionServices) loadSavedRun(actionServices, record).catch(error => actionServices?.ui.setStatus(error.message, 'error'));
    });
  }
}

function mountResultsPanel({ settingsView }) {
  const section = document.createElement('section');
  section.id = 'gs-results-panel'; section.dataset.modelEditorPanel = ''; section.hidden = true;
  section.className = 'settings-panel';
  const stylesheet = document.createElement('link'); stylesheet.rel = 'stylesheet'; stylesheet.href = new URL('./ui/results.css', import.meta.url).href;
  const applicationStylesheet = document.createElement('link'); applicationStylesheet.rel = 'stylesheet'; applicationStylesheet.href = new URL('./ui/application.css', import.meta.url).href;
  document.head.append(stylesheet);
  document.head.append(applicationStylesheet);
  section.innerHTML = `<h3 data-model-editor-panel-heading>Far-field hologram study</h3><p data-model-editor-panel-note></p>
    <div class="gs-actions"><button id="gs-run-study" class="button primary" type="button">Run Study</button><button id="gs-clear-results" class="button" type="button">Clear Results</button></div><div id="gs-run-history"></div>`;
  const runButton = section.querySelector('#gs-run-study');
  runButton.addEventListener('click', () => {
    if (typeof runStudyAction === 'function') runStudyAction().catch(error => {
      actionServices?.ui.setStatus(error.message, 'error');
    });
  });
  section.querySelector('#gs-clear-results').addEventListener('click', () => {
    if (typeof clearResultsAction === 'function') clearResultsAction().catch(error => actionServices?.ui.setStatus(error.message, 'error'));
  });
  settingsView.append(section); resultPanel = section;
  return () => {
    if (resultPanel === section) resultPanel = null;
    if (resultPanel === null) { runStudyAction = null; clearResultsAction = null; }
    section.remove(); stylesheet.remove();
  };
}

const runsDirectory = 'gerchbergsaxton_runs';
const engineRegistry = 'gsEngine';

async function commandEngine(services, { entry, cwd, input, expectedOutputs = [], operationId, createCwd = false }) {
  const response = await services.network.requestJson(services.network.endpoint('kernelCommandRun'), {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ registryId: engineRegistry, entry, args: [], cwd, createCwd,
      stdin: JSON.stringify(input), expectedOutputs, operationId }),
  });
  if (!response.success) throw new Error(response.error || response.stderr?.trim() || response.stdout?.trim() || 'The Gerchberg-Saxton engine operation failed.');
  return response;
}

async function loadRunHistory(services, folder) {
  const url = new URL(services.network.endpoint('modelRuns'), location.origin);
  url.searchParams.set('folder', folder);
  const response = await services.network.requestJson(url, { method: 'GET' });
  if (!Array.isArray(response.runs)) throw new Error('The project run-history response is invalid.');
  runRecords = response.runs
    .filter(record => record?.state === 'completed' && typeof record.runId === 'string')
    .sort((a, b) => String(b.completedAt || '').localeCompare(String(a.completedAt || '')))
    .slice(0, 2);
  return runRecords;
}

async function readSavedRunResult(services, folder, runId) {
  const artifactUrl = new URL(services.network.endpoint('kernelArtifactRead'), location.origin);
  artifactUrl.searchParams.set('path', `${folder}/${runsDirectory}/${runId}/result.json`);
  const response = await fetch(artifactUrl, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not load saved result ${runId} (${response.status}).`);
  const data = await response.json();
  for (const name of ['target', 'phase', 'intensity']) {
    if (!Array.isArray(data[name]) || data[name].length !== data.size * data.size
      || data[name].some(value => name === 'phase' ? value !== null && !Number.isFinite(value) : !Number.isFinite(value))) {
      throw new Error(`Saved result ${runId} has an invalid ${name} array.`);
    }
    data[name] = name === 'phase'
      ? Float32Array.from(data[name], value => value === null ? Number.NaN : value)
      : Float32Array.from(data[name]);
  }
  return data;
}

async function loadSavedRun(services, record, folder) {
  folder ||= services.resolveInputs({ folder: 'document.folder' }).folder;
  if (!folder || !record?.runId) throw new Error('Open a saved project and select a completed run.');
  const data = await readSavedRunResult(services, folder, record.runId);
  latestResult = { ...data, studyId: record.study?.id, fingerprint: record.inputFingerprint, runId: record.runId };
  selectedRunId = record.runId;
  if (resultPanel) renderResultPanel(services.resolveInputs({ model: 'document.model' }).model, latestResult);
  if (lastPreviewArgs && typeof activePreviewRenderer === 'function') {
    activePreviewRenderer({ ...lastPreviewArgs, model: services.resolveInputs({ model: 'document.model' }).model });
  }
  return latestResult;
}

export async function createApplicationPackage(options = {}) {
  if (options.model && options.modelLocation) await activateModelSchema(options.model, options.modelLocation);
  else if (options.schemaUrl) await loadModelSchema(options.schemaUrl, 'gerchbergsaxton');
  const { schema, sources } = activeModelSchema();
  const schemaPath = decodeURIComponent(sources[0].url.pathname.slice(workspaceUrl.pathname.length));
  const modelLocation = options.modelLocation || new URL('projects/gerchbergsaxton-draft/gerchbergsaxton.json', workspaceUrl);
  const model = options.model || defaultModel();
  // Older projects predate the explicit far-field target span. Migrate their
  // in-memory model to the former full Nyquist-span mapping; normal Save can persist it.
  if (model?.model?.target && !Number.isFinite(model.model.target.targetWidthRadPerUm)) {
    const samplePitchUm = model.model.illumination?.samplePitchUm;
    if (Number.isFinite(samplePitchUm) && samplePitchUm > 0) {
      model.model.target.targetWidthRadPerUm = defaultTargetWidthRadPerUm(samplePitchUm);
    }
  }
  const base = await createSchemaProjectPackage({ model, modelLocation });
  if (base.id !== 'gerchbergsaxton' || base.schemaPath !== schemaPath) throw new Error('The opened model and Gerchberg-Saxton schema do not match.');
  const modelEditorSchema = {
    ...base.modelEditorSchema,
    validateFullMetaModelWithRules(value) {
      const structural = base.modelEditorSchema.validateFullMetaModelWithRules(value);
      return structural.length ? structural : domainValidation(value);
    },
  };
  const ui = structuredClone(base.modelEditorUi);
  ui.projectRootFolder = 'projects';
  ui.emptyState = { canvasLabel: 'Scalar hologram preview', resolvedValues: 'Select a project item to edit its settings.' };
  ui.panels = structuredClone(schema['x-fullmeta-ui-modelEditor'].panels);
  const actionBindings = modelEditorActionBindings(schema['x-fullmeta-ui-modelEditor'], schema['x-fullmeta-ui-graphicsInterfaces']);
  let previewGeneration = 0;
  const renderPreview = ({ previewCanvas, previewContext, model: documentModel, selectedPath = [] } = {}) => {
    if (!previewCanvas || !previewContext) return;
    const width = previewCanvas.clientWidth || 640, height = previewCanvas.clientHeight || 360;
    const ratio = window.devicePixelRatio || 1;
    previewCanvas.width = Math.round(width * ratio); previewCanvas.height = Math.round(height * ratio);
    previewContext.setTransform(ratio, 0, 0, ratio, 0, 0);
    previewContext.fillStyle = '#080e17'; previewContext.fillRect(0, 0, width, height);
    const selectionPath = Array.isArray(selectedPath) ? selectedPath : [];
    lastPreviewArgs = { previewCanvas, previewContext, model: documentModel, selectedPath: selectionPath };
    const currentPreviewGeneration = ++previewGeneration;
    beginPlot2dFrame(previewCanvas, currentPreviewGeneration);
    const graphicsTitle = document.querySelector('#graphics-widget-title');
    if (graphicsTitle) graphicsTitle.textContent = 'Graphics Console';
    const selectedStudyCollection = selectionPath.length === 2 && selectionPath[0] === 'model' && selectionPath[1] === 'study';
    const selectedStudy = selectionPath.length === 3 && selectionPath[0] === 'model' && selectionPath[1] === 'study';
    const selectedIllumination = selectionPath.length === 2 && selectionPath[0] === 'model' && selectionPath[1] === 'illumination';
    const previewSummary = document.querySelector('#preview-summary');
    if (previewSummary) previewSummary.textContent = selectedIllumination ? 'Metasurface · x, y (µm)' : selectedStudy ? 'Study results · metasurface x, y (µm) and far field kx, ky (rad/µm)' : selectedStudyCollection ? 'Study overview' : 'Far-field target · kx, ky (rad/µm)';
    const geometryNote = document.querySelector('#geometry-note');
    const diameterUm = 2 * (documentModel?.model?.illumination?.apertureRadius ?? 50);
    if (geometryNote) geometryNote.textContent = selectedIllumination ? `Incident beam across the full sampled x-y plane · circle marks the ${Number(diameterUm.toPrecision(4))} µm metasurface aperture · Cartesian +y points upward.` : selectedStudy ? 'Cartesian +y and +ky point upward. Phase uses metasurface x,y (µm); target and reconstruction use far-field kx,ky (rad/µm). SVG viewBox width sets the physical k-space span. The dashed circle is the propagating-wave limit k0=2π/λ. SVG rows are converted from top-down to +ky up. Scroll over a plot to zoom; drag to pan; double-click to reset.' : 'SVG coordinates start at top-left with y downward. The viewBox width maps to the stated physical k-space span; the plot uses Cartesian axes with +ky upward. The propagating-wave limit is k0=2π/λ.';
    previewCanvas.setAttribute('aria-label', selectedStudy ? 'Metasurface phase profile, reconstructed hologram, and target hologram' : selectedIllumination ? 'Illumination amplitude profile with circular aperture outline' : 'Binary SVG target preview');
    const result = latestResult;
    if (selectedStudy) {
      renderResultPanel(documentModel, result);
      const current = result && result.fingerprint === fingerprint(documentModel) && !runBusy;
      const n = documentModel?.model?.illumination?.gridSize || 256;
      const samplePitchUm = documentModel?.model?.illumination?.samplePitchUm || 1;
      const kExtent = Math.PI / samplePitchUm;
      const wavelengthNm = documentModel?.model?.illumination?.wavelengthNm || 532;
      const k0 = 2 * Math.PI / (wavelengthNm / 1000);
      const xyExtent = n * samplePitchUm / 2;
      const farFieldAxes = { xLabel: 'kx (rad/µm)', yLabel: 'ky (rad/µm)', minimum: -kExtent, maximum: kExtent };
      const metasurfaceAxes = { xLabel: 'x (µm)', yLabel: 'y (µm)', minimum: -xyExtent, maximum: xyExtent };
      const drawFigures = target => {
        if (currentPreviewGeneration !== previewGeneration) return;
        const figures = [
          { id: 'phase', title: 'Metasurface phase', data: result?.phase, mode: 'phase', axes: metasurfaceAxes },
          { id: 'reconstruction', title: runBusy && result ? 'Previous hologram · running' : current ? 'Reconstructed hologram' : result ? 'Previous hologram · stale' : 'Hologram · not run', data: result?.intensity, mode: 'intensity', axes: farFieldAxes },
          { id: 'target', title: 'Target hologram', data: target, mode: 'intensity', axes: farFieldAxes },
        ];
        const padding = 18, gap = 18, column = (width - padding * 2 - gap * 2) / 3;
        const viewportHeight = Math.max(1, height - 54);
        const drawFigure = (figure, index) => {
          const viewport = { x: padding + (column + gap) * index, y: 32, width: column, height: viewportHeight };
          const values = figure.data || new Float32Array(n * n);
          const color = figure.mode === 'phase'
            ? value => `hsl(${(value / (2 * Math.PI) * 360) % 360} 72% 52%)`
            : value => { const gray = Math.round(255 * Math.max(0, Math.min(1, value))); return `rgb(${gray},${gray},${gray})`; };
          drawPlot2d({
            context: previewContext,
            viewport,
            color,
            interaction: {
              id: `gs-${figure.id}`,
              frame: currentPreviewGeneration,
              background: '#080e17',
              drawOverlay: plot => {
                previewContext.save();
                previewContext.textAlign = 'center'; previewContext.font = '12px sans-serif'; previewContext.fillStyle = '#e7f2fc';
                previewContext.fillText(figure.title, plot.x + plot.width / 2, Math.max(viewport.y + 15, plot.y - 12), plot.width - 8);
                  if (figure.axes.xLabel.startsWith('kx') && k0 <= kExtent) {
                    previewContext.save();
                    previewContext.beginPath(); previewContext.rect(plot.x, plot.y, plot.width, plot.height); previewContext.clip();
                    const radiusPx = k0 / (figure.axes.maximum - figure.axes.minimum) * plot.width;
                    previewContext.strokeStyle = 'rgba(65,230,208,0.8)'; previewContext.lineWidth = 1.2; previewContext.setLineDash([5, 4]);
                    previewContext.beginPath(); previewContext.arc(plot.x + plot.width / 2, plot.y + plot.height / 2, radiusPx, 0, 2 * Math.PI); previewContext.stroke();
                    previewContext.restore();
                  }
                  if (figure.mode === 'phase' && figure.data) {
                  const gradient = previewContext.createLinearGradient(plot.x, 0, plot.x + plot.width, 0);
                  for (let stop = 0; stop <= 6; stop++) gradient.addColorStop(stop / 6, `hsl(${stop * 60} 72% 52%)`);
                  previewContext.fillStyle = gradient; previewContext.fillRect(plot.x, plot.y + plot.height + 43, plot.width, 6);
                  previewContext.fillStyle = '#9fb4c8'; previewContext.font = '10px sans-serif';
                  previewContext.textAlign = 'left'; previewContext.fillText('0', plot.x, plot.y + plot.height + 56);
                  previewContext.textAlign = 'right'; previewContext.fillText('2π', plot.x + plot.width, plot.y + plot.height + 56);
                }
                if (!figure.data) {
                  previewContext.fillStyle = '#a9bfd2'; previewContext.font = '12px sans-serif'; previewContext.textAlign = 'center';
                  previewContext.fillText(index === 0 ? 'Run Study to calculate phase' : 'No completed result', plot.x + plot.width / 2, plot.y + plot.height / 2, plot.width - 10);
                }
                previewContext.restore();
              },
            },
            data: {
              grid: { width: n, height: n, values },
              xAxis: { minimum: figure.axes.minimum, maximum: figure.axes.maximum, label: figure.axes.xLabel },
              yAxis: { minimum: figure.axes.minimum, maximum: figure.axes.maximum, label: figure.axes.yLabel, direction: 'up' },
              range: [0, 1],
            },
          });
        };
        figures.forEach(drawFigure);
        if (result && !current) {
          previewContext.fillStyle = '#ffba6b'; previewContext.font = '12px sans-serif'; previewContext.fillText('Inputs changed since this Study ran. Run Study again to update the phase and hologram.', width / 2, height - 8, width - 24);
        }
      };
      const targetWidth = documentModel?.model?.target?.targetWidthRadPerUm ?? defaultTargetWidthRadPerUm(samplePitchUm);
      rasterizeTargetSvg(documentModel?.model?.target?.svg, n, { targetWidthRadPerUm: targetWidth, samplePitchUm }).then(drawFigures).catch(error => {
        if (currentPreviewGeneration !== previewGeneration) return;
        previewContext.fillStyle = '#ff8275'; previewContext.textAlign = 'center'; previewContext.font = '14px sans-serif';
        previewContext.fillText(error.message, width / 2, height - 24, width - 32);
      });
      return;
    }
    renderResultPanel(documentModel, result);
    if (selectedStudyCollection) {
      previewContext.fillStyle = '#a9bfd2'; previewContext.textAlign = 'center'; previewContext.font = '16px sans-serif';
      previewContext.fillText('Select Far-field hologram study to inspect or run it.', width / 2, height / 2);
      return;
    }
    renderResultPanel(documentModel);
    const n = documentModel?.model?.illumination?.gridSize || 256;
    if (selectedIllumination) {
      const illumination = documentModel?.model?.illumination || {};
      try {
        const radius = illumination.apertureRadius ?? 50, samplePitchUm = illumination.samplePitchUm || 1;
        const extentUm = n * samplePitchUm / 2;
        const profile = evaluateIncidentIlluminationProfile(illumination.amplitudeFunction || '1', n, samplePitchUm);
        drawPlot2d({
          context: previewContext,
          viewport: { x: 0, y: 12, width, height: height - 24 },
          color: value => { const gray = Math.round(255 * Math.max(0, Math.min(1, value))); return `rgb(${gray},${gray},${gray})`; },
          interaction: {
            id: 'gs-illumination',
            frame: currentPreviewGeneration,
            background: '#080e17',
            drawOverlay: plot => {
              previewContext.save();
              previewContext.fillStyle = '#e7f2fc'; previewContext.font = '12px sans-serif'; previewContext.textAlign = 'center';
              previewContext.fillText('Illumination amplitude A(x,y)', plot.x + plot.width / 2, Math.max(27, plot.y - 12), plot.width - 8);
              const xSpan = plot.xAxis.maximum - plot.xAxis.minimum, ySpan = plot.yAxis.maximum - plot.yAxis.minimum;
              const apertureX = plot.x + (0 - plot.xAxis.minimum) / xSpan * plot.width;
              const apertureY = plot.y + (plot.yAxis.maximum - 0) / ySpan * plot.height;
              const apertureRadiusPx = radius / xSpan * plot.width;
              previewContext.strokeStyle = '#41e6d0'; previewContext.lineWidth = 2;
              previewContext.beginPath(); previewContext.arc(apertureX, apertureY, apertureRadiusPx, 0, 2 * Math.PI); previewContext.stroke();
              const barX = plot.x + plot.width + 16, barY = plot.y + 12, barHeight = Math.max(12, plot.height - 24), barWidth = 9;
              const bar = previewContext.createLinearGradient(0, barY + barHeight, 0, barY); bar.addColorStop(0, '#000'); bar.addColorStop(1, '#fff');
              previewContext.fillStyle = bar; previewContext.fillRect(barX, barY, barWidth, barHeight);
              previewContext.fillStyle = '#9fb4c8'; previewContext.font = '10px sans-serif'; previewContext.textAlign = 'left';
              previewContext.fillText('1', barX + 13, barY + 4); previewContext.fillText('0', barX + 13, barY + barHeight);
              previewContext.save(); previewContext.translate(barX + 35, barY + barHeight / 2); previewContext.rotate(-Math.PI / 2); previewContext.textAlign = 'center'; previewContext.fillText('A / Amax', 0, 0); previewContext.restore();
              previewContext.restore();
            },
          },
          data: {
            grid: { width: n, height: n, values: profile },
            xAxis: { minimum: -extentUm, maximum: extentUm, label: 'x (µm)' },
            yAxis: { minimum: -extentUm, maximum: extentUm, label: 'y (µm)', direction: 'up' },
            range: [0, 1],
          },
        });
      } catch (error) {
        previewContext.fillStyle = '#ff8275'; previewContext.textAlign = 'center'; previewContext.font = '14px sans-serif';
        previewContext.fillText(error.message, width / 2, height / 2, width - 32);
      }
      return;
    }
    const illumination = documentModel?.model?.illumination || {};
    const samplePitchUm = illumination.samplePitchUm || 1;
    const targetWidth = documentModel?.model?.target?.targetWidthRadPerUm ?? defaultTargetWidthRadPerUm(samplePitchUm);
    rasterizeTargetSvg(documentModel?.model?.target?.svg, n, { targetWidthRadPerUm: targetWidth, samplePitchUm }).then(mask => {
      if (currentPreviewGeneration !== previewGeneration) return;
      const kExtent = Math.PI / samplePitchUm;
      const k0 = 2 * Math.PI / ((illumination.wavelengthNm || 532) / 1000);
      const outsideCount = targetOutsidePropagatingDisk(mask, n, illumination.wavelengthNm || 532, samplePitchUm);
      drawPlot2d({
        context: previewContext,
        viewport: { x: 0, y: 12, width, height: height - 24 },
        color: value => { const gray = Math.round(255 * Math.max(0, Math.min(1, value))); return `rgb(${gray},${gray},${gray})`; },
        interaction: {
          id: 'gs-target', frame: currentPreviewGeneration, background: '#080e17',
          drawOverlay: plot => {
            previewContext.save();
            previewContext.fillStyle = '#e7f2fc'; previewContext.font = '12px sans-serif'; previewContext.textAlign = 'center';
            previewContext.fillText('Binary target · '+Number(targetWidth.toPrecision(4))+' rad/µm viewBox span', plot.x + plot.width / 2, Math.max(27, plot.y - 12), plot.width - 8);
            if (k0 <= kExtent) {
              previewContext.beginPath(); previewContext.rect(plot.x, plot.y, plot.width, plot.height); previewContext.clip();
              previewContext.strokeStyle = '#41e6d0'; previewContext.lineWidth = 1.4; previewContext.setLineDash([5,4]);
              previewContext.beginPath(); previewContext.arc(plot.x + plot.width/2, plot.y + plot.height/2, k0/(2*kExtent)*plot.width, 0, 2*Math.PI); previewContext.stroke();
            }
            if (outsideCount) {
              previewContext.setLineDash([]); previewContext.fillStyle = '#ffba6b'; previewContext.textAlign = 'left'; previewContext.font = '11px sans-serif';
              previewContext.fillText(`${outsideCount} target samples are outside the propagating-wave circle. Reduce target width or change wavelength/sample pitch.`, plot.x, plot.y + plot.height + 38, plot.width + 10);
            }
            previewContext.restore();
          },
        },
        data: {
          grid: { width: n, height: n, values: mask },
          xAxis: { minimum: -kExtent, maximum: kExtent, label: 'kx (rad/µm)' },
          yAxis: { minimum: -kExtent, maximum: kExtent, label: 'ky (rad/µm)', direction: 'up' },
          range: [0, 1],
        },
      });
    }).catch(error => {
      if (currentPreviewGeneration !== previewGeneration) return;
      previewContext.fillStyle = '#ff8275'; previewContext.textAlign = 'center'; previewContext.font = '14px sans-serif';
      previewContext.fillText(error.message, width / 2, height / 2, width - 32);
    });
  };
  activePreviewRenderer = renderPreview;
  return {
    ...base,
    kind: 'application',
    schemaPath,
    modelEditorUi: ui,
    modelEditorSchema,
    validateDocument({ value } = {}) { return modelEditorSchema.validateFullMetaModelWithRules(value); },
    actionBindings,
    rootLabel: documentModel => documentModel?.metadata?.name || 'Hologram',
    mountEditorPanels: mountResultsPanel,
    renderPreview,
    actions(services, bindings) {
      actionServices = services;
      const initial = services.resolveInputs({ folder: 'document.folder', model: 'document.model' });
      loadRunHistory(services, initial.folder).then(async records => {
        if (records.length) await loadSavedRun(services, records[0], initial.folder);
        else {
          latestResult = null; selectedRunId = '';
          if (resultPanel) renderResultPanel(initial.model, null);
          if (lastPreviewArgs) renderPreview({ ...lastPreviewArgs, model: initial.model });
        }
      }).catch(error => services.ui.setStatus(`Could not load saved Gerchberg-Saxton runs: ${error.message}`, 'error'));
      clearResultsAction = async () => {
        if (services.operation.busy()) throw new Error('Finish the current operation before clearing results.');
        const { folder, file } = services.resolveInputs({ folder: 'document.folder', file: 'document.file' });
        if (!folder || !file) throw new Error('Save the project before clearing results.');
        if (!window.confirm(`Clear all saved Gerchberg-Saxton results for ${folder}? The retained run files will be removed.`)) return;
        const current = services.resolveInputs({ folder: 'document.folder', file: 'document.file' });
        if (`${current.folder}/${current.file}` !== `${folder}/${file}` || services.operation.busy()) throw new Error('The open project changed while confirming Clear Results.');
        const kind = 'gs.clearResults', id = services.operation.createId();
        services.operation.start(kind, id); runBusy = true; services.ui.updateActionAvailability();
        try {
          await commandEngine(services, { entry: '--clear-results', cwd: folder,
            input: { runsDirectory }, operationId: id });
          runRecords = []; selectedRunId = ''; latestResult = null;
          if (resultPanel) renderResultPanel(services.resolveInputs({ model: 'document.model' }).model, null);
          if (lastPreviewArgs) renderPreview({ ...lastPreviewArgs, model: services.resolveInputs({ model: 'document.model' }).model });
          services.ui.setStatus('Gerchberg-Saxton results cleared.', 'good');
        } finally {
          services.operation.finish(kind, id); runBusy = false;
          if (resultPanel) renderResultPanel(services.resolveInputs({ model: 'document.model' }).model, latestResult);
          services.ui.updateActionAvailability();
        }
      };
      runStudyAction = async () => {
          if (runBusy || services.operation.busy()) throw new Error('Wait for the current operation to finish before running a Study.');
          services.draft.commit();
          let { model: documentModel, path: selectedPath, folder, file } = services.resolveInputs({ model: 'document.model', path: 'selection.path', folder: 'document.folder', file: 'document.file' });
          if (!Array.isArray(selectedPath) || selectedPath.length !== 3 || selectedPath[0] !== 'model' || selectedPath[1] !== 'study') throw new Error('Select the Far-field hologram study before running it.');
          let study = documentModel?.model?.study?.[selectedPath[2]];
          if (!study?.id) throw new Error('The selected Study no longer exists.');
          const errors = services.validation.model(documentModel);
          services.validation.record(errors);
          if (errors.length) throw new Error(`Correct the project before running the Study: ${errors[0]}`);
          const identity = `${folder}/${file}`, modelSnapshot = JSON.stringify(documentModel), studyId = study.id;
          if (services.document.hasUnsavedChanges()) await services.document.save();
          ({ model: documentModel, path: selectedPath, folder, file } = services.resolveInputs({ model: 'document.model', path: 'selection.path', folder: 'document.folder', file: 'document.file' }));
          study = documentModel?.model?.study?.[selectedPath?.[2]];
          if (`${folder}/${file}` !== identity || JSON.stringify(documentModel) !== modelSnapshot || services.document.hasUnsavedChanges() || study?.id !== studyId || selectedPath?.length !== 3 || selectedPath[1] !== 'study') throw new Error('The document or selected Study changed while saving. Review the saved inputs and run the Study again.');
          runBusy = true; services.ui.updateActionAvailability();
          if (resultPanel) renderResultPanel(documentModel, latestResult);
          const kind = 'gs.studyRun', id = services.operation.createId();
          const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
          const startedAt = new Date().toISOString();
          const inputFingerprint = fingerprint(documentModel);
          services.operation.start(kind, id);
          let terminal;
          try {
            services.operation.beginProgress({ id, kind, label: 'Gerchberg-Saxton', message: 'Preparing study inputs…', total: null, completed: null, cancellable: true });
            const fields = await prepareStudyFields(documentModel.model);
            services.operation.updateProgress(id, { message: 'Running the Rust Gerchberg-Saxton calculation…' });
            const calculation = await commandEngine(services, {
              entry: '--run-study', cwd: folder, input: fields, operationId: id,
            });
            let output;
            try { output = JSON.parse(calculation.stdout); }
            catch { throw new Error('The Gerchberg-Saxton engine returned invalid result data.'); }
            for (const name of ['target', 'phase', 'intensity']) {
              if (!Array.isArray(output[name]) || output[name].length !== output.size * output.size
                || output[name].some(value => name === 'phase' ? value !== null && !Number.isFinite(value) : !Number.isFinite(value))) {
                throw new Error(`The Gerchberg-Saxton engine returned an invalid ${name} array.`);
              }
              output[name] = name === 'phase'
                ? Float32Array.from(output[name], value => value === null ? Number.NaN : value)
                : Float32Array.from(output[name]);
            }
            if (services.operation.stopRequested(kind)) throw new Error('Study was stopped before its results were saved.');
            const completedAt = new Date().toISOString();
            const samplePitchUm = documentModel.model.illumination.samplePitchUm;
            const savedResult = {
              size: output.size, wavelengthNm: output.wavelengthNm, samplePitchUm,
              targetWidthRadPerUm: fields.targetWidthRadPerUm, k0RadPerUm: output.k0RadPerUm, deltaKRadPerUm: output.deltaKRadPerUm,
              kExtent: Math.PI / samplePitchUm,
              target: Array.from(output.target), phase: Array.from(output.phase), intensity: Array.from(output.intensity),
            };
            const run = {
              runId, application: 'gerchbergsaxton', state: 'completed', startedAt, completedAt,
              study: { id: study.id, name: study.name }, inputFingerprint,
              artifacts: ['request.json', 'result.json'],
            };
            await commandEngine(services, {
              entry: '--save-run', cwd: `${folder}/${runsDirectory}/${runId}`, createCwd: true,
              input: { run, request: documentModel, result: savedResult }, operationId: id,
              expectedOutputs: ['run.json', 'request.json', 'result.json'],
            });
            latestResult = { ...output, studyId, iterations: study.iterations, fingerprint: inputFingerprint, runId };
            runRecords = await loadRunHistory(services, folder);
            selectedRunId = runId;
            renderResultPanel(documentModel, latestResult);
            terminal = { state: 'success', message: 'Study completed', progress: 100, completed: study.iterations };
            services.ui.setStatus('Gerchberg-Saxton Study completed.', 'good');
            return { size: output.size, iterations: study.iterations };
          } catch (error) {
            const stopped = services.operation.stopRequested(kind);
            terminal = { state: stopped ? 'cancelled' : 'error', message: stopped ? 'Study stopped' : error.message };
            services.ui.setStatus(terminal.message, stopped ? '' : 'error');
            if (stopped) return { cancelled: true, studyId };
            throw error;
          } finally {
            services.operation.finish(kind, id);
            runBusy = false;
            services.operation.finishProgress(id, terminal);
            await services.operation.finishCancelable(id);
            if (resultPanel) renderResultPanel(documentModel, latestResult);
            services.ui.updateActionAvailability();
            if (lastPreviewArgs) renderPreview({ ...lastPreviewArgs, model: documentModel });
          }
      };
      return base.actions(services, bindings.filter(binding => binding.id === 'document.validate'));
    },
    createProjectDocument(args) { return base.createProjectDocument(args); },
    createModelDocument(args) { return base.createModelDocument(args); },
  };
}
