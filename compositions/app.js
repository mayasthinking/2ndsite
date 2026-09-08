import { EFFECT_GROUPS, BRUSH_TYPES, BRUSH_SLIDERS, PLACEMENT_SLIDERS, DEFAULT_COLOR, clampEffects } from "./effect-model.js?v=15";
import { parseColor, oklchToHex } from "./color.js";
import { mountColorSquare } from "./color-dial.js?v=14";
import { imageWork } from "./image-work.js?v=4";
import { splitSubjectFromImageData } from "./photo-wash-plan.js?v=4";
const sceneEl = document.querySelector("#scene");
const sceneRow = document.querySelector(".scene-row");
const sceneCaption = document.querySelector("#sceneCaption");
const sceneCaptionImg = document.querySelector("#sceneCaptionImg");
const sceneCaptionText = document.querySelector("#sceneCaptionText");
const countEl = document.querySelector("#count");
const nativeSelectValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
const paintEl = document.querySelector("#paint");
const wallEl = document.querySelector("#wall");
const samplesEl = document.querySelector("#samples");
const photoEl = document.querySelector("#photo");
const photoChip = document.querySelector("#photoChip");
const paintKit = document.querySelector("#paintKit");
const deskEl = document.querySelector("#desk");
const mobileSheet = document.querySelector("#mobileSheet");
const mobileSheetHandle = document.querySelector(".mobile-sheet-handle");
const modeButtons = [...document.querySelectorAll(".mode-btn")];
const providerEl = document.querySelector("#provider");
const apiKeyEl = document.querySelector("#apiKey");
const renderer = document.querySelector("#renderer");
const effectGroupsEl = document.querySelector("#effectGroups");
const pigmentColorEl = document.querySelector("#pigmentColor");
const brushEl = document.querySelector("#brush");
const brushControlsEl = document.querySelector("#brushControls");
const placementEl = document.querySelector("#placement");
const placementControlsEl = document.querySelector("#placementControls");
const mobileEditor = document.querySelector("#mobileEditor");
const mobileBrushOptions = document.querySelector(".mobile-brush-options");
const mobileToolButtons = [...document.querySelectorAll("[data-mobile-tool]")];
const mobileToolPanels = [...document.querySelectorAll("[data-tool-panel]")];
const mobileEffectInputs = [...document.querySelectorAll("[data-mobile-effect]")];

const stored = JSON.parse(localStorage.getItem("wash.settings") || "{}");
if (stored.provider) providerEl.value = stored.provider;
if (stored.apiKey) apiKeyEl.value = stored.apiKey;

let samples = [];
let paintings = [];
let selectedId = null;
const cards = new Map();
const paintQueue = [];
const photoPreviewQueue = [];
let paintingNow = false;
let photoPreviewNow = false;
let rendererReady = false;
let waitingId = null;
let effects = clampEffects(stored.effects || {});
let effectTimer = null;
let dirtyIds = new Set();
let stagedSheet = null;
const sheetStageEl = document.querySelector("#sheetStage");
let hydrating = false;
const SAT_MAX = 0.22;
const PAINT_SIZE = 720;
let currentPhoto = null;
let paintWatch = 0;
let waitingDensity = 1;

window.addEventListener("message", onFrameMessage);

providerEl.addEventListener("change", () => {
  persistSettings();
  apiKeyEl.placeholder = providerEl.value === "grok" ? "xai-…" : "sk-…";
});
apiKeyEl.addEventListener("change", persistSettings);
apiKeyEl.placeholder = providerEl.value === "grok" ? "xai-…" : "sk-…";

function closeSheetColorMenus() {
  for (const menu of document.querySelectorAll(".sheet-color-menu")) {
    menu.hidden = true;
    const host = menu._host;
    if (host && menu.parentElement !== host) host.append(menu);
  }
  for (const btn of document.querySelectorAll(".sheet-edit-color[aria-expanded='true']")) {
    btn.setAttribute("aria-expanded", "false");
  }
}

function closeChoiceMenus(except) {
  for (const wrap of document.querySelectorAll(".choice.is-open")) {
    if (wrap === except) continue;
    wrap._choiceClose?.();
  }
}

function mountChoice(select, options = {}) {
  if (!select || select.closest(".choice")) return select;
  select.classList.add("choice-native");
  select.setAttribute("tabindex", "-1");
  select.setAttribute("aria-hidden", "true");

  const wrap = document.createElement("div");
  wrap.className = "choice";
  if (select.id === "count") wrap.classList.add("is-count");
  select.before(wrap);
  wrap.append(select);

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "choice-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  const label = select.getAttribute("aria-label") || "choose";
  trigger.setAttribute("aria-label", label);

  const menu = document.createElement("ul");
  menu.className = select.id === "count" ? "choice-menu is-count" : "choice-menu";
  menu.setAttribute("role", "listbox");
  menu.setAttribute("aria-label", label);
  menu.hidden = true;
  wrap.append(trigger, menu);

  const menuId = `choice-menu-${select.id || "anon"}`;
  menu.id = menuId;
  trigger.setAttribute("aria-controls", menuId);

  function optionList() {
    return [...select.options].map((opt) => ({ value: opt.value, label: opt.textContent }));
  }

  function sync() {
    const current = nativeSelectValue.get.call(select);
    const match = optionList().find((opt) => opt.value === current);
    const text = match?.label ?? current;
    if (typeof options.renderTrigger === "function") {
      options.renderTrigger(trigger, current, text);
    } else {
      trigger.textContent = text;
    }
    for (const item of menu.querySelectorAll("[role=option]")) {
      const on = item.dataset.value === current;
      item.classList.toggle("is-selected", on);
      item.setAttribute("aria-selected", on ? "true" : "false");
    }
  }

  function renderMenu() {
    menu.replaceChildren();
    for (const opt of optionList()) {
      const item = document.createElement("li");
      item.setAttribute("role", "option");
      item.dataset.value = opt.value;
      item.textContent = opt.label;
      item.tabIndex = -1;
      menu.append(item);
    }
    sync();
  }

  function placeMenu() {
    const rect = trigger.getBoundingClientRect();
    const gap = 6;
    const compact = wrap.classList.contains("is-count");
    const view = viewSize();
    menu.style.minWidth = compact ? "2.6rem" : `${Math.max(rect.width, 72)}px`;
    menu.style.maxHeight = `${Math.min(280, view.height - 16)}px`;
    menu.style.bottom = "auto";
    const spaceBelow = view.height - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    const openUp = spaceBelow < 160 && spaceAbove > spaceBelow;
    menu.style.left = compact ? `${rect.right}px` : `${rect.left}px`;
    menu.style.top = openUp ? `${Math.max(8, rect.top - gap)}px` : `${rect.bottom + gap}px`;
    const box = menu.getBoundingClientRect();
    if (openUp || (box.bottom > view.height - 8 && spaceAbove > box.height + gap)) {
      menu.style.top = `${Math.max(8, rect.top - box.height - gap)}px`;
    }
    if (compact) {
      menu.style.left = `${Math.max(8, rect.right - box.width)}px`;
    } else if (box.right > view.width - 8) {
      menu.style.left = `${Math.max(8, rect.right - box.width)}px`;
    }
  }

  function close() {
    if (!wrap.classList.contains("is-open")) return;
    wrap.classList.remove("is-open");
    trigger.setAttribute("aria-expanded", "false");
    menu.hidden = true;
    wrap.append(menu);
  }

  function open() {
    closeChoiceMenus(wrap);
    closeSheetColorMenus();
    renderMenu();
    wrap.classList.add("is-open");
    trigger.setAttribute("aria-expanded", "true");
    document.body.append(menu);
    menu.hidden = false;
    holdPopovers();
    placeMenu();
    const selected = menu.querySelector("[role=option].is-selected") || menu.querySelector("[role=option]");
    selected?.focus({ preventScroll: true });
  }

  function pick(value) {
    const current = nativeSelectValue.get.call(select);
    if (current !== value) {
      nativeSelectValue.set.call(select, value);
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    sync();
    close();
    trigger.focus();
  }

  wrap._choiceClose = close;

  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    if (wrap.classList.contains("is-open")) close();
    else open();
  });

  trigger.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!wrap.classList.contains("is-open")) open();
      const items = [...menu.querySelectorAll("[role=option]")];
      if (event.key === "ArrowUp") items.at(-1)?.focus();
    } else if (event.key === "Escape" && wrap.classList.contains("is-open")) {
      event.preventDefault();
      close();
    }
  });

  menu.addEventListener("click", (event) => {
    const item = event.target.closest("[role=option]");
    if (item) pick(item.dataset.value);
  });

  menu.addEventListener("keydown", (event) => {
    const items = [...menu.querySelectorAll("[role=option]")];
    const index = items.indexOf(document.activeElement);
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      trigger.focus();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      items[Math.min(items.length - 1, Math.max(0, index) + 1)]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      items[Math.max(0, index - 1)]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      items.at(-1)?.focus();
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const item = document.activeElement?.closest("[role=option]");
      if (item) pick(item.dataset.value);
    } else if (event.key === "Tab") {
      close();
    }
  });

  Object.defineProperty(select, "value", {
    configurable: true,
    get() {
      return nativeSelectValue.get.call(this);
    },
    set(next) {
      nativeSelectValue.set.call(this, next);
      sync();
    },
  });

  renderMenu();
  return select;
}

function isCompact() {
  return window.matchMedia("(max-width: 720px), (max-height: 540px) and (max-width: 960px)").matches;
}

