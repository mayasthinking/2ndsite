import { fetchCommonsShelf, fetchMetShelf, loadSeedCatalog, mergeWorks } from "../lib/compositions/oa-catalog.mjs";
import { createRatingStore, DEFAULT_PILE, filterWorks, PILES, progressCounts } from "../lib/compositions/ratings.mjs";

const deckEl = document.querySelector("#rateDeck");
const emptyEl = document.querySelector("#rateEmpty");
const progressEl = document.querySelector("#rateProgress");
const statusEl = document.querySelector("#rateStatus");
const undoButton = document.querySelector("#rateUndo");
const exportButton = document.querySelector("#rateExport");
const nopeButton = document.querySelector("#rateNope");
const okayButton = document.querySelector("#rateOkay");
const loveButton = document.querySelector("#rateLove");
const pileButtons = [...document.querySelectorAll("[data-pile]")];

const store = createRatingStore();
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const SWIPE_X = 88;
const SWIPE_Y = 96;
const VELOCITY = 0.55;

let works = [];
let pile = readPileParam();
let index = 0;
let busy = false;
let loadingMore = false;
let continuations = { commons: 0, met: 0 };
let hasMore = true;
let pointer = null;

function readPileParam() {
  const value = new URLSearchParams(location.search).get("pile");
  return PILES.includes(value) ? value : DEFAULT_PILE;
}

function writePileParam() {
  const url = new URL(location.href);
  if (pile === DEFAULT_PILE) url.searchParams.delete("pile");
  else url.searchParams.set("pile", pile);
  history.replaceState(null, "", url);
}

function visibleWorks() {
  return filterWorks(works, store.all(), pile);
}

function currentWork() {
  return visibleWorks()[index] || null;
}

function nextWork() {
  return visibleWorks()[index + 1] || null;
}

function setStatus(message) {
  statusEl.textContent = message || "";
}

function counts() {
  return progressCounts(works, store.all());
}

function updateChrome() {
  const stats = counts();
  const visible = visibleWorks();
  const work = currentWork();
  progressEl.textContent = stats.total
    ? `${stats.rated}/${stats.total} rated`
    : "opening the open-access shelf…";
  undoButton.disabled = !store.canUndo();
  exportButton.disabled = store.exportRows().length === 0;
  const ready = Boolean(work) && !busy;
  nopeButton.disabled = !ready;
  okayButton.disabled = !ready;
  loveButton.disabled = !ready;
  emptyEl.hidden = visible.length > 0 || !stats.total;
  if (!visible.length && stats.total) {
    emptyEl.textContent =
      pile === "unrated"
        ? "every painting on this shelf has a rating."
        : `no ${pile} ratings yet.`;
  }
  for (const button of pileButtons) {
    const active = button.dataset.pile === pile;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
    const count =
      button.dataset.pile === "unrated" ? stats.unrated : stats[button.dataset.pile] || 0;
    button.textContent = `${button.dataset.pile}${stats.total ? ` ${count}` : ""}`;
  }
}

function captionFor(work) {
  const caption = work.captionShort || work.caption || "";
  if (!caption || caption === work.title) return "";
  return caption;
}

function createCard(work, layer) {
  const card = document.createElement("article");
  card.className = `rate-card rate-card-${layer}`;
  card.dataset.id = work.id;
  if (layer === "front") card.tabIndex = 0;

  const stampNope = document.createElement("span");
  stampNope.className = "rate-stamp rate-stamp-nope";
  stampNope.textContent = "nope";
  const stampLove = document.createElement("span");
  stampLove.className = "rate-stamp rate-stamp-love";
  stampLove.textContent = "love";
  const stampOkay = document.createElement("span");
  stampOkay.className = "rate-stamp rate-stamp-okay";
  stampOkay.textContent = "okay";

  const frame = document.createElement("div");
  frame.className = "rate-frame";
  const image = document.createElement("img");
  image.src = work.thumbnailUrl || work.imageUrl;
  image.alt = work.title;
  image.draggable = false;
  image.decoding = "async";
  image.addEventListener("error", () => {
    if (work.imageUrl && image.src !== work.imageUrl) image.src = work.imageUrl;
    else frame.classList.add("is-missing");
  });
  frame.append(image);

  const meta = document.createElement("div");
  meta.className = "rate-meta";
  const artist = document.createElement("p");
  artist.className = "rate-artist";
  artist.textContent = work.artist;
  const title = document.createElement("h2");
  title.className = "rate-title";
  title.textContent = work.title;
  meta.append(artist, title);
  const caption = captionFor(work);
  if (caption) {
    const line = document.createElement("p");
    line.className = "rate-caption";
    line.textContent = caption;
    meta.append(line);
  }

  card.append(stampNope, stampLove, stampOkay, frame, meta);
  return card;
}

