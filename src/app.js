import { briefToMarkdown } from './markdown.js';
import { buildBriefPrompt, buildDeepeningPrompt } from './prompts.js';
import { countWords, redactSensitiveText } from './redaction.js';
import { clearHistory, loadHistory, saveBriefToHistory } from './storage.js';
import { isFirebaseConfigured } from './config.js';
import { generateMockBrief } from './mock-ai.js';
import {
  generateWithFirebase,
  getFirebaseStatus,
  getOnDeviceAvailability,
  prepareOnDeviceModel
} from './firebase-ai.js';

const SAMPLE = `Launch sync — 24 November

Maya: We agreed to launch the private beta on Friday and to use the new onboarding flow. The old flow will stay available as a fallback.
Ravi: I will finish the payment checklist by Wednesday. The main risk is that two enterprise customers still need security approval.
Lena: Support needs a one-page FAQ before launch. I can draft it tomorrow, but we need to confirm whether refunds are automatic or manual.
Maya: Data from the pilot shows 214 users completed onboarding and 71% finished in under five minutes.
Ravi: The API key for the test dashboard is api_key: demo-secret-value-123 and the staging contact is test.team@example.com.
Lena: We decided not to add live chat in this release. We should schedule a review next week to measure activation and failed payments.
Maya: I need to send the launch summary to leadership by Thursday. The open question is who owns the incident channel during the first weekend.`;

const elements = {
  form: document.querySelector('#composer'),
  title: document.querySelector('#titleInput'),
  type: document.querySelector('#typeInput'),
  audience: document.querySelector('#audienceInput'),
  language: document.querySelector('#languageInput'),
  source: document.querySelector('#sourceInput'),
  wordCount: document.querySelector('#wordCount'),
  sample: document.querySelector('#sampleButton'),
  clear: document.querySelector('#clearButton'),
  privacy: document.querySelector('#privacyToggle'),
  demo: document.querySelector('#demoToggle'),
  generate: document.querySelector('#generateButton'),
  twoPass: document.querySelector('#twoPassButton'),
  message: document.querySelector('#formMessage'),
  outputStatus: document.querySelector('#outputStatus'),
  metadata: document.querySelector('#metadata'),
  empty: document.querySelector('#emptyState'),
  output: document.querySelector('#briefOutput'),
  exportActions: document.querySelector('#exportActions'),
  copy: document.querySelector('#copyButton'),
  downloadMd: document.querySelector('#downloadMdButton'),
  downloadJson: document.querySelector('#downloadJsonButton'),
  save: document.querySelector('#saveButton'),
  firebaseStatus: document.querySelector('#firebaseStatus'),
  appCheckStatus: document.querySelector('#appCheckStatus'),
  nanoStatus: document.querySelector('#nanoStatus'),
  downloadStatus: document.querySelector('#downloadStatus'),
  prepare: document.querySelector('#prepareButton'),
  historyList: document.querySelector('#historyList'),
  clearHistory: document.querySelector('#clearHistoryButton')
};

const state = {
  brief: null,
  metadata: null,
  busy: false
};

function getContext() {
  return {
    title: elements.title.value.trim() || 'Untitled brief',
    inputType: elements.type.value,
    audience: elements.audience.value,
    language: elements.language.value
  };
}

function selectedRoute() {
  return document.querySelector('input[name="route"]:checked')?.value || 'hybrid';
}

function routeLabel(route) {
  return {
    hybrid: 'Hybrid smart · PREFER_ON_DEVICE',
    device: 'Private device · ONLY_ON_DEVICE',
    'cloud-first': 'Cloud first · PREFER_IN_CLOUD',
    cloud: 'Cloud quality · ONLY_IN_CLOUD',
    'two-pass': 'Two-pass · device then cloud'
  }[route] || route;
}

function setBusy(busy, label = 'Working…') {
  state.busy = busy;
  elements.generate.disabled = busy;
  elements.twoPass.disabled = busy;
  elements.prepare.disabled = busy;
  elements.outputStatus.textContent = busy ? label : state.brief ? 'Complete' : 'Ready';
  elements.outputStatus.className = `status-pill ${busy ? 'working' : state.brief ? 'success' : 'neutral'}`;
}