function isPhone() {
  return window.matchMedia("(max-width: 720px)").matches;
}

function viewSize() {
  return {
    width: Math.round(window.visualViewport?.width || window.innerWidth),
    height: Math.round(window.visualViewport?.height || window.innerHeight),
  };
}

function syncAppHeight() {
  document.documentElement.style.setProperty("--app-h", `${viewSize().height}px`);
}

let popoverHold = 0;

function holdPopovers(ms = 400) {
  popoverHold = Date.now() + ms;
}

function closePopovers() {
  if (Date.now() < popoverHold) return;
  closeChoiceMenus();
  closeSheetColorMenus();
}

document.addEventListener("pointerdown", (event) => {
  if (event.target.closest(".choice") || event.target.closest(".choice-menu")) return;
  if (event.target.closest(".sheet-edit-color") || event.target.closest(".sheet-color-menu")) return;
  closePopovers();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  const popoverOpen = document.querySelector(".choice.is-open, .sheet-color-menu:not([hidden])");
  if (popoverOpen) {
    closePopovers();
    return;
  }
  if (stagedSheet) closeSheetStage();
});

window.addEventListener("resize", () => {
  closePopovers();
  sizeScene();
  syncAppHeight();
});
document.addEventListener(
  "scroll",
  (event) => {
    const target = event.target;
    if (target instanceof Element && target.closest(".choice-menu, .sheet-color-menu, .sheet-edit")) return;
    closePopovers();
  },
  true
);
window.visualViewport?.addEventListener("resize", syncAppHeight);
window.visualViewport?.addEventListener("scroll", syncAppHeight);
window.addEventListener("orientationchange", () => {
  requestAnimationFrame(() => {
    syncAppHeight();
    sizeScene();
    closePopovers();
  });
});
syncAppHeight();

mountChoice(countEl, {
  renderTrigger(trigger, _value, label) {
    const word = document.createElement("span");
    word.className = "count-word";
    word.textContent = "variations";
    const num = document.createElement("span");
    num.className = "count-num";
    num.textContent = `x${label}`;
    trigger.replaceChildren(word, num);
  },
});
mountChoice(providerEl);

function sizeScene() {
  const compact = isCompact();
  const max = compact ? 96 : 160;
  sceneEl.style.height = "auto";
  const next = Math.min(Math.max(sceneEl.scrollHeight, 28), max);
  sceneEl.style.height = `${next}px`;
  sceneEl.style.overflowY = sceneEl.scrollHeight > max ? "auto" : "hidden";
}

sceneEl.addEventListener("input", sizeScene);
document.fonts?.ready?.then(() => sizeScene());
sizeScene();
sceneEl.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  paintEl.click();
});
sceneEl.addEventListener("focus", () => {
  requestAnimationFrame(() => sceneEl.scrollIntoView({ block: "nearest", behavior: "smooth" }));
});

function setPhotoLabel(name) {
  const label = name ? name : "upload photo";
  photoChip.setAttribute("aria-label", label);
  photoChip.title = label;
  photoChip.classList.toggle("active", Boolean(name));
}

function captionFromName(name) {
  return String(name || "")
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase() || "photograph";
}

function showSceneCaption(dataUrl, name) {
  const caption = captionFromName(name);
  sceneEl.value = caption;
  if (sceneCaptionImg) sceneCaptionImg.src = dataUrl || "";
  if (sceneCaptionText) sceneCaptionText.textContent = caption;
  if (sceneCaption) sceneCaption.hidden = false;
  sceneRow?.classList.add("has-photo");
  sizeScene();
}

function hideSceneCaption() {
  if (sceneCaption) sceneCaption.hidden = true;
  if (sceneCaptionImg) sceneCaptionImg.removeAttribute("src");
  if (sceneCaptionText) sceneCaptionText.textContent = "";
  sceneRow?.classList.remove("has-photo");
  sizeScene();
}

function clearPhoto() {
  currentPhoto = null;
  photoEl.value = "";
  setPhotoLabel("");
  hideSceneCaption();
}

function averageHex(img) {
  const canvas = document.createElement("canvas");
  canvas.width = 24;
  canvas.height = 24;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, 24, 24);
  const data = ctx.getImageData(0, 0, 24, 24).data;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] + data[i + 1] + data[i + 2] > 700) continue;
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    n += 1;
  }
  if (!n) return "#8b2f32";
  const hex = (v) => Math.round(v / n).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

function rasterizePhoto(source) {
  const width = source.naturalWidth || source.width;
  const height = source.naturalHeight || source.height;
  if (!width || !height) throw new Error("that photograph would not open.");
  const max = 1400;
  const scale = Math.min(1, max / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
  return {
    dataUrl: canvas.toDataURL("image/jpeg", 0.86),
    hex: averageHex(source),
  };
}

function loadImageUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("that photograph would not open."));
    img.src = url;
  });
}

async function readPhotoFile(file) {
  const name = file.name.replace(/\.[^.]+$/, "").toLowerCase() || "photograph";
  try {
    const next = await imageWork("rasterize", { file });
    if (next?.dataUrl) return { ...next, name };
  } catch {
    /* fall through */
  }
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      const next = rasterizePhoto(bitmap);
      bitmap.close?.();
      return { ...next, name };
    } catch {
      /* fall through and try a blob url */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImageUrl(url);
    return { ...rasterizePhoto(img), name };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function onPhotoChosen() {
  const file = photoEl.files?.[0];
  if (!file) return;
  setStatus("opening the photograph…");
  try {
    const photo = await readPhotoFile(file);
    currentPhoto = photo.dataUrl;
    setPhotoLabel(photo.name);
    if (photo.hex) colorPicker?.setValue(photo.hex);
    persistSettings();
    showSceneCaption(photo.dataUrl, photo.name);
    paintPhoto();
  } catch (err) {
    setStatus(err.message || "that photograph would not open.");
  }
}

function paintPhoto() {
  if (!currentPhoto) return;
  const n = Math.max(1, Math.min(6, Number(countEl.value) || 4));
  const base = Math.floor(Math.random() * 8000);
  paintings = Array.from({ length: n }, (_, i) => ({
    id: `photo-${base}-${i + 1}`,
    prompt: sceneEl.value.trim() || "photograph",
    seed: 11 + i * 97,
    photo: currentPhoto,
    code: "",
    source: "photo",
  }));
  paintEl.disabled = true;
  setStatus("washing the photograph…");
  renderGrid(paintings);
  paintEl.disabled = false;
}

photoEl.addEventListener("change", onPhotoChosen);

function openPaintSections() {
  for (const id of ["brush", "placement", "effects"]) {
    const pane = document.querySelector(`#${id}`);
    if (pane) pane.open = true;
  }
}

function studioMode() {
  return deskEl?.dataset.mode === "customize" ? "customize" : "create";
}

function setStudioMode(mode) {
  const next = mode === "customize" ? "customize" : "create";
  if (deskEl) deskEl.dataset.mode = next;
  for (const btn of modeButtons) {
    const on = btn.dataset.mode === next;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
    btn.tabIndex = on ? 0 : -1;
  }
  if (paintKit) paintKit.open = next === "customize";
  if (next === "customize") openPaintSections();
  if (deskEl && next === "create") {
    deskEl.scrollTop = 0;
    requestAnimationFrame(() => {
      deskEl.scrollTop = 0;
    });
  }
  if (isPhone()) setMobileSheet(true);
}

function mountModeSwitch() {
  for (const btn of modeButtons) {
    btn.addEventListener("click", () => setStudioMode(btn.dataset.mode));
  }
  document.querySelector(".mode-switch")?.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    setStudioMode(studioMode() === "create" ? "customize" : "create");
    document.querySelector(`.mode-btn[data-mode="${studioMode()}"]`)?.focus();
  });
}

function fitPaintKit() {
  if (!paintKit || fitPaintKit.done) return;
  paintKit.open = studioMode() === "customize";
  openPaintSections();
  const samples = document.querySelector("#sampleKit");
  if (samples) samples.open = true;
  paintKit.querySelector("summary")?.addEventListener("click", (event) => {
    event.preventDefault();
  });
  paintKit.addEventListener("toggle", () => {
    if (paintKit.open) openPaintSections();
    if (isPhone()) syncMobileSheet(mobileSheet?.classList.contains("is-expanded"));
  });
  fitPaintKit.done = true;
}

function syncMobileSheet(expanded) {
  if (!mobileSheet || !mobileSheetHandle) return;
  const mode = studioMode();
  mobileSheet.classList.toggle("is-expanded", expanded);
  mobileSheetHandle.setAttribute("aria-expanded", expanded ? "true" : "false");
  mobileSheetHandle.setAttribute("aria-label", expanded ? `close ${mode}` : `open ${mode}`);
  mobileSheetHandle.setAttribute("aria-controls", mode === "customize" ? "paintKit" : "createPane");
  const label = mobileSheetHandle.querySelector(".mobile-sheet-label");
  if (label) label.textContent = mode;
  if (!expanded) mobileSheet.scrollTop = 0;
}