function prefetch(work) {
  if (!work) return;
  const src = work.thumbnailUrl || work.imageUrl;
  if (!src) return;
  const image = new Image();
  image.src = src;
}

function renderDeck() {
  deckEl.replaceChildren();
  const work = currentWork();
  const peek = nextWork();
  if (peek) deckEl.append(createCard(peek, "back"));
  if (work) {
    const front = createCard(work, "front");
    bindSwipe(front);
    deckEl.append(front);
    prefetch(peek);
    prefetch(visibleWorks()[index + 2]);
  }
  updateChrome();
}

function flyCard(card, rating) {
  if (!card || reducedMotion) return Promise.resolve();
  const travel =
    rating === "love" ? "translate(130%, -8%) rotate(14deg)" :
    rating === "nope" ? "translate(-130%, -8%) rotate(-14deg)" :
    "translate(0, 120%) rotate(-2deg)";
  card.style.transition = "transform 280ms ease, opacity 260ms ease";
  card.style.transform = travel;
  card.style.opacity = "0";
  return new Promise((resolve) => {
    window.setTimeout(resolve, 260);
  });
}

function applyStamps(card, dx, dy) {
  if (!card) return;
  const love = Math.max(0, Math.min(1, dx / SWIPE_X));
  const nope = Math.max(0, Math.min(1, -dx / SWIPE_X));
  const okay = Math.abs(dy) > Math.abs(dx) ? Math.max(0, Math.min(1, dy / SWIPE_Y)) : 0;
  card.style.setProperty("--stamp-love", String(love));
  card.style.setProperty("--stamp-nope", String(nope));
  card.style.setProperty("--stamp-okay", String(okay));
}

function decideSwipe(dx, dy, vx, vy) {
  if (dx > SWIPE_X || vx > VELOCITY) return "love";
  if (dx < -SWIPE_X || vx < -VELOCITY) return "nope";
  if ((dy > SWIPE_Y && Math.abs(dy) > Math.abs(dx)) || (vy > VELOCITY && Math.abs(dy) > Math.abs(dx))) {
    return "okay";
  }
  return null;
}

function bindSwipe(card) {
  card.addEventListener("pointerdown", (event) => {
    if (busy || event.button) return;
    pointer = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      t: event.timeStamp,
      dx: 0,
      dy: 0,
    };
    card.setPointerCapture(event.pointerId);
    card.classList.add("is-dragging");
  });

  card.addEventListener("pointermove", (event) => {
    if (!pointer || event.pointerId !== pointer.id) return;
    pointer.dx = event.clientX - pointer.x;
    pointer.dy = event.clientY - pointer.y;
    const rotate = pointer.dx * 0.038;
    card.style.transform = `translate(${pointer.dx}px, ${pointer.dy}px) rotate(${rotate}deg)`;
    applyStamps(card, pointer.dx, pointer.dy);
  });

  const finish = (event) => {
    if (!pointer || event.pointerId !== pointer.id) return;
    const dt = Math.max(event.timeStamp - pointer.t, 1);
    const rating = decideSwipe(pointer.dx, pointer.dy, pointer.dx / dt, pointer.dy / dt);
    card.classList.remove("is-dragging");
    pointer = null;
    if (rating) {
      rateCurrent(rating, card);
      return;
    }
    card.style.transition = "transform 220ms ease";
    card.style.transform = "";
    applyStamps(card, 0, 0);
    window.setTimeout(() => {
      card.style.transition = "";
    }, 220);
  };

  card.addEventListener("pointerup", finish);
  card.addEventListener("pointercancel", finish);
}

