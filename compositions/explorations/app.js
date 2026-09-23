const $ = selector => document.querySelector(selector);
const grid = $('#grid');
const dialog = $('#detail');
let paintings = [];
let limit = 10;

function show(painting) {
  $('#large').src = painting.image;
  $('#large').alt = painting.title;
  $('#detail-title').textContent = painting.title;
  $('#detail-model').textContent = painting.model;
  dialog.showModal();
}

function render() {
  const model = $('#model').value;
  const filtered = paintings.filter(p => model === 'all' || (model === 'pair' ? ['Sol', 'Astra'].includes(p.family) : p.family === model));
  const shown = limit === 10 ? filtered.slice(0, 10) : filtered;
  $('#count').textContent = `${shown.length} of ${filtered.length}`;
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
    card.append(button, title, meta);
    return card;
  }));
  if (!shown.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'No paintings match this model.';
    grid.append(empty);
  }
}

document.querySelectorAll('[data-limit]').forEach(button => button.addEventListener('click', () => {
  limit = button.dataset.limit === '10' ? 10 : 'all';
  document.querySelectorAll('[data-limit]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  render();
}));
const modelSelect = $('#model');
const modelTrigger = $('#model-trigger');
const modelMenu = $('#model-menu');
for (const option of modelSelect.options) {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'model-option';
  item.textContent = option.textContent;
  item.dataset.model = option.value;
  item.setAttribute('role', 'option');
  item.addEventListener('click', () => {
    modelSelect.value = option.value;
    modelSelect.dispatchEvent(new Event('change'));
    closeModelMenu(true);
  });
  modelMenu.append(item);
}
function syncModel() {
  const label = modelSelect.selectedOptions[0].textContent;
  $('#model-current').textContent = label;
  modelTrigger.setAttribute('aria-label', `Model: ${label}`);
  for (const item of modelMenu.children) item.setAttribute('aria-selected', String(item.dataset.model === modelSelect.value));
}
function closeModelMenu(focus = false) {
  modelMenu.hidden = true;
  modelTrigger.setAttribute('aria-expanded', 'false');
  if (focus) modelTrigger.focus();
}
function openModelMenu() {
  modelMenu.hidden = false;
  modelTrigger.setAttribute('aria-expanded', 'true');
  modelMenu.querySelector('[aria-selected=true]')?.focus();
}
modelTrigger.addEventListener('click', () => modelMenu.hidden ? openModelMenu() : closeModelMenu());
modelTrigger.addEventListener('keydown', event => {
  if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); openModelMenu(); }
});
modelMenu.addEventListener('keydown', event => {
  const items = [...modelMenu.children];
  const current = items.indexOf(document.activeElement);
  let next;
  if (event.key === 'ArrowDown') next = (current + 1) % items.length;
  else if (event.key === 'ArrowUp') next = (current - 1 + items.length) % items.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = items.length - 1;
  else if (event.key === 'Escape') { event.preventDefault(); closeModelMenu(true); return; }
  else if (event.key === ' ') { event.preventDefault(); document.activeElement.click(); return; }
  if (next !== undefined) { event.preventDefault(); items[next].focus(); }
});
document.addEventListener('click', event => { if (!event.target.closest('.model-picker')) closeModelMenu(); });
document.addEventListener('focusin', event => { if (!event.target.closest('.model-picker')) closeModelMenu(); });
modelSelect.addEventListener('change', () => { syncModel(); render(); });
syncModel();
$('#close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });

try {
  const response = await fetch('paintings.json');
  if (!response.ok) throw new Error('Paintings are unavailable.');
  paintings = await response.json();
  render();
} catch (error) {
  grid.textContent = error.message;
}