function setMobileSheet(expanded) {
  if (!isPhone() || !paintKit) return;
  const fromHeight = mobileSheet?.getBoundingClientRect().height;
  syncMobileSheet(expanded);
  paintKit.open = studioMode() === "customize";
  if (fromHeight == null || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  requestAnimationFrame(() => {
    const toHeight = mobileSheet.getBoundingClientRect().height;
    if (Math.abs(toHeight - fromHeight) < 1) return;
    mobileSheet.getAnimations().forEach((animation) => animation.cancel());
    // The sheet stays pinned to the bottom; only its top edge grows or shrinks.
    mobileSheet.animate(
      [{ height: `${fromHeight}px` }, { height: `${toHeight}px` }],
      { duration: 220, easing: "cubic-bezier(.22,.8,.32,1)" }
    );
  });
}

function mountMobileSheet() {
  if (!mobileSheet || !mobileSheetHandle || !paintKit) return;
  let startY = null;
  let suppressClick = false;

  mobileSheetHandle.addEventListener("pointerdown", (event) => {
    if (!isPhone()) return;
    startY = event.clientY;
    mobileSheetHandle.setPointerCapture(event.pointerId);
  });

  mobileSheetHandle.addEventListener("pointerup", (event) => {
    if (startY == null) return;
    const delta = event.clientY - startY;
    startY = null;
    if (Math.abs(delta) < 24) return;
    suppressClick = true;
    setMobileSheet(delta < 0);
    setTimeout(() => {
      suppressClick = false;
    }, 0);
  });

  mobileSheetHandle.addEventListener("pointercancel", () => {
    startY = null;
  });

  mobileSheetHandle.addEventListener("click", (event) => {
    if (!isPhone()) return;
    if (suppressClick) {
      suppressClick = false;
      event.preventDefault();
      return;
    }
    setMobileSheet(!mobileSheet.classList.contains("is-expanded"));
  });

  window.matchMedia("(max-width: 720px)").addEventListener("change", (event) => {
    if (event.matches) setMobileSheet(false);
    else syncMobileSheet(false);
  });
  syncMobileSheet(false);
}

function persistSettings() {
  effects = readEffects();
  localStorage.setItem(
    "wash.settings",
    JSON.stringify({
      provider: providerEl.value,
      apiKey: apiKeyEl.value,
      effects,
    })
  );
}

function sheetEffects(rec) {
  return clampEffects(rec?.item.effects || effects);
}

function applyEffectsToControls(fx) {
  hydrating = true;
  const next = clampEffects(fx);
  const typeEl = document.querySelector("#brushType");
  if (typeEl) typeEl.value = next.brushType || "HB";
  const setRange = (root, id, value) => {
    const input = root?.querySelector(`[data-effect="${id}"]`);
    if (input) input.value = String(Math.round((value ?? 0.5) * 100));
  };
  for (const key of BRUSH_SLIDERS) setRange(brushControlsEl, key.id, next[key.id]);
  for (const key of PLACEMENT_SLIDERS) setRange(placementControlsEl, key.id, next[key.id]);
  for (const group of EFFECT_GROUPS) {
    for (const key of group.keys) setRange(effectGroupsEl, key.id, next[key.id]);
  }
  document.querySelector("#placeStick")?.syncThumb?.();
  if (next.color) {
    pigmentColorEl.value = oklchToHex(next.color);
    colorPicker?.setValue(next.color);
  }
  hydrating = false;
}

function syncSheetEditor(rec) {
  const edit = rec?.sheet.querySelector(".sheet-edit");
  if (!edit) return;
  const fx = sheetEffects(rec);
  const swatch = edit.querySelector(".sheet-edit-swatch");
  const sat = edit.querySelector(".sheet-edit-sat input");
  const brush = edit.querySelector(".sheet-edit-brush");
  const hex = oklchToHex(fx.color || DEFAULT_COLOR);
  if (swatch) swatch.style.background = hex;
  if (sat) {
    const pct = Math.round(Math.min(1, (fx.color?.c ?? 0) / SAT_MAX) * 100);
    sat.value = String(pct);
    const rail = sat.closest(".sheet-edit-sat-rail");
    rail?.style.setProperty("--sat", String(pct / 100));
    rail?.style.setProperty("--pigment", hex);
  }
  if (brush) brush.value = fx.brushType || "HB";
  edit._colorPicker?.setValue(fx.color || DEFAULT_COLOR);
}

function afterDeskChange() {
  if (hydrating) return;
  persistSettings();
  const rec = selectedId ? cards.get(selectedId) : null;
  if (!rec?.item) return;
  rec.item.effects = readEffects();
  syncSheetEditor(rec);
  scheduleSheetRender(selectedId);
}

function mountSheetEditor(sheet, item) {
  const edit = sheet.querySelector(".sheet-edit");
  if (!edit) return;
  const frame = sheet.querySelector(".frame");
  const caption = sheet.querySelector(".caption");
  const meta = sheet.querySelector(".caption-meta");
  const grip = edit.querySelector(".sheet-edit-grip");
  const colorBtn = edit.querySelector(".sheet-edit-color");
  const sat = edit.querySelector(".sheet-edit-sat input");
  const brush = edit.querySelector(".sheet-edit-brush");
  brush.id = `sheet-brush-${item.id}`;
  for (const name of BRUSH_TYPES) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name.toLowerCase();
    brush.append(option);
  }
  mountChoice(brush, {
    renderTrigger(trigger, _value, label) {
      const icon = document.querySelector('[data-mobile-tool="brush"] svg')?.cloneNode(true) || document.createElement("span");
      icon.setAttribute("aria-hidden", "true");
      const word = document.createElement("span");
      word.textContent = label;
      trigger.replaceChildren(icon, word);
    },
  });
  brush.closest(".choice")?.classList.add("is-sheet");

  const colorMenu = document.createElement("div");
  colorMenu.className = "choice-menu sheet-color-menu";
  colorMenu.setAttribute("role", "dialog");
  colorMenu.setAttribute("aria-label", "color");
  colorMenu.id = `sheet-color-${item.id}`;
  colorMenu.dataset.sheet = item.id;
  colorMenu.hidden = true;
  colorMenu._host = edit;
  edit._colorMenu = colorMenu;
  colorBtn.setAttribute("aria-controls", colorMenu.id);
  edit.append(colorMenu);
  edit._colorPicker = mountColorSquare({
    host: colorMenu,
    value: sheetEffects({ item }).color || DEFAULT_COLOR,
    onChange: (color) => apply({ color }),
  });

  const setSide = (side) => {
    if (side !== "free") item.dockSide = side;
    item.editSide = side;
    edit.classList.remove("is-left", "is-right", "is-bottom", "is-row", "is-free", "is-dragging");
    edit.classList.add(`is-${side}`);
    edit.style.left = "";
    edit.style.top = "";
    edit.style.right = "";
    edit.style.bottom = "";
    edit.style.transform = "";
    if (side === "row") caption?.insertBefore(edit, meta);
    else frame.append(edit);
  };

  const applyFreePos = () => {
    const pos = item.stagePos;
    if (!pos) return;
    item.editSide = "free";
    edit.classList.remove("is-left", "is-right", "is-bottom", "is-row", "is-dragging");
    edit.classList.add("is-free");
    if (!frame.contains(edit)) frame.append(edit);
    edit.style.left = `${pos.x * 100}%`;
    edit.style.top = `${pos.y * 100}%`;
    edit.style.right = "auto";
    edit.style.bottom = "auto";
    edit.style.transform = "translate(-50%, -50%)";
  };

  const setFree = (event) => {
    const box = frame.getBoundingClientRect();
    const size = edit.getBoundingClientRect();
    const padX = size.width / 2 + 8;
    const padY = size.height / 2 + 8;
    const left = Math.max(padX, Math.min(event.clientX - box.left, box.width - padX));
    const top = Math.max(padY, Math.min(event.clientY - box.top, box.height - padY));
    item.stagePos = { x: left / box.width, y: top / box.height };
    applyFreePos();
  };

  setSide(item.editSide === "left" || item.editSide === "right" || item.editSide === "bottom" ? item.editSide : "row");
  syncSheetEditor({ item, sheet });
  edit._onStage = () => {
    if (item.stagePos) applyFreePos();
  };
  edit._offStage = () => {
    if (item.editSide === "free") setSide(item.dockSide || "row");
  };

  const apply = (patch) => {
    const rec = cards.get(item.id);
    if (!rec) return;
    rec.item.effects = clampEffects({ ...sheetEffects(rec), ...patch });
    selectPainting(item.id);
    persistSettings();
    scheduleSheetRender(item.id);
  };

  const placeColorMenu = () => {
    const rect = colorBtn.getBoundingClientRect();
    const gap = 8;
    const box = colorMenu.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - box.width / 2;
    let top = rect.top - box.height - gap;
    if (top < 8) top = rect.bottom + gap;
    const view = viewSize();
    left = Math.max(8, Math.min(left, view.width - box.width - 8));
    top = Math.max(8, Math.min(top, view.height - box.height - 8));
    colorMenu.style.left = `${left}px`;
    colorMenu.style.top = `${top}px`;
  };

  const openColorMenu = () => {
    closeChoiceMenus();
    closeSheetColorMenus();
    colorBtn.setAttribute("aria-expanded", "true");
    document.body.append(colorMenu);
    colorMenu.hidden = false;
    holdPopovers();
    placeColorMenu();
    colorMenu.querySelector(".color-square-map")?.focus({ preventScroll: true });
  };

  edit.addEventListener("click", (event) => event.stopPropagation());
  edit.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
    if (!event.target.closest(".choice, .choice-menu")) closeChoiceMenus();
    if (!event.target.closest(".sheet-edit-color, .sheet-color-menu")) closeSheetColorMenus();
  });

  let colorOpenedAt = 0;
  colorBtn.addEventListener("click", (event) => {
    event.preventDefault();
    if (colorBtn.getAttribute("aria-expanded") === "true") {
      if (Date.now() - colorOpenedAt < 400) return;
      closeSheetColorMenus();
    } else {
      openColorMenu();
      colorOpenedAt = Date.now();
    }
  });
  colorMenu.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeSheetColorMenus();
      colorBtn.focus();
    }
  });
  sat.addEventListener("input", () => {
    const rec = cards.get(item.id);
    const current = sheetEffects(rec).color || DEFAULT_COLOR;
    const rail = sat.closest(".sheet-edit-sat-rail");
    rail?.style.setProperty("--sat", String(Number(sat.value) / 100));
    apply({ color: { ...current, c: (Number(sat.value) / 100) * SAT_MAX } });
  });
  brush.addEventListener("change", () => apply({ brushType: brush.value }));

  let dragging = false;
  const follow = (event) => {
    const box = frame.getBoundingClientRect();
    edit.style.left = `${event.clientX - box.left}px`;
    edit.style.top = `${event.clientY - box.top}px`;
    edit.style.right = "auto";
    edit.style.bottom = "auto";
    edit.style.transform = "translate(-50%, -50%)";
  };
  const snapFrom = (event) => {
    const box = frame.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width;
    const y = (event.clientY - box.top) / box.height;
    if (y > 1 || (y > 0.86 && x > 0.22 && x < 0.78)) setSide("row");
    else if (y > 0.7 && x > 0.28 && x < 0.72) setSide("bottom");
    else setSide(x < 0.5 ? "left" : "right");
  };

  grip.addEventListener("pointerdown", (event) => {
    if (isCompact()) return;
    if (event.button != null && event.button !== 0) return;
    event.preventDefault();
    closePopovers();
    dragging = true;
    if (!frame.contains(edit)) frame.append(edit);
    edit.classList.add("is-dragging");
    try {
      grip.setPointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
    follow(event);
  });
  grip.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    follow(event);
  });
  const endDrag = (event) => {
    if (!dragging) return;
    dragging = false;
    if (sheet.classList.contains("is-expanded")) setFree(event);
    else snapFrom(event);
  };
  grip.addEventListener("pointerup", endDrag);
  grip.addEventListener("pointercancel", endDrag);
}