async function rateCurrent(rating, card = deckEl.querySelector(".rate-card-front")) {
  const work = currentWork();
  if (!work || busy) return;
  busy = true;
  updateChrome();
  store.rate(work, rating);
  await flyCard(card, rating);
  const remaining = visibleWorks().filter((item) => item.id !== work.id);
  if (pile !== "unrated") index = Math.min(index, Math.max(remaining.length - 1, 0));
  else index = 0;
  busy = false;
  renderDeck();
  maybeLoadMore();
}

function undoLast() {
  if (!store.canUndo() || busy) return;
  const undone = store.undo();
  if (!undone) return;
  const visible = visibleWorks();
  const nextIndex = visible.findIndex((work) => work.id === undone.id);
  index = nextIndex >= 0 ? nextIndex : 0;
  renderDeck();
}

function downloadRatings() {
  const rows = store.exportRows();
  if (!rows.length) return;
  const blob = new Blob([`${JSON.stringify(rows, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "compositions-ratings.json";
  link.click();
  URL.revokeObjectURL(url);
}

function setPile(next) {
  if (!PILES.includes(next) || next === pile) return;
  pile = next;
  index = 0;
  writePileParam();
  renderDeck();
}

async function ingest(source, page) {
  works = mergeWorks(works, page.items);
  continuations[source] = page.continue;
  hasMore = continuations.commons !== null || continuations.met !== null;
  renderDeck();
}

async function maybeLoadMore() {
  const unrated = filterWorks(works, store.all(), "unrated").length;
  if (!hasMore || loadingMore || unrated > 8) return;
  await loadRemote({ append: true });
}

async function loadRemote({ append = false } = {}) {
  if (loadingMore) return;
  loadingMore = true;
  if (!append) setStatus("opening commons and met open access…");
  try {
    const jobs = [];
    if (continuations.commons !== null) {
      jobs.push(
        fetchCommonsShelf({ offset: continuations.commons || 0 })
          .then((page) => ingest("commons", page))
          .catch(() => {
            continuations.commons = null;
          }),
      );
    }
    if (continuations.met !== null) {
      jobs.push(
        fetchMetShelf({ offset: continuations.met || 0 })
          .then((page) => ingest("met", page))
          .catch(() => {
            continuations.met = null;
          }),
      );
    }
    await Promise.all(jobs);
    hasMore = continuations.commons !== null || continuations.met !== null;
    const stats = counts();
    if (!stats.total) setStatus("the open-access sources are quiet right now.");
    else {
      setStatus(
        hasMore
          ? `${stats.total} paintings on the shelf · more still paging in.`
          : `${stats.total} paintings on the shelf.`,
      );
    }
  } finally {
    loadingMore = false;
    updateChrome();
  }
}

function onKeydown(event) {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    rateCurrent("nope");
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    rateCurrent("love");
  } else if (event.key === "ArrowDown" || event.key === " " || event.key === "Spacebar") {
    if (event.target instanceof HTMLButtonElement && (event.key === " " || event.key === "Spacebar")) {
      return;
    }
    event.preventDefault();
    rateCurrent("okay");
  } else if (event.key === "Backspace" || event.key === "u") {
    event.preventDefault();
    undoLast();
  }
}

undoButton.addEventListener("click", undoLast);
exportButton.addEventListener("click", downloadRatings);
nopeButton.addEventListener("click", () => rateCurrent("nope"));
okayButton.addEventListener("click", () => rateCurrent("okay"));
loveButton.addEventListener("click", () => rateCurrent("love"));
for (const button of pileButtons) {
  button.addEventListener("click", () => setPile(button.dataset.pile));
}
document.addEventListener("keydown", onKeydown);

writePileParam();
updateChrome();

try {
  works = await loadSeedCatalog();
} catch {
  works = [];
}
renderDeck();
if (works.length) {
  setStatus(`${works.length} curated works ready · fetching the live open-access shelf…`);
}
await loadRemote();