function setMessage(message, isError = false) {
  elements.message.textContent = message;
  elements.message.classList.toggle('error', isError);
}

function updateWordCount() {
  elements.wordCount.textContent = `${countWords(elements.source.value)} words`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function listSection(title, items) {
  if (!items?.length) return '';
  return `<section class="brief-section"><h3>${title}</h3><ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></section>`;
}

function renderBrief(brief, metadata) {
  state.brief = brief;
  state.metadata = metadata;

  const actionRows = brief.actions.length
    ? brief.actions.map((action) => `<tr><td>${escapeHtml(action.task)}</td><td>${escapeHtml(action.owner)}</td><td>${escapeHtml(action.due)}</td><td><span class="priority">${escapeHtml(action.priority)}</span></td></tr>`).join('')
    : '<tr><td colspan="4">No action items identified.</td></tr>';

  const flashcards = brief.flashcards.length
    ? `<section class="brief-section"><h3>Study flashcards</h3><div class="flashcards">${brief.flashcards.map((card) => `<div class="flashcard"><strong>${escapeHtml(card.front)}</strong><span>${escapeHtml(card.back)}</span></div>`).join('')}</div></section>`
    : '';

  elements.output.innerHTML = `
    <section class="brief-section">
      <p class="eyebrow">${escapeHtml(metadata.inputType)} · ${escapeHtml(metadata.audience)}</p>
      <h3 class="brief-headline">${escapeHtml(brief.headline)}</h3>
      <p>${escapeHtml(brief.summary)}</p>
    </section>
    ${listSection('Decisions', brief.decisions)}
    <section class="brief-section">
      <h3>Action items</h3>
      <table class="action-table"><thead><tr><th>Task</th><th>Owner</th><th>Due</th><th>Priority</th></tr></thead><tbody>${actionRows}</tbody></table>
    </section>
    ${listSection('Risks and blockers', brief.risks)}
    ${listSection('Open questions', brief.questions)}
    ${listSection('Evidence and notable details', brief.evidence)}
    ${listSection('Recommended next steps', brief.nextSteps)}
    ${flashcards}
    <section class="brief-section"><h3>Review note</h3><p>${escapeHtml(brief.confidenceNote)}</p></section>
  `;

  elements.metadata.innerHTML = `
    <div><dt>Requested route</dt><dd>${escapeHtml(metadata.routeLabel)}</dd></div>
    <div><dt>Actual source</dt><dd>${escapeHtml(metadata.source)}</dd></div>
    <div><dt>Latency</dt><dd>${escapeHtml(metadata.latencyMs)} ms</dd></div>
    <div><dt>Privacy Shield</dt><dd>${metadata.redactions} masked item${metadata.redactions === 1 ? '' : 's'}</dd></div>
    <div><dt>Engine</dt><dd>${escapeHtml(metadata.engine)}</dd></div>
    <div><dt>Generated</dt><dd>${escapeHtml(new Date(metadata.generatedAt).toLocaleString())}</dd></div>
  `;

  elements.metadata.hidden = false;
  elements.empty.hidden = true;
  elements.output.hidden = false;
  elements.exportActions.hidden = false;
  elements.outputStatus.textContent = 'Complete';
  elements.outputStatus.className = 'status-pill success';
}

function shouldUseDemo(route) {
  return elements.demo.checked || !isFirebaseConfigured();
}

function prepareTextForRoute(text, route) {
  const mustProtect = route !== 'device';
  if (mustProtect && elements.privacy.checked) return redactSensitiveText(text);
  return { text, count: 0 };
}

async function runSingle(route) {
  const sourceText = elements.source.value.trim();
  if (!sourceText) throw new Error('Paste source material or load the demo source first.');

  const context = getContext();
  const started = performance.now();
  const protectedInput = prepareTextForRoute(sourceText, route);

  if (shouldUseDemo(route)) {
    const phase = route === 'cloud' || route === 'cloud-first' ? 'cloud' : 'device';
    const brief = await generateMockBrief({ text: protectedInput.text, context, phase });
    return {
      brief,
      metadata: {
        ...context,
        routeLabel: routeLabel(route),
        source: phase === 'cloud' ? 'DEMO_CLOUD' : 'DEMO_ON_DEVICE',
        engine: 'Local mock engine (Firebase not connected or demo forced)',
        latencyMs: Math.round(performance.now() - started),
        redactions: protectedInput.count,
        generatedAt: new Date().toISOString()
      }
    };
  }

  const prompt = buildBriefPrompt({ text: protectedInput.text, context });
  const result = await generateWithFirebase({ prompt, route });
  return {
    brief: result.brief,
    metadata: {
      ...context,
      routeLabel: routeLabel(route),
      source: result.source,
      engine: `Firebase AI Logic · App Check: ${result.appCheckStatus}`,
      latencyMs: result.latencyMs,
      redactions: protectedInput.count,
      generatedAt: new Date().toISOString()
    }
  };
}

async function runTwoPass() {
  const sourceText = elements.source.value.trim();
  if (!sourceText) throw new Error('Paste source material or load the demo source first.');

  const context = getContext();
  const started = performance.now();
  const cloudInput = elements.privacy.checked ? redactSensitiveText(sourceText) : { text: sourceText, count: 0 };

  if (shouldUseDemo('device')) {
    const first = await generateMockBrief({ text: sourceText, context, phase: 'device' });
    const second = await generateMockBrief({ text: cloudInput.text, context, phase: 'cloud' });
    return {
      brief: second,
      metadata: {
        ...context,
        routeLabel: routeLabel('two-pass'),
        source: 'DEMO_ON_DEVICE → DEMO_CLOUD',
        engine: 'Local two-pass mock (Firebase not connected or demo forced)',
        latencyMs: Math.round(performance.now() - started),
        redactions: cloudInput.count,
        generatedAt: new Date().toISOString()
      },
      firstPass: first
    };
  }

  const firstResult = await generateWithFirebase({
    prompt: buildBriefPrompt({ text: sourceText, context }),
    route: 'device'
  });

  const secondResult = await generateWithFirebase({
    prompt: buildDeepeningPrompt({
      text: cloudInput.text,
      context,
      firstPassBrief: firstResult.brief
    }),
    route: 'cloud'
  });

  return {
    brief: secondResult.brief,
    metadata: {
      ...context,
      routeLabel: routeLabel('two-pass'),
      source: `${firstResult.source} → ${secondResult.source}`,
      engine: `Firebase AI Logic two-pass · App Check: ${secondResult.appCheckStatus}`,
      latencyMs: Math.round(performance.now() - started),
      redactions: cloudInput.count,
      generatedAt: new Date().toISOString()
    },
    firstPass: firstResult.brief
  };
}

async function handleGenerate(event) {
  event?.preventDefault();
  if (state.busy) return;

  setBusy(true, 'Generating…');
  setMessage('');
  try {
    const { brief, metadata } = await runSingle(selectedRoute());
    renderBrief(brief, metadata);
    setMessage('Brief generated. Review names, dates, and commitments before sharing.');
  } catch (error) {
    elements.outputStatus.textContent = 'Needs attention';
    elements.outputStatus.className = 'status-pill error';
    setMessage(error.message || 'Generation failed.', true);
  } finally {
    setBusy(false);
  }
}

async function handleTwoPass() {
  if (state.busy) return;

  setBusy(true, 'Running two-pass…');
  setMessage('Pass 1 stays on-device. Pass 2 uses Privacy Shield before cloud deepening.');
  try {
    const { brief, metadata } = await runTwoPass();
    renderBrief(brief, metadata);
    setMessage('Two-pass brief complete: private extraction first, cloud polish second.');
  } catch (error) {
    elements.outputStatus.textContent = 'Needs attention';
    elements.outputStatus.className = 'status-pill error';
    setMessage(error.message || 'Two-pass generation failed.', true);
  } finally {
    setBusy(false);
  }
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function renderHistory() {
  const history = loadHistory();
  if (!history.length) {
    elements.historyList.innerHTML = '<p class="muted">No saved briefs yet. Saved items stay in this browser\'s local storage.</p>';
    return;
  }

  elements.historyList.innerHTML = '';
  for (const entry of history) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'history-item';
    button.innerHTML = `<span><strong>${escapeHtml(entry.brief.headline)}</strong><br /><span>${escapeHtml(new Date(entry.metadata.generatedAt).toLocaleString())} · ${escapeHtml(entry.metadata.source)}</span></span><span>Open</span>`;
    button.addEventListener('click', () => renderBrief(entry.brief, entry.metadata));
    elements.historyList.append(button);
  }
}

async function refreshConnectionStatus() {
  const configured = isFirebaseConfigured();
  elements.demo.checked = !configured;
  elements.firebaseStatus.textContent = configured ? 'Configured' : 'Demo mode — config placeholders';
  elements.appCheckStatus.textContent = configured ? 'Will initialize with Firebase' : 'Waiting for Firebase setup';

  const nano = await getOnDeviceAvailability();
  elements.nanoStatus.textContent = nano.label;

  if (configured) {
    try {
      const status = await getFirebaseStatus();
      elements.firebaseStatus.textContent = 'Configured and initialized';
      elements.appCheckStatus.textContent = status.appCheckStatus;
    } catch (error) {
      elements.firebaseStatus.textContent = `Initialization failed: ${error.message}`;
    }
  }
}

elements.source.addEventListener('input', updateWordCount);
elements.sample.addEventListener('click', () => {
  elements.source.value = SAMPLE;
  updateWordCount();
  setMessage('Demo source loaded. It intentionally includes an email and a fake secret so Privacy Shield has something to mask before cloud use.');
});
elements.clear.addEventListener('click', () => {
  elements.source.value = '';
  updateWordCount();
  setMessage('');
});
elements.form.addEventListener('submit', handleGenerate);
elements.twoPass.addEventListener('click', handleTwoPass);

elements.copy.addEventListener('click', async () => {
  if (!state.brief) return;
  await navigator.clipboard.writeText(briefToMarkdown(state.brief, state.metadata));
  setMessage('Markdown copied to the clipboard.');
});

elements.downloadMd.addEventListener('click', () => {
  if (!state.brief) return;
  download('clearbrief-brief.md', briefToMarkdown(state.brief, state.metadata), 'text/markdown');
});

elements.downloadJson.addEventListener('click', () => {
  if (!state.brief) return;
  download('clearbrief-brief.json', JSON.stringify({ brief: state.brief, metadata: state.metadata }, null, 2), 'application/json');
});

elements.save.addEventListener('click', () => {
  if (!state.brief || !state.metadata) return;
  saveBriefToHistory({ brief: state.brief, metadata: state.metadata });
  renderHistory();
  setMessage('Brief saved locally in this browser.');
});

elements.clearHistory.addEventListener('click', () => {
  clearHistory();
  renderHistory();
});

elements.prepare.addEventListener('click', async () => {
  if (!isFirebaseConfigured()) {
    elements.downloadStatus.textContent = 'Firebase config required first';
    setMessage('Connect a Firebase project before preparing the SDK-managed on-device model. Demo mode remains fully usable.', true);
    return;
  }

  setBusy(true, 'Preparing model…');
  try {
    await prepareOnDeviceModel((progress) => {
      elements.downloadStatus.textContent = `Downloading: ${Math.round(progress * 100)}%`;
    });
    elements.downloadStatus.textContent = 'Ready or download started';
    setMessage('On-device model preparation was triggered from your click, as required by Chrome user activation.');
  } catch (error) {
    elements.downloadStatus.textContent = 'Preparation failed';
    setMessage(error.message || 'Could not prepare the on-device model.', true);
  } finally {
    setBusy(false);
  }
});

elements.source.value = SAMPLE;
updateWordCount();
renderHistory();
refreshConnectionStatus();