async function splitWashLocal(dataUrl) {
  const picture = new Image();
  picture.src = dataUrl;
  await picture.decode();
  const canvas = document.createElement("canvas");
  canvas.width = picture.naturalWidth;
  canvas.height = picture.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(picture, 0, 0);
  const split = splitSubjectFromImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
  const toUrl = (pixels) => {
    const next = document.createElement("canvas");
    next.width = split.width;
    next.height = split.height;
    next.getContext("2d").putImageData(new ImageData(pixels, split.width, split.height), 0, 0);
    return next.toDataURL("image/png");
  };
  return {
    baseUrl: toUrl(split.base),
    liftUrl: toUrl(split.lift),
    hits: split.hits,
    hitsSize: split.hitsSize,
  };
}

async function splitWash(dataUrl) {
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const bitmap = await createImageBitmap(blob);
    return await imageWork("splitSubject", { bitmap }, [bitmap]);
  } catch {
    return splitWashLocal(dataUrl);
  }
}

async function ensureSplit(rec) {
  if (rec?.split?.src === rec.dataUrl && rec.split.baseUrl) return rec.split;
  const src = rec?.dataUrl;
  if (!src) return null;
  const split = await splitWash(src);
  if (!split || rec.dataUrl !== src) return rec.split || null;
  rec.split = { ...split, src };
  return rec.split;
}

function prefetchSplit(rec) {
  const src = rec?.dataUrl;
  if (!src || rec.split?.src === src) return;
  ensureSplit(rec).catch(() => {});
}

function hitSubject(frame, rec, clientX, clientY) {
  const hits = rec?.split?.hits;
  const size = rec?.split?.hitsSize || 0;
  if (!hits || !size) return true;
  const box = frame.getBoundingClientRect();
  const x = Math.min(size - 1, Math.max(0, Math.floor(((clientX - box.left) / box.width) * size)));
  const y = Math.min(size - 1, Math.max(0, Math.floor(((clientY - box.top) / box.height) * size)));
  return hits[y * size + x] > 36;
}

