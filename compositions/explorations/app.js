import { renderProgram } from './renderer.js';

const $ = selector => document.querySelector(selector);
const grid = $('#grid');
const dialog = $('#detail');
let paintings = [];
const selectedModels = new Set(['Sol', 'Astra']);
let replayDisposers = [];
let activeReplay = null;

function replayControl(painting, art) {
  const canvas = document.createElement('canvas');
  canvas.className = 'replay-canvas';
  canvas.hidden = true;
  art.append(canvas);
  const controls = document.createElement('div');
  controls.className = 'replay-controls';
  const play = document.createElement('button');
  play.className = 'replay-button';
  play.type = 'button';
  const note = document.createElement('span');
  note.className = 'replay-note';
  note.textContent = 'saved plan → painting';
  const code = document.createElement('pre');
  code.className = 'replay-code';
  code.hidden = true;
  code.setAttribute('aria-label', `Compiled plan for ${painting.title}`);
  controls.append(play, note);
  let controller = null;
  let version = 0;
  let played = false;
  function setIcon(mode) {
    const labels = { play: `Play ${painting.title}`, replay: `Replay ${painting.title}`, stop: `Stop replay of ${painting.title}` };
    const shapes = {
      play: '<path d="M8 5v14l11-7z"/>',
      replay: '<path d="M4 11a8 8 0 1 1 2 6"/><path d="M4 5v6h6"/>',
      stop: '<rect x="7" y="7" width="10" height="10" rx="1"/>'
    };
    play.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${shapes[mode]}</svg>`;
    play.setAttribute('aria-label', labels[mode]);
    play.title = labels[mode];
  }
  function stop() {
    if (activeReplay === stop) activeReplay = null;
    version++;
    controller?.abort();
    controller = null;
    canvas.hidden = true;
    code.hidden = true;
    note.textContent = 'stopped';
    setIcon(played ? 'replay' : 'play');
  }
  setIcon('play');
  play.addEventListener('click', async () => {
    if (controller) { stop(); return; }
    activeReplay?.();
    activeReplay = stop;
    controller = new AbortController();
    const current = ++version;
    setIcon('stop');
    note.textContent = 'loading saved strokes…';
    try {
      if (!('DecompressionStream' in window)) throw new Error('Playback needs a newer browser.');
      const response = await fetch(painting.replay, { signal: controller.signal });
      if (!response.ok || !response.body) throw new Error('Could not load this replay.');
      const bytes = new Uint8Array(await response.arrayBuffer());
      const encoded = bytes[0] === 0x1f && bytes[1] === 0x8b;
      const replay = encoded
        ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json()
        : JSON.parse(new TextDecoder().decode(bytes));
      const { program, code: source } = replay;
      if (current !== version) return;
      code.textContent = source;
      code.hidden = false;
      canvas.hidden = false;
      note.textContent = 'replaying saved strokes';
      const finished = await renderProgram(program, canvas, {
        width: 400, height: 500,
        isCancelled: () => current !== version,
        onProgress: percent => { if (current === version) note.textContent = `replaying · ${percent}%`; }
      });
      if (current !== version) return;
      controller = null;
      if (activeReplay === stop) activeReplay = null;
      played = !!finished;
      note.textContent = finished ? 'replay complete' : 'stopped';
      setIcon(finished ? 'replay' : 'play');
    } catch (error) {
      if (current !== version) return;
      controller = null;
      if (activeReplay === stop) activeReplay = null;
      canvas.hidden = true;
      code.hidden = true;
      note.textContent = error.name === 'AbortError' ? 'stopped' : error.message;
      setIcon(played ? 'replay' : 'play');
    }
  });
  return { controls, code, dispose: stop };
}

function show(painting) {
  $('#large').src = painting.image;
  $('#large').alt = painting.title;
  $('#detail-title').textContent = painting.title;
  $('#detail-model').textContent = painting.model;
  dialog.showModal();
}

function render() {
  for (const dispose of replayDisposers) dispose();
  replayDisposers = [];
  const filtered = paintings.filter(p => selectedModels.has(p.family));
  const shown = filtered;
  $('#count').textContent = `${shown.length} painting${shown.length === 1 ? '' : 's'}`;
  grid.replaceChildren(...shown.map(p => {
    const card = document.createElement('article');
    card.className = 'card';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'art';
    button.setAttribute('aria-label', `View ${p.title} by ${p.family}`);
    const image = document.createElement('img');
    image.src = p.image;
    image.alt = p.title;
    image.loading = 'lazy';
    button.append(image);
    button.addEventListener('click', () => show(p));
    const title = document.createElement('h2');
    title.textContent = p.title;
    const meta = document.createElement('p');
    meta.className = 'meta';
    meta.textContent = p.model;
    const replay = replayControl(p, button);
    replayDisposers.push(replay.dispose);
    card.append(button, title, meta, replay.controls, replay.code);
    return card;
  }));
  if (!shown.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'No paintings match these models.';
    grid.append(empty);
  }
}

const modelTrigger = $('#model-trigger');
const modelMenu = $('#model-menu');
const modelChecks = [...modelMenu.querySelectorAll('input[type=checkbox]')];
function syncModel() {
  const label = modelChecks.filter(input => input.checked).map(input => input.value.toLowerCase()).join(' + ') || 'no models';
  $('#model-current').textContent = label;
  modelTrigger.setAttribute('aria-label', `Models: ${label}`);
}
function closeModelMenu(focus = false) {
  modelMenu.hidden = true;
  modelTrigger.setAttribute('aria-expanded', 'false');
  if (focus) modelTrigger.focus();
}
function openModelMenu() {
  modelMenu.hidden = false;
  modelTrigger.setAttribute('aria-expanded', 'true');
  (modelChecks.find(input => input.checked) || modelChecks[0])?.focus();
}
modelTrigger.addEventListener('click', () => modelMenu.hidden ? openModelMenu() : closeModelMenu());
modelTrigger.addEventListener('keydown', event => {
  if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); openModelMenu(); }
});
modelMenu.addEventListener('keydown', event => {
  const current = modelChecks.indexOf(document.activeElement);
  let next;
  if (event.key === 'ArrowDown') next = (current + 1) % modelChecks.length;
  else if (event.key === 'ArrowUp') next = (current - 1 + modelChecks.length) % modelChecks.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = modelChecks.length - 1;
  else if (event.key === 'Escape') { event.preventDefault(); closeModelMenu(true); return; }
  if (next !== undefined) { event.preventDefault(); modelChecks[next].focus(); }
});
document.addEventListener('click', event => { if (!event.target.closest('.model-picker')) closeModelMenu(); });
document.addEventListener('focusin', event => { if (!event.target.closest('.model-picker')) closeModelMenu(); });
for (const input of modelChecks) input.addEventListener('change', () => {
  input.checked ? selectedModels.add(input.value) : selectedModels.delete(input.value);
  syncModel(); render();
});
syncModel();
$('#close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });

let catalog = '';
async function refreshPaintings() {
  try {
    const response = await fetch('paintings.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Paintings are unavailable.');
    const next = await response.json();
    const fingerprint = JSON.stringify(next);
    if (fingerprint !== catalog) {
      catalog = fingerprint;
      paintings = next;
      render();
    }
  } catch (error) {
    if (!catalog) grid.textContent = error.message;
  }
}
await refreshPaintings();
setInterval(refreshPaintings, 60_000);