function mountSubjectDrag(sheet, item) {
  const frame = sheet.querySelector(".frame");
  if (!frame) return;
  let holding = false;
  let carrying = false;
  let moved = false;
  let startX = 0;
  let startY = 0;
  let startPlaceX = 0.5;
  let startPlaceY = 0.5;

  const img = () => frame.querySelector("img:not(.wash-lift)");

  const liftEl = () => frame.querySelector(".wash-lift");

  const placementFrom = (clientX, clientY) => {
    const box = frame.getBoundingClientRect();
    return {
      placeX: Math.min(1, Math.max(0, startPlaceX + (clientX - startX) / box.width)),
      placeY: Math.min(1, Math.max(0, startPlaceY - (clientY - startY) / box.height)),
    };
  };

  const preview = (placeX, placeY) => {
    const lift = liftEl();
    if (!lift) return;
    const box = frame.getBoundingClientRect();
    lift.style.transform = `translate(${(placeX - startPlaceX) * box.width}px, ${(startPlaceY - placeY) * box.height}px)`;
  };

  const write = (placeX, placeY) => {
    const rec = cards.get(item.id);
    if (!rec) return;
    rec.item.effects = clampEffects({ ...sheetEffects(rec), placeX, placeY });
    if (selectedId === item.id) applyEffectsToControls(rec.item.effects);
  };

  const follow = (clientX, clientY) => {
    const next = placementFrom(clientX, clientY);
    write(next.placeX, next.placeY);
    preview(next.placeX, next.placeY);
    return next;
  };

  const showLift = (rec) => {
    const picture = img();
    const split = rec.split;
    if (!picture || !split?.baseUrl || !split?.liftUrl) return false;
    picture.src = split.baseUrl;
    picture.style.transform = "";
    let lift = liftEl();
    if (!lift) {
      lift = document.createElement("img");
      lift.className = "wash-lift";
      lift.alt = "";
      lift.draggable = false;
      frame.append(lift);
    }
    lift.src = split.liftUrl;
    lift.style.transform = "";
    return true;
  };

  const clearPreview = (restore) => {
    const rec = cards.get(item.id);
    const picture = img();
    if (restore && picture && rec?.dataUrl) picture.src = rec.dataUrl;
    liftEl()?.remove();
    if (picture) picture.style.transform = "";
    frame.classList.remove("is-nudging", "is-carrying");
  };

  const drop = (clientX, clientY) => {
    const next = follow(clientX, clientY);
    holding = false;
    carrying = false;
    moved = true;
    unbindCarry();
    frame.classList.remove("is-nudging", "is-carrying");
    write(next.placeX, next.placeY);
    persistSettings();
    scheduleSheetRender(item.id);
  };

  const cancel = () => {
    holding = false;
    carrying = false;
    unbindCarry();
    write(startPlaceX, startPlaceY);
    clearPreview(true);
  };

  const onDocMove = (event) => {
    if (!carrying) return;
    follow(event.clientX, event.clientY);
  };

  const onDocDown = (event) => {
    if (!carrying) return;
    if (event.target.closest(".expand, .pick, .sheet-close, .sheet-edit, .save")) {
      cancel();
      return;
    }
    if (frame.contains(event.target)) {
      event.preventDefault();
      event.stopPropagation();
      drop(event.clientX, event.clientY);
      return;
    }
    cancel();
  };

  const onKey = (event) => {
    if (event.key === "Escape") cancel();
  };

  function bindCarry() {
    document.addEventListener("pointermove", onDocMove);
    document.addEventListener("pointerdown", onDocDown, true);
    document.addEventListener("keydown", onKey);
  }

  function unbindCarry() {
    document.removeEventListener("pointermove", onDocMove);
    document.removeEventListener("pointerdown", onDocDown, true);
    document.removeEventListener("keydown", onKey);
  }

  frame.addEventListener("pointerdown", (event) => {
    void startPick(event);
  });

  async function startPick(event) {
    if (carrying) return;
    if (event.button != null && event.button !== 0) return;
    if (event.target.closest(".expand, .pick, .sheet-close, .sheet-edit, .veil")) return;
    if (!img()) return;
    if (isCompact() && !sheet.classList.contains("active") && !sheet.classList.contains("is-expanded")) return;
    const rec = cards.get(item.id);
    if (!rec?.dataUrl) return;
    event.preventDefault();
    selectPainting(item.id);
    const waited = !rec.split?.baseUrl;
    if (waited) frame.classList.add("is-nudging");
    try {
      await ensureSplit(rec);
    } catch {
      frame.classList.remove("is-nudging");
      return;
    }
    if (!hitSubject(frame, rec, event.clientX, event.clientY)) {
      frame.classList.remove("is-nudging");
      return;
    }
    if (!showLift(rec)) {
      frame.classList.remove("is-nudging");
      return;
    }
    const fx = sheetEffects(rec);
    moved = false;
    startX = event.clientX;
    startY = event.clientY;
    startPlaceX = fx.placeX ?? 0.5;
    startPlaceY = fx.placeY ?? 0.5;
    if (waited) {
      carrying = true;
      frame.classList.add("is-carrying");
      bindCarry();
      return;
    }
    holding = true;
    frame.classList.add("is-nudging");
    try {
      frame.setPointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
  }
  frame.addEventListener("pointermove", (event) => {
    if (!holding || carrying) return;
    follow(event.clientX, event.clientY);
    if (Math.hypot(event.clientX - startX, event.clientY - startY) > 4) moved = true;
  });
  frame.addEventListener("pointerup", (event) => {
    if (!holding || carrying) return;
    holding = false;
    try {
      frame.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
    if (moved) {
      drop(event.clientX, event.clientY);
      return;
    }
    carrying = true;
    frame.classList.add("is-carrying");
    bindCarry();
  });
  frame.addEventListener("pointercancel", () => {
    if (holding && !carrying) cancel();
  });
  sheet.addEventListener("click", (event) => {
    if (!moved && !carrying) return;
    event.preventDefault();
    event.stopPropagation();
    moved = false;
  }, true);
}

function readEffects() {
  const next = { color: parseColor(pigmentColorEl?.value) || effects.color || DEFAULT_COLOR };
  const typeEl = document.querySelector("#brushType");
  if (typeEl) next.brushType = typeEl.value;
  const ranges = [
    ...brushControlsEl.querySelectorAll("input[type=range]"),
    ...placementControlsEl.querySelectorAll("input[type=range]"),
    ...effectGroupsEl.querySelectorAll("input[type=range]"),
  ];
  for (const input of ranges) {
    next[input.dataset.effect] = Number(input.value) / 100;
  }
  return clampEffects(next);
}

let colorPicker = null;
let mobileColorPicker = null;

function applyMobilePatch(patch) {
  const rec = selectedId ? cards.get(selectedId) : null;
  if (!rec?.item) return;
  rec.item.effects = clampEffects({ ...sheetEffects(rec), ...patch });
  applyEffectsToControls(rec.item.effects);
  syncSheetEditor(rec);
  syncMobileEditor(rec);
  persistSettings();
  scheduleSheetRender(selectedId);
}

function syncMobileEditor(rec = selectedId ? cards.get(selectedId) : null) {
  if (!mobileEditor || !rec?.item) return;
  const fx = sheetEffects(rec);
  mobileEditor.dataset.selected = rec.item.id;
  for (const input of mobileEffectInputs) {
    input.value = String(Math.round((fx[input.dataset.mobileEffect] ?? 0.5) * 100));
    input.closest(".mobile-tick-scale")?.style.setProperty("--value", input.value);
  }
  for (const button of mobileBrushOptions?.querySelectorAll("[data-brush-type]") || []) {
    const on = button.dataset.brushType === fx.brushType;
    button.classList.toggle("is-active", on);
    button.setAttribute("aria-pressed", on ? "true" : "false");
  }
  const hex = oklchToHex(fx.color || DEFAULT_COLOR);
  document.querySelector(".mobile-color-icon")?.style.setProperty("--tool-color", hex);
  mobileColorPicker?.setValue(fx.color || DEFAULT_COLOR);
}

function setMobileTool(name) {
  for (const button of mobileToolButtons) {
    const on = button.dataset.mobileTool === name;
    button.classList.toggle("is-active", on);
    button.setAttribute("aria-pressed", on ? "true" : "false");
  }
  for (const panel of mobileToolPanels) {
    panel.classList.toggle("is-active", panel.dataset.toolPanel === name);
  }
}

function mountMobileEditor() {
  if (!mobileEditor || !mobileBrushOptions) return;
  for (const name of BRUSH_TYPES) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mobile-brush-option";
    button.dataset.brushType = name;
    button.setAttribute("aria-pressed", "false");
    button.innerHTML = `<span class="mobile-brush-mark" aria-hidden="true"></span><span>${name.toLowerCase()}</span>`;
    button.addEventListener("click", () => applyMobilePatch({ brushType: name }));
    mobileBrushOptions.append(button);
  }
  mobileColorPicker = mountColorSquare({
    host: document.querySelector("#mobilePigments"),
    value: effects.color || DEFAULT_COLOR,
    onChange: (color) => applyMobilePatch({ color }),
    swatches: true,
  });
  for (const button of mobileToolButtons) {
    button.addEventListener("click", () => {
      setMobileTool(button.classList.contains("is-active") ? null : button.dataset.mobileTool);
    });
  }
  for (const input of mobileEffectInputs) {
    input.addEventListener("input", () => {
      input.closest(".mobile-tick-scale")?.style.setProperty("--value", input.value);
      applyMobilePatch({ [input.dataset.mobileEffect]: Number(input.value) / 100 });
    });
  }
  setMobileTool(null);
}

function makeSlider(id, label, value) {
  const row = document.createElement("label");
  row.className = "slide";
  const name = document.createElement("span");
  name.textContent = label;
  const input = document.createElement("input");
  input.type = "range";
  input.min = "0";
  input.max = "100";
  input.step = "1";
  input.dataset.effect = id;
  input.value = String(Math.round((value ?? 0.5) * 100));
  input.setAttribute("aria-label", label);
  row.append(name, input);
  return row;
}

function mountBrushPanel() {
  brushControlsEl.innerHTML = "";

  const typeRow = document.createElement("div");
  typeRow.className = "slide is-brush-type";
  const typeName = document.createElement("span");
  typeName.textContent = "brush type";
  const typeSelect = document.createElement("select");
  typeSelect.id = "brushType";
  typeSelect.setAttribute("aria-label", "brush type");
  for (const name of BRUSH_TYPES) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name.toLowerCase();
    typeSelect.append(option);
  }
  typeSelect.value = effects.brushType || "HB";
  typeRow.append(typeName, typeSelect);
  brushControlsEl.append(typeRow);
  mountChoice(typeSelect);

  for (const key of BRUSH_SLIDERS) {
    brushControlsEl.append(makeSlider(key.id, key.label, effects[key.id]));
  }
}

function hiddenRange(id, value) {
  const input = document.createElement("input");
  input.type = "range";
  input.min = "0";
  input.max = "100";
  input.step = "1";
  input.dataset.effect = id;
  input.value = String(Math.round((value ?? 0.5) * 100));
  input.className = "visually-hidden";
  input.setAttribute("aria-label", id === "placeX" ? "across" : "up");
  return input;
}

function mountStick(xInput, yInput) {
  const well = document.createElement("div");
  well.className = "stick";
  well.tabIndex = 0;
  well.setAttribute("role", "slider");
  well.setAttribute("aria-label", "placement stick");
  const thumb = document.createElement("div");
  thumb.className = "stick-thumb";
  well.append(thumb);

  const reachOf = () => Math.max(18, well.clientWidth / 2 - 12);

  function syncThumb() {
    const reach = reachOf();
    const x = Number(xInput.value) / 100;
    const y = Number(yInput.value) / 100;
    thumb.style.transform = `translate(${(x - 0.5) * 2 * reach}px, ${(0.5 - y) * 2 * reach}px)`;
  }

  function setFromPointer(clientX, clientY) {
    const reach = reachOf();
    const box = well.getBoundingClientRect();
    const dx = clientX - (box.left + box.width / 2);
    const dy = clientY - (box.top + box.height / 2);
    const dist = Math.hypot(dx, dy) || 1;
    const clamped = Math.min(dist, reach);
    const nx = (dx / dist) * clamped;
    const ny = (dy / dist) * clamped;
    xInput.value = String(Math.round((0.5 + nx / reach / 2) * 100));
    yInput.value = String(Math.round((0.5 - ny / reach / 2) * 100));
    syncThumb();
    onEffectInput();
  }

  well.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    well.classList.add("is-dragging");
    well.setPointerCapture(event.pointerId);
    setFromPointer(event.clientX, event.clientY);
  });
  well.addEventListener("pointermove", (event) => {
    if (!well.classList.contains("is-dragging")) return;
    setFromPointer(event.clientX, event.clientY);
  });
  const endDrag = () => well.classList.remove("is-dragging");
  well.addEventListener("pointerup", endDrag);
  well.addEventListener("pointercancel", endDrag);
  well.addEventListener("keydown", (event) => {
    const step = event.shiftKey ? 8 : 3;
    const move = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowDown: [0, -step], ArrowUp: [0, step] }[event.key];
    if (!move) return;
    event.preventDefault();
    xInput.value = String(Math.min(100, Math.max(0, Number(xInput.value) + move[0])));
    yInput.value = String(Math.min(100, Math.max(0, Number(yInput.value) + move[1])));
    syncThumb();
    onEffectInput();
  });

  xInput.addEventListener("input", syncThumb);
  yInput.addEventListener("input", syncThumb);
  syncThumb();
  well.syncThumb = syncThumb;
  return well;
}

function mountPlacementPanel() {
  placementControlsEl.innerHTML = "";
  const xInput = hiddenRange("placeX", effects.placeX);
  const yInput = hiddenRange("placeY", effects.placeY);
  const board = document.createElement("div");
  board.className = "place-board";
  const stick = mountStick(xInput, yInput);
  stick.id = "placeStick";
  board.append(stick, makeSlider("composition", "size", effects.composition));
  placementControlsEl.append(xInput, yInput, board);
}

function mountEffects() {
  const colorGroup = effectGroupsEl.querySelector(".color-group");
  for (const el of [...effectGroupsEl.children]) {
    if (el !== colorGroup) el.remove();
  }
  mountBrushPanel();
  mountPlacementPanel();
  EFFECT_GROUPS.forEach((group, index) => {
    const details = document.createElement("details");
    details.open = index < 1;
    const summary = document.createElement("summary");
    summary.textContent = group.label;
    details.append(summary);
    for (const key of group.keys) {
      details.append(makeSlider(key.id, key.label, effects[key.id]));
    }
    effectGroupsEl.append(details);
  });
  if (colorGroup && effectGroupsEl.firstElementChild !== colorGroup) {
    effectGroupsEl.prepend(colorGroup);
  }

  pigmentColorEl.value = oklchToHex(effects.color || DEFAULT_COLOR);
  colorPicker = mountColorSquare({
    host: document.querySelector("#pigments"),
    input: pigmentColorEl,
    value: effects.color || DEFAULT_COLOR,
    onChange: onEffectInput,
  });

  const root = document.querySelector("#effects");
  root.addEventListener("input", onEffectInput);
  root.addEventListener("change", onEffectInput);
  brushEl.addEventListener("input", onEffectInput);
  brushEl.addEventListener("change", onEffectInput);
  placementEl.addEventListener("input", onEffectInput);
  placementEl.addEventListener("change", onEffectInput);
  persistSettings();
}

function onEffectInput() {
  afterDeskChange();
}

function scheduleEffectRender() {
  afterDeskChange();
}

function scheduleSheetRender(id) {
  if (!id) return;
  dirtyIds.add(id);
  clearTimeout(effectTimer);
  effectTimer = setTimeout(flushEffects, 280);
}

function flushEffects() {
  if (!dirtyIds.size) return;
  if (paintingNow) return;
  const ids = [...dirtyIds];
  dirtyIds.clear();
  for (const id of ids) {
    const rec = cards.get(id);
    if (rec?.item.code || rec?.item.photo) queuePaint(id, { replace: true });
  }
}

function stageDensity() {
  const css = Math.min(window.innerWidth, window.innerHeight);
  const need = css * (window.devicePixelRatio || 1);
  return Math.min(2, Math.max(1, Math.round(need / PAINT_SIZE) || 2));
}

function paintDensityFor(id) {
  const rec = cards.get(id);
  const expanded = rec?.sheet.classList.contains("is-expanded");
  const next = expanded ? Math.max(2, stageDensity()) : 2;
  return Math.max(next, rec?.paintDensity || 1, rec?.wantDensity || 1);
}

function requestHighRes(id) {
  const rec = cards.get(id);
  if (!rec?.item || (!rec.item.code && !rec.item.photo)) return;
  if (isPhone() && rec.item.photo) return;
  const density = paintDensityFor(id);
  if ((rec.paintDensity || 1) >= density) return;
  rec.wantDensity = density;
  if (waitingId === id) return;
  if (!paintQueue.includes(id)) paintQueue.push(id);
  drainQueue();
}

function applyPaintedData(rec, dataUrl, density = 1) {
  rec.dataUrl = dataUrl;
  rec.item.dataUrl = dataUrl;
  rec.paintDensity = density;
  rec.wantDensity = null;
  const frame = rec.sheet.querySelector(".frame");
  let img = frame.querySelector("img:not(.wash-lift)");
  if (img) {
    img.src = dataUrl;
    img.style.transform = "";
  } else {
    img = document.createElement("img");
    img.alt = rec.item.prompt || "watercolor";
    img.src = dataUrl;
    img.draggable = false;
    frame.prepend(img);
  }
  img.draggable = false;
  frame.querySelector(".wash-lift")?.remove();
  rec.split = null;
  prefetchSplit(rec);
  rec.sheet.classList.remove("is-adjusting");
  rec.sheet.querySelector(".veil")?.remove();
  rec.sheet.querySelector(".save")?.removeAttribute("disabled");
}

function queuePhotoPreview(id) {
  if (!photoPreviewQueue.includes(id)) photoPreviewQueue.push(id);
  drainPhotoPreviews();
}

async function drainPhotoPreviews() {
  if (photoPreviewNow) return;
  const id = photoPreviewQueue.shift();
  if (!id) return;
  const rec = cards.get(id);
  if (!rec?.item.photo) {
    drainPhotoPreviews();
    return;
  }
  photoPreviewNow = true;
  try {
    const { dataUrl } = await imageWork("renderWash", {
      photo: rec.item.photo,
      seed: rec.item.seed,
      size: PAINT_SIZE,
      effects: sheetEffects(rec),
    });
    if (dataUrl && cards.get(id) === rec) applyPaintedData(rec, dataUrl, 1);
  } catch (err) {
    rec.fastPreviewFailed = true;
    if (cards.get(id) === rec && !paintQueue.includes(id)) {
      paintQueue.push(id);
      drainQueue();
    }
  } finally {
    photoPreviewNow = false;
    drainPhotoPreviews();
  }
}

function queuePaint(id, { replace = false } = {}) {
  const rec = cards.get(id);
  if (!rec) return;
  if (replace) {
    rec.sheet.classList.add("is-adjusting");
  } else {
    rec.sheet.querySelector("img")?.remove();
    rec.sheet.querySelector(".save")?.setAttribute("disabled", "");
    rec.dataUrl = null;
    rec.item.dataUrl = null;
    let veil = rec.sheet.querySelector(".veil");
    if (!veil) {
      veil = document.createElement("div");
      veil.className = "veil";
      rec.sheet.querySelector(".frame").append(veil);
    }
    veil.textContent = "pigment settling…";
  }
  if (isPhone() && rec.item.photo && !rec.fastPreviewFailed) {
    queuePhotoPreview(id);
    return;
  }
  if (!paintQueue.includes(id)) paintQueue.push(id);
  drainQueue();
}

function setStatus(_text) {}

function authHeaders() {
  const headers = { "content-type": "application/json" };
  const key = apiKeyEl.value.trim();
  if (key) {
    headers["x-api-key"] = key;
    headers["x-llm-provider"] = providerEl.value;
  }
  return headers;
}

async function loadSamples() {
  try {
    const res = await fetch("/api/samples");
    if (!res.ok) throw new Error(`samples unavailable (${res.status})`);
    const data = await res.json();
    samples = data.samples || [];
  } catch {
    const { samples: builtInSamples } = await import("../lib/compositions/templates.js?v=7");
    samples = builtInSamples || [];
  }
  samplesEl.innerHTML = "";
  const lead = document.createElement("div");
  lead.className = "chips-row";
  samples.forEach((sample, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
    button.textContent = String(sample.title || "").toLowerCase();
    button.addEventListener("click", () => {
      sceneEl.value = sample.prompt;
      sizeScene();
      if (sample.color) {
        colorPicker?.setValue(sample.color);
      }
      if (sample.brushType) {
        const typeEl = document.querySelector("#brushType");
        if (typeEl && BRUSH_TYPES.includes(sample.brushType)) typeEl.value = sample.brushType;
      }
      if (sample.color || sample.brushType) persistSettings();
      clearPhoto();
      generate({ sampleId: sample.id, scene: sample.prompt });
    });
    if (index < 2) lead.append(button);
    else {
      if (index === 2) samplesEl.append(lead);
      samplesEl.append(button);
    }
  });
  if (lead.childNodes.length && !lead.parentNode) samplesEl.append(lead);
}

function openSheetStage(id) {
  const rec = cards.get(id);
  if (!rec?.sheet || stagedSheet) return;
  closePopovers();
  selectPainting(id);
  stagedSheet = {
    sheet: rec.sheet,
    home: rec.sheet.parentElement,
    next: rec.sheet.nextSibling,
  };
  rec.sheet.classList.add("is-expanded");
  sheetStageEl.append(rec.sheet);
  rec.sheet.querySelector(".sheet-edit")?._onStage?.();
  sheetStageEl.hidden = false;
  document.body.classList.add("is-sheet-open");
  requestHighRes(id);
}

function closeSheetStage() {
  if (!stagedSheet) return;
  closePopovers();
  const { sheet, home, next } = stagedSheet;
  sheet.querySelector(".sheet-edit")?._offStage?.();
  sheet.classList.remove("is-expanded");
  if (home) {
    if (next && next.parentElement === home) home.insertBefore(sheet, next);
    else home.append(sheet);
  }
  stagedSheet = null;
  sheetStageEl.hidden = true;
  document.body.classList.remove("is-sheet-open");
}

function clearWall() {
  closeSheetStage();
  closePopovers();
  document.querySelectorAll(".sheet-color-menu").forEach((menu) => menu.remove());
  paintQueue.length = 0;
  photoPreviewQueue.length = 0;
  paintingNow = false;
  waitingId = null;
  cards.clear();
  wallEl.innerHTML = "";
}

function renderGrid(items) {
  clearWall();
  const hasPaintings = items.length > 0;
  mobileSheet?.classList.toggle("has-paintings", hasPaintings);
  if (isPhone()) {
    setMobileSheet(false);
    if (hasPaintings) setMobileTool(null);
  }
  const grid = document.createElement("div");
  grid.className = "grid";
  wallEl.append(grid);

  items.forEach((item, index) => {
    const sheet = document.createElement("div");
    sheet.className = "sheet";
    sheet.dataset.id = item.id;
    sheet.tabIndex = 0;
    item.effects = clampEffects(item.effects || readEffects());
    sheet.innerHTML = `
      <div class="frame">
        <div class="frame-tools">
          <button type="button" class="expand" data-id="${item.id}" aria-label="expand" title="expand">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M9 3h4v4" fill="none" stroke="currentColor" stroke-width="1.5" />
              <path d="M13 3 8.2 7.8" fill="none" stroke="currentColor" stroke-width="1.5" />
              <path d="M7 13H3V9" fill="none" stroke="currentColor" stroke-width="1.5" />
              <path d="M3 13l4.8-4.8" fill="none" stroke="currentColor" stroke-width="1.5" />
            </svg>
          </button>
          <button type="button" class="sheet-close" aria-label="close" title="close">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M2.5 2.5l11 11" fill="none" stroke="currentColor" stroke-width="1.5" />
              <path d="M13.5 2.5 2.5 13.5" fill="none" stroke="currentColor" stroke-width="1.5" />
            </svg>
          </button>
        </div>
        <div class="veil">pigment settling…</div>
      </div>
      <div class="caption">
        <span class="caption-name">variation ${index + 1}</span>
        <div class="sheet-edit is-row" role="toolbar" aria-label="edit wash">
          <button type="button" class="sheet-edit-grip" aria-label="move editor" title="drag to the side"></button>
          <button type="button" class="sheet-edit-color" title="color" aria-label="color" aria-haspopup="listbox" aria-expanded="false">
            <span class="sheet-edit-swatch" aria-hidden="true"></span>
          </button>
          <label class="sheet-edit-sat" title="saturation">
            <span class="sheet-edit-sat-name">saturation</span>
            <span class="sheet-edit-sat-rail">
              <input type="range" min="0" max="100" step="1" aria-label="saturation" />
            </span>
          </label>
          <select class="sheet-edit-brush" aria-label="brush"></select>
        </div>
        <span class="caption-meta">
          <button type="button" class="save" data-id="${item.id}" aria-label="save png" title="save" disabled>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M8 2.4v8.2" fill="none" stroke="currentColor" stroke-width="1.5" />
              <path d="M5.2 8.4 8 11.2 10.8 8.4" fill="none" stroke="currentColor" stroke-width="1.5" />
              <path d="M3.2 13.5h9.6" fill="none" stroke="currentColor" stroke-width="1.5" />
            </svg>
          </button>
        </span>
      </div>
    `;
    sheet.addEventListener("click", (event) => {
      if (event.target.closest(".save, .expand, .pick, .sheet-close, .sheet-edit")) return;
      selectPainting(item.id);
    });
    sheet.addEventListener("keydown", (event) => {
      if (event.target.closest(".save, .expand, .pick, .sheet-close, .sheet-edit")) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectPainting(item.id);
      }
    });
    sheet.querySelector(".expand").addEventListener("click", (event) => {
      event.stopPropagation();
      openSheetStage(item.id);
    });
    sheet.querySelector(".sheet-close").addEventListener("click", (event) => {
      event.stopPropagation();
      closeSheetStage();
    });
    sheet.querySelector(".save").addEventListener("click", (event) => {
      event.stopPropagation();
      downloadPainting(item.id);
    });
    grid.append(sheet);
    cards.set(item.id, { item, sheet, dataUrl: null });
    mountSheetEditor(sheet, item);
    mountSubjectDrag(sheet, item);

    if (item.error || (!item.code && !item.photo)) {
      const veil = sheet.querySelector(".veil");
      veil.classList.add("error");
      veil.textContent = item.error || "no sketch returned";
      return;
    }
    if (isPhone() && item.photo) photoPreviewQueue.push(item.id);
    else paintQueue.push(item.id);
  });

  const first = items.find((item) => item.code || item.photo);
  if (first) selectPainting(first.id);
  else syncMobileVariationPager();
  drainPhotoPreviews();
  drainQueue();
}

function drainQueue() {
  if (paintingNow || !rendererReady) return;
  const id = paintQueue.shift();
  if (!id) {
    const ready = [...cards.values()].filter((rec) => rec.dataUrl).length;
    if (ready) {
      const photo = [...cards.values()].some((rec) => rec.item.photo);
      setStatus(photo ? `${ready} washes ready.` : `${ready} sketches ready.`);
    }
    flushEffects();
    return;
  }
  const rec = cards.get(id);
  if (!rec?.item.code && !rec?.item.photo) {
    drainQueue();
    return;
  }
  paintingNow = true;
  waitingId = id;
  clearTimeout(paintWatch);
  paintWatch = setTimeout(() => {
    if (!paintingNow || waitingId !== id) return;
    paintingNow = false;
    waitingId = null;
    const stuck = cards.get(id);
    const veil = stuck?.sheet.querySelector(".veil");
    if (veil) {
      veil.classList.add("error");
      veil.textContent = "the wash never dried. try the photo again.";
    }
    setStatus("the wash never dried. try the photo again.");
    drainQueue();
  }, 35000);
  const frame = renderer.contentWindow;
  if (frame) frame.__pendingPhoto = rec.item.photo || null;
  waitingDensity = rec.wantDensity || paintDensityFor(id);
  rec.wantDensity = waitingDensity;
  frame?.postMessage(
    {
      type: "paint",
      code: rec.item.code,
      photo: Boolean(rec.item.photo),
      seed: rec.item.seed,
      size: PAINT_SIZE,
      density: waitingDensity,
      effects: sheetEffects(rec),
    },
    "*"
  );
}

function onFrameMessage(event) {
  if (event.source !== renderer.contentWindow || !event.data) return;
  if (event.data.type === "ready") {
    rendererReady = true;
    drainQueue();
    return;
  }
  if (event.data.type !== "painted") return;

  const rec = cards.get(waitingId);
  paintingNow = false;
  waitingId = null;
  clearTimeout(paintWatch);

  if (rec) {
    const veil = rec.sheet.querySelector(".veil");
    if (event.data.error) {
      rec.sheet.classList.remove("is-adjusting");
      veil?.classList.add("error");
      if (veil) veil.textContent = event.data.error;
    } else if (event.data.dataUrl) {
      applyPaintedData(rec, event.data.dataUrl, waitingDensity);
    } else if (veil) {
      veil.classList.add("error");
      veil.textContent = "the wash dried invisibly. try re-rendering.";
    }
  }

  drainQueue();
}

function selectPainting(id) {
  selectedId = id;
  for (const sheet of wallEl.querySelectorAll(".sheet")) {
    sheet.classList.toggle("active", sheet.dataset.id === id);
  }
  syncMobileVariationPager();
  const rec = cards.get(id);
  if (!rec?.item) return;
  rec.item.effects = sheetEffects(rec);
  applyEffectsToControls(rec.item.effects);
  syncSheetEditor(rec);
  syncMobileEditor(rec);
}

function syncMobileVariationPager() {
  if (!wallEl) return;
  const sheets = [...wallEl.querySelectorAll(".sheet")];
  let pager = wallEl.querySelector(".variation-pager");
  if (!isPhone() || sheets.length < 2) {
    pager?.remove();
    return;
  }
  if (!pager) {
    pager = document.createElement("div");
    pager.className = "variation-pager";
    pager.setAttribute("role", "tablist");
    pager.setAttribute("aria-label", "variations");
    wallEl.append(pager);
  }
  pager.innerHTML = "";
  for (const [index, sheet] of sheets.entries()) {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "variation-dot";
    if (sheet.classList.contains("active")) dot.classList.add("is-active");
    dot.setAttribute("role", "tab");
    dot.setAttribute("aria-label", `variation ${index + 1}`);
    dot.setAttribute("aria-selected", sheet.classList.contains("active") ? "true" : "false");
    dot.addEventListener("click", (event) => {
      event.stopPropagation();
      selectPainting(sheet.dataset.id);
    });
    pager.append(dot);
  }
}

function stepMobileVariation(delta) {
  if (!isPhone() || !wallEl) return;
  const sheets = [...wallEl.querySelectorAll(".sheet")];
  if (sheets.length < 2) return;
  const ids = sheets.map((sheet) => sheet.dataset.id);
  const index = Math.max(0, ids.indexOf(selectedId));
  const next = ids[(index + delta + ids.length) % ids.length];
  if (next) selectPainting(next);
}

function mountMobileVariationSwipe() {
  if (!wallEl) return;
  let startX = 0;
  let startY = 0;
  let tracking = false;

  wallEl.addEventListener(
    "pointerdown",
    (event) => {
      if (!isPhone()) return;
      if (event.target.closest("button, a, input, select, .variation-pager, .mobile-sheet")) return;
      if (wallEl.querySelectorAll(".sheet").length < 2) return;
      startX = event.clientX;
      startY = event.clientY;
      tracking = true;
    },
    { passive: true }
  );

  wallEl.addEventListener("pointerup", (event) => {
    if (!tracking) return;
    tracking = false;
    if (!isPhone()) return;
    if (wallEl.querySelector(".frame.is-carrying, .frame.is-nudging")) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.35) return;
    stepMobileVariation(dx < 0 ? 1 : -1);
  });

  wallEl.addEventListener("pointercancel", () => {
    tracking = false;
  });
}

async function renderBuiltInSample(sampleId, prompt) {
  if (!sampleId) return false;
  const { templates } = await import("../lib/compositions/templates.js?v=7");
  const code = templates?.[sampleId];
  if (!code) return false;
  const n = Math.max(1, Math.min(6, Number(countEl.value) || 4));
  const fx = readEffects();
  paintings = Array.from({ length: n }, (_, i) => ({
    id: `${sampleId}-local-${i + 1}`,
    prompt,
    seed: 11 + i * 97,
    variant: "local preview",
    code,
    source: "sample",
    effects: fx,
  }));
  setStatus("wetting the paper…");
  renderGrid(paintings);
  return true;
}

async function generate({ scene, sampleId } = {}) {
  const prompt = (scene ?? sceneEl.value).trim();
  paintEl.disabled = true;
  setStatus(sampleId ? "loading sample washes…" : "the model is writing sketches…");

  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        scene: prompt,
        count: Number(countEl.value),
        sampleId: sampleId || undefined,
        effects: readEffects(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "generate failed");
    paintings = data.paintings || [];
    const failed = paintings.filter((item) => item.error).length;
    setStatus(
      failed
        ? `${paintings.length - failed} painted, ${failed} failed.`
        : "wetting the paper…"
    );
    renderGrid(paintings);
  } catch (err) {
    if (await renderBuiltInSample(sampleId, prompt)) return;
    setStatus(err.message);
  } finally {
    paintEl.disabled = false;
  }
}

paintEl.addEventListener("click", () => {
  if (currentPhoto) {
    paintPhoto();
    return;
  }
  generate();
});

function trainingExample(item) {
  return {
    messages: [
      { role: "system", content: item.system || "" },
      { role: "user", content: item.user || `Scene: ${item.prompt || ""}` },
      { role: "assistant", content: item.code || "" },
    ],
    metadata: {
      id: item.id,
      scene: item.prompt || "",
      seed: item.seed,
      variant: item.variant || "",
      source: item.source || "",
      effects: item.effects || readEffects(),
    },
  };
}

function exportTraining(id) {
  const rec = cards.get(id);
  if (!rec?.item?.code) {
    setStatus("nothing to train on yet.");
    return;
  }
  const slug = String(rec.item.prompt || "wash")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "wash";
  const blob = new Blob([`${JSON.stringify(trainingExample(rec.item), null, 2)}\n`], {
    type: "application/json",
  });
  downloadBlob(blob, `tinker-${slug}-${rec.item.seed}.json`);
  const pick = rec.sheet.querySelector(".pick");
  pick?.classList.add("picked");
  pick?.setAttribute("aria-pressed", "true");
  setStatus("saved training json.");
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

async function downloadPainting(id) {
  const rec = cards.get(id);
  if (!rec) return;
  const dataUrl = rec.dataUrl || rec.item.dataUrl;
  if (!dataUrl) {
    setStatus("nothing to export yet.");
    return;
  }
  downloadBlob(await (await fetch(dataUrl)).blob(), `wash-${rec.item.seed}.png`);
  setStatus("saved png.");
}

renderer.addEventListener("load", () => {
  rendererReady = true;
  drainQueue();
});

if (renderer.contentDocument?.readyState === "complete") {
  rendererReady = true;
}

const about = document.querySelector(".about");
const aboutLabel = about?.querySelector(".about-label");

function setAboutOpen(open) {
  about?.classList.toggle("is-open", open);
  aboutLabel?.setAttribute("aria-expanded", open ? "true" : "false");
}

about?.addEventListener("click", (event) => {
  if (event.target.closest("a")) return;
  if (event.target.closest(".about-menu")) return;
  setAboutOpen(!about.classList.contains("is-open"));
});
about?.addEventListener("mouseleave", () => {
  if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) setAboutOpen(false);
});
document.addEventListener("pointerdown", (event) => {
  if (!about || !(event.target instanceof Element) || event.target.closest(".about")) return;
  setAboutOpen(false);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setAboutOpen(false);
});

function mountDeskResize() {
  const studio = document.querySelector(".studio");
  const shell = document.querySelector(".desk-shell");
  const handle = document.querySelector(".desk-resize");
  if (!studio || !shell || !handle) return;

  const minW = 320;
  const maxW = () => Math.max(minW, Math.min(720, Math.round(window.innerWidth * 0.56)));
  const apply = (width) => {
    const next = Math.round(Math.max(minW, Math.min(maxW(), width)));
    studio.style.setProperty("--desk-w", `${next}px`);
    handle.setAttribute("aria-valuenow", String(next));
    handle.setAttribute("aria-valuemin", String(minW));
    handle.setAttribute("aria-valuemax", String(maxW()));
    try {
      localStorage.setItem("wash.deskWidth", String(next));
    } catch {
      /* ignore */
    }
    return next;
  };

  const stored = Number(localStorage.getItem("wash.deskWidth"));
  apply(stored >= minW ? stored : 400);

  let dragging = false;
  let startX = 0;
  let startW = 400;

  handle.addEventListener("pointerdown", (event) => {
    if (window.matchMedia("(max-width: 720px)").matches) return;
    if (event.button != null && event.button !== 0) return;
    event.preventDefault();
    dragging = true;
    startX = event.clientX;
    startW = shell.getBoundingClientRect().width;
    handle.classList.add("is-dragging");
    document.body.classList.add("is-desk-resizing");
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
  });

  handle.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    event.preventDefault();
    apply(startW + (event.clientX - startX));
  });

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove("is-dragging");
    document.body.classList.remove("is-desk-resizing");
  };
  handle.addEventListener("pointerup", endDrag);
  handle.addEventListener("pointercancel", endDrag);
  window.addEventListener("resize", () => {
    apply(shell.getBoundingClientRect().width);
  });
}

function mountDeskScroll() {
  const desk = document.querySelector(".desk");
  const sheet = document.querySelector(".mobile-sheet");
  const sheetBody = document.querySelector(".mobile-sheet-body");
  const rail = document.querySelector(".desk-rail");
  const thumb = document.querySelector(".desk-scroll");
  if (!desk || !rail || !thumb) return;

  let dragging = false;
  let dragOffset = 0;
  let dragBox = null;
  let dragMax = 0;
  let dragTravel = 1;
  let thumbH = 32;
  let frame = 0;
  let pendingY = null;

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const scroller = () =>
    sheetBody && window.matchMedia("(min-width: 721px)").matches ? sheetBody : desk;

  const metrics = () => {
    const box = scroller();
    const max = Math.max(0, box.scrollHeight - box.clientHeight);
    const railH = rail.clientHeight;
    const proportional = railH * (box.clientHeight / Math.max(box.scrollHeight, 1));
    thumbH = max <= 4 ? railH : Math.max(28, Math.round(Math.min(railH * 0.5, proportional * 0.5)));
    const travel = Math.max(1, railH - thumbH);
    return { box, max, travel };
  };

  const sync = () => {
    if (dragging) return;
    const { box, max, travel } = metrics();
    if (max <= 4) {
      rail.hidden = true;
      return;
    }
    rail.hidden = false;
    thumb.style.height = `${thumbH}px`;
    const ratio = clamp(box.scrollTop / max, 0, 1);
    thumb.style.transform = `translateY(${ratio * travel}px)`;
    rail.setAttribute("aria-valuenow", String(Math.round(ratio * 100)));
    rail.setAttribute("aria-valuemin", "0");
    rail.setAttribute("aria-valuemax", "100");
  };

  const applyY = (y) => {
    if (!dragBox) return;
    const next = clamp(y, 0, dragTravel);
    dragBox.scrollTop = (next / dragTravel) * dragMax;
    thumb.style.transform = `translateY(${next}px)`;
  };

  const queueY = (clientY) => {
    pendingY = clientY - rail.getBoundingClientRect().top - dragOffset;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (pendingY == null) return;
      applyY(pendingY);
      pendingY = null;
    });
  };

  rail.addEventListener("pointerdown", (event) => {
    if (event.button != null && event.button !== 0) return;
    const { box, max, travel } = metrics();
    if (max <= 4) return;
    event.preventDefault();
    const railTop = rail.getBoundingClientRect().top;
    const thumbBox = thumb.getBoundingClientRect();
    const onThumb = event.clientY >= thumbBox.top - 6 && event.clientY <= thumbBox.bottom + 6;
    dragging = true;
    dragBox = box;
    dragMax = max;
    dragTravel = travel;
    dragOffset = onThumb ? event.clientY - thumbBox.top : thumbH / 2;
    rail.classList.add("is-dragging");
    try {
      rail.setPointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
    applyY(event.clientY - railTop - dragOffset);
  });

  rail.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    event.preventDefault();
    queueY(event.clientY);
  });

  const endDrag = () => {
    dragging = false;
    dragBox = null;
    pendingY = null;
    if (frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
    rail.classList.remove("is-dragging");
    sync();
  };
  rail.addEventListener("pointerup", endDrag);
  rail.addEventListener("pointercancel", endDrag);

  desk.addEventListener("scroll", sync, { passive: true });
  sheetBody?.addEventListener("scroll", sync, { passive: true });
  new ResizeObserver(sync).observe(desk);
  if (sheet) new ResizeObserver(sync).observe(sheet);
  if (sheetBody) new ResizeObserver(sync).observe(sheetBody);
  new ResizeObserver(sync).observe(rail);
  desk.addEventListener("toggle", () => requestAnimationFrame(sync), true);
  window.matchMedia("(min-width: 721px)").addEventListener("change", sync);
  sync();
}

sheetStageEl?.addEventListener("click", (event) => {
  if (event.target === sheetStageEl) closeSheetStage();
});

{
  let startY = 0;
  let tracking = false;
  sheetStageEl?.addEventListener("pointerdown", (event) => {
    if (!isCompact() || event.target.closest("button, input, select, .sheet-edit, a, .choice-menu, .frame")) return;
    startY = event.clientY;
    tracking = true;
  });
  sheetStageEl?.addEventListener("pointerup", (event) => {
    if (!tracking) return;
    tracking = false;
    if (event.clientY - startY > 72) closeSheetStage();
  });
  sheetStageEl?.addEventListener("pointercancel", () => {
    tracking = false;
  });
}

loadSamples().catch((err) => setStatus(err.message));
mountEffects();
mountMobileEditor();
mountModeSwitch();
fitPaintKit();
mountMobileSheet();
mountMobileVariationSwipe();
sizeScene();
mountDeskScroll();
mountDeskResize();
