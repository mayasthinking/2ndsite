import {
  commonsSearchUrl,
  normalizeCommonsResponse,
  toDatasetRecord,
} from "../lib/compositions/commons.mjs";
import {
  metObjectUrl,
  metSearchUrl,
  normalizeMetObjects,
  rankMetItems,
} from "../lib/compositions/met.mjs";
import {
  cosineSimilarity,
  expandVisualQuery,
  genreMatchScore,
  genreSearchQuery,
  rankSeedRecords,
  SEMANTIC_MODEL,
  SEMANTIC_MODEL_DTYPE,
  semanticText,
} from "../lib/compositions/semantic-search.mjs";

const STORAGE_KEY = "compositions.library.kept.v2";
const MODEL_MODULE = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0/+esm";
const CURATED_SHELVES = {
  "romantic-wash": {
    label: "romantic wash",
    file: "data/seed/romantic-wash-seed.jsonl",
    ready: (count) => `${count} curated romantic washes ready to browse or keep.`,
    empty: "the romantic wash tray is quiet right now.",
  },
  impressionism: {
    label: "impressionism",
    file: "data/seed/impressionism-seed.jsonl",
    ready: (count) => `${count} curated impressionist paintings ready to browse or keep.`,
    empty: "the impressionism tray is quiet right now.",
  },
};
const DEFAULT_CURATED_GENRE = "romantic-wash";
const searchForm = document.querySelector("#librarySearch");
const queryInput = document.querySelector("#libraryQuery");
const statusEl = document.querySelector("#libraryStatus");
const gridEl = document.querySelector("#libraryGrid");
const resultCountEl = document.querySelector("#resultCount");
const resultsEyebrow = document.querySelector("#resultsEyebrow");
const resultsTitle = document.querySelector("#resultsTitle");
const moreButton = document.querySelector("#libraryMore");
const keptListEl = document.querySelector("#keptList");
const keptEmptyEl = document.querySelector("#keptEmpty");
const keptCountEl = document.querySelector("#keptCount");
const exportButton = document.querySelector("#exportKept");

let licenseFilter = "public-domain";
let sourceFilter = "both";
let genreFilter = DEFAULT_CURATED_GENRE;
let exportFormat = "json";
let continuations = { commons: null, met: null };
let currentQuery = "";
let remoteResults = [];
let seedRecords = [];
let curatedRecords = [];
let semanticIndex = {};
let semanticPipelinePromise = null;
let requestController = null;
let searchSequence = 0;
const candidateVectors = new Map();
const skipped = new Set();
const kept = loadKept();

function loadKept() {
  try {
    const records = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return new Map(records.map((item) => [item.id, item]));
  } catch {
    return new Map();
  }
}

function saveKept() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...kept.values()]));
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function setStatus(message, busy = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("is-busy", busy);
}

function parseJsonl(content) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function recordSourceKind(record) {
  const source = String(record.source || "").toLowerCase();
  if (source === "met" || source === "met open access") return "met";
  return "commons";
}

function displaySource(record) {
  return recordSourceKind(record) === "met" ? "met open access" : "wikimedia commons";
}

function curatedShelf(genreId = genreFilter) {
  return CURATED_SHELVES[genreId] || null;
}

function isCuratedGenre(genreId = genreFilter) {
  return Boolean(curatedShelf(genreId));
}

function curatedGenreId(record) {
  if (record.category === "romantic wash") return "romantic-wash";
  if (record.category === "impressionism") return "impressionism";
  return "";
}

function isCuratedRecord(record) {
  return record.is_curated === true || Boolean(curatedGenreId(record));
}

function seedMatchesSource(record) {
  return sourceFilter === "both" || recordSourceKind(record) === sourceFilter;
}

function seedToItem(record) {
  return {
    id: record.id,
    source: displaySource(record),
    sourceUrl: record.source_url,
    imageUrl: record.image_url,
    thumbnailUrl: record.thumbnail_url || record.image_url,
    title: record.title,
    artist: record.artist || record.credit,
    credit: record.credit || record.artist,
    license: record.license,
    licenseUrl: record.license_url,
    licenseNote: record.license_note || null,
    retrievedAt: record.retrieved_at,
    ocrText: record.ocr_text,
    ocrStatus: record.ocr_status,
    caption: record.caption_long,
    captionLong: record.caption_long,
    captionShort: record.caption_short,
    width: record.width,
    height: record.height,
    category: record.category,
    provenance: record.provenance || null,
    semanticScore: record.semanticScore,
    isSeed: true,
    isCurated: isCuratedRecord(record),
    curatedLabel: curatedShelf(curatedGenreId(record))?.label || "",
  };
}

async function loadJsonl(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} unavailable`);
  return parseJsonl(await response.text());
}

async function loadSeed() {
  const curatedPaths = Object.values(CURATED_SHELVES).map((shelf) => shelf.file);
  const [recordsResponse, indexResponse, ...curatedResponses] = await Promise.allSettled([
    fetch("data/seed/commons-seed.jsonl"),
    fetch("data/seed/semantic-index.json"),
    ...curatedPaths.map((path) => loadJsonl(path)),
  ]);
  curatedRecords = curatedResponses.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );
  try {
    const commonsRecords =
      recordsResponse.status === "fulfilled" && recordsResponse.value.ok
        ? parseJsonl(await recordsResponse.value.text())
        : [];
    seedRecords = [...commonsRecords, ...curatedRecords];
  } catch {
    seedRecords = curatedRecords;
  }
  try {
    semanticIndex =
      indexResponse.status === "fulfilled" && indexResponse.value.ok
        ? (await indexResponse.value.json()).vectors || {}
        : {};
  } catch {
    semanticIndex = {};
  }
}

async function semanticPipeline() {
  if (!semanticPipelinePromise) {
    semanticPipelinePromise = import(MODEL_MODULE)
      .then(({ pipeline }) =>
        pipeline("feature-extraction", SEMANTIC_MODEL, { dtype: SEMANTIC_MODEL_DTYPE }),
      )
      .catch((error) => {
        semanticPipelinePromise = null;
        throw error;
      });
  }
  return semanticPipelinePromise;
}

async function embedTexts(texts) {
  const embed = await semanticPipeline();
  const result = await embed(texts, { pooling: "mean", normalize: true });
  const dimensions = result.dims.at(-1);
  return texts.map((_, index) =>
    Array.from(result.data.slice(index * dimensions, (index + 1) * dimensions)),
  );
}

async function embedTextsInBatches(texts, batchSize = 24) {
  const vectors = [];
  for (let index = 0; index < texts.length; index += batchSize) {
    vectors.push(...(await embedTexts(texts.slice(index, index + batchSize))));
  }
  return vectors;
}

async function fetchCommons(search, offset, signal) {
  const params = new URLSearchParams({ q: search, license: licenseFilter });
  if (offset) params.set("continue", offset);

  try {
    const response = await fetch(`/api/commons?${params}`, { signal });
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !contentType.includes("application/json")) {
      throw new Error("proxy unavailable");
    }
    return await response.json();
  } catch (error) {
    if (error.name === "AbortError") throw error;
    const batchSize = 50;
    const responses = await Promise.all(
      [offset || 0, (offset || 0) + batchSize].map((batchOffset) =>
        fetch(commonsSearchUrl(search, batchOffset, batchSize), { signal }),
      ),
    );
    if (responses.some((response) => !response.ok)) {
      throw new Error(`commons returned ${responses.find((response) => !response.ok).status}`);
    }
    const batches = await Promise.all(
      responses.map(async (response) =>
        normalizeCommonsResponse(await response.json(), licenseFilter),
      ),
    );
    return {
      items: batches.flatMap((batch) => batch.items),
      continue: batches.some((batch) => batch.continue !== null) ? (offset || 0) + 100 : null,
    };
  }
}

async function fetchMet(search, keyword, offset = 0, signal) {
  const params = new URLSearchParams({ q: search, genre: genreFilter, keyword });
  if (offset) params.set("continue", offset);

  try {
    const response = await fetch(`/api/met?${params}`, { signal });
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !contentType.includes("application/json")) {
      throw new Error("proxy unavailable");
    }
    return await response.json();
  } catch (error) {
    if (error.name === "AbortError") throw error;
    const searchResponse = await fetch(metSearchUrl(search), { signal });
    if (!searchResponse.ok) throw new Error(`met returned ${searchResponse.status}`);
    const objectIds = (await searchResponse.json()).objectIDs || [];
    const pageSize = 60;
    const concurrency = 12;
    const pageIds = objectIds.slice(offset, offset + pageSize);
    const objects = [];
    for (let index = 0; index < pageIds.length; index += concurrency) {
      const responses = await Promise.all(
        pageIds
          .slice(index, index + concurrency)
          .map((objectId) => fetch(metObjectUrl(objectId), { signal })),
      );
      objects.push(
        ...(await Promise.all(
          responses.filter((response) => response.ok).map((response) => response.json()),
        )),
      );
    }
    return {
      items: rankMetItems(normalizeMetObjects(objects), genreFilter, keyword),
      continue: offset + pageSize < objectIds.length ? offset + pageSize : null,
    };
  }
}

function selectedSources() {
  return sourceFilter === "both" ? ["commons", "met"] : [sourceFilter];
}

function licenseOk(record) {
  return licenseFilter !== "cc0" || record.license === "cc0";
}

function curatedShelfItems() {
  if (!isCuratedGenre()) return [];
  return curatedRecords
    .filter((record) => curatedGenreId(record) === genreFilter)
    .filter(seedMatchesSource)
    .filter(licenseOk)
    .map((record) => seedToItem({ ...record, semanticScore: 1 }));
}

function rankedSeed(query, queryEmbedding = null) {
  const pool = seedRecords.filter(seedMatchesSource).filter(licenseOk);
  const limit = isCuratedGenre() ? 20 : 12;
  return rankSeedRecords(query, pool, semanticIndex, queryEmbedding, genreFilter)
    .filter((record) => record.semanticScore > 0.08 || isCuratedRecord(record))
    .slice(0, limit)
    .map(seedToItem);
}

function interleaveSources(items) {
  if (sourceFilter !== "both") return items;
  const commons = items.filter((item) => item.source === "wikimedia commons");
  const met = items.filter((item) => item.source === "met open access");
  const interleaved = [];
  for (let index = 0; index < Math.max(commons.length, met.length); index += 1) {
    if (commons[index]) interleaved.push(commons[index]);
    if (met[index]) interleaved.push(met[index]);
  }
  return interleaved;
}

function currentVisibleResults(query, queryEmbedding = null) {
  const curated = curatedShelfItems();
  const known = new Set(curated.map((item) => item.id));
  const includeRankedSeeds = Boolean(currentQuery) || !isCuratedGenre();
  const seed = includeRankedSeeds
    ? rankedSeed(query, queryEmbedding).filter((item) => !known.has(item.id))
    : [];
  seed.forEach((item) => known.add(item.id));
  const remote = interleaveSources(remoteResults.filter((item) => !known.has(item.id)));
  return [...curated, ...seed, ...remote]
    .filter((item) => licenseFilter !== "cc0" || item.license === "cc0")
    .filter((item) => !skipped.has(item.id));
}

async function rerankWithModel(query, sequence) {
  try {
    const [queryEmbedding] = await embedTexts([query]);
    if (sequence !== searchSequence) return;

    const missing = remoteResults.filter((item) => !candidateVectors.has(item.id));
    if (missing.length) {
      const vectors = await embedTextsInBatches(
        missing.map((item) => semanticText(toDatasetRecord(item))),
      );
      missing.forEach((item, index) => candidateVectors.set(item.id, vectors[index]));
    }
    if (sequence !== searchSequence) return;

    remoteResults = remoteResults
      .map((item) => ({
        ...item,
        semanticScore: cosineSimilarity(queryEmbedding, candidateVectors.get(item.id)),
      }))
      .sort((left, right) => right.semanticScore - left.semanticScore);
    renderResults(query, queryEmbedding, true);
    setStatus(
      `${rankedSeed(query, queryEmbedding).length} caption matches · ${remoteResults.length} open-access candidates.`,
    );
  } catch {
    if (sequence === searchSequence) {
      setStatus(
        `${rankedSeed(query).length} local caption matches · open-access results are ready. embedding model unavailable.`,
      );
    }
  }
}

function updateWallCopy() {
  const shelf = curatedShelf();
  if (shelf) {
    if (resultsEyebrow) resultsEyebrow.textContent = "curated tray · met open access + commons";
    if (resultsTitle) resultsTitle.textContent = shelf.label;
    return;
  }
  if (resultsEyebrow) resultsEyebrow.textContent = "caption index + commons + met open access";
  if (resultsTitle) resultsTitle.textContent = "meaning shelves";
}

async function searchLibrary({ append = false } = {}) {
  const search = queryInput.value.trim();
  if (!search && !genreFilter) {
    queryInput.focus();
    setStatus("add a search or choose a genre.");
    return;
  }
  const rankQuery = genreSearchQuery(search, genreFilter, "semantic");
  if (!search && isCuratedGenre() && !append) {
    const shelf = curatedShelf();
    requestController?.abort();
    requestController = null;
    searchSequence += 1;
    currentQuery = "";
    remoteResults = [];
    continuations = { commons: null, met: null };
    skipped.clear();
    updateWallCopy();
    renderResults(rankQuery);
    const curatedCount = curatedShelfItems().filter((item) => !skipped.has(item.id)).length;
    setStatus(curatedCount ? shelf.ready(curatedCount) : shelf.empty);
    moreButton.hidden = true;
    return;
  }

  requestController?.abort();
  requestController = new AbortController();
  const sequence = append ? searchSequence : ++searchSequence;
  currentQuery = search;
  moreButton.disabled = true;
  if (!append) {
    remoteResults = [];
    continuations = { commons: null, met: null };
    skipped.clear();
    gridEl.setAttribute("aria-busy", "true");
    renderResults(rankQuery);
  }
  setStatus(append ? "opening another image shelf…" : "ranking captions by meaning…", true);

  try {
    const expanded = expandVisualQuery(genreSearchQuery(search, genreFilter, "commons"), 8);
    const metQuery = genreSearchQuery(search, genreFilter, "met");
    const sources = selectedSources().filter(
      (source) => !append || continuations[source] !== null,
    );
    const responses = await Promise.allSettled(
      sources.map((source) =>
        source === "commons"
          ? fetchCommons(expanded, continuations.commons, requestController.signal)
          : fetchMet(metQuery, search, continuations.met, requestController.signal),
      ),
    );
    if (responses.some((result) => result.reason?.name === "AbortError")) {
      throw new DOMException("aborted", "AbortError");
    }
    if (sequence !== searchSequence) return;
    const known = new Set(remoteResults.map((item) => item.id));
    responses.forEach((result, index) => {
      if (result.status !== "fulfilled") return;
      const source = sources[index];
      const incoming = result.value.items
        .filter((item) => !known.has(item.id))
        .sort(
          (left, right) =>
            genreMatchScore(genreFilter, semanticText(toDatasetRecord(right))) -
            genreMatchScore(genreFilter, semanticText(toDatasetRecord(left))),
        );
      remoteResults.push(...incoming);
      incoming.forEach((item) => known.add(item.id));
      continuations[source] = result.value.continue;
    });
    if (responses.every((result) => result.status === "rejected")) {
      throw new Error("all sources unavailable");
    }
    renderResults(rankQuery);
    setStatus(
      `${rankedSeed(rankQuery).length} caption matches · ${remoteResults.length} open-access candidates. refining…`,
      true,
    );
    rerankWithModel(rankQuery, sequence);
  } catch (error) {
    if (error.name !== "AbortError") {
      renderResults(rankQuery);
      setStatus(`${rankedSeed(rankQuery).length} local caption matches · image sources are quiet right now.`);
      rerankWithModel(rankQuery, sequence);
    }
  } finally {
    gridEl.removeAttribute("aria-busy");
    moreButton.disabled = false;
  }
}

function renderResults(
  query = genreSearchQuery(currentQuery, genreFilter, "semantic"),
  queryEmbedding = null,
  modelRanked = false,
) {
  updateWallCopy();
  gridEl.replaceChildren();
  const visible = currentVisibleResults(query, queryEmbedding);
  for (const item of visible) gridEl.append(createCandidateCard(item, modelRanked));
  const curatedCount = visible.filter((item) => item.isCurated).length;
  const seedCount = visible.filter((item) => item.isSeed && !item.isCurated).length;
  resultCountEl.textContent = visible.length
    ? curatedCount && isCuratedGenre()
      ? `${curatedCount} curated · ${visible.length} showing`
      : `${seedCount + curatedCount} meaning ${seedCount + curatedCount === 1 ? "match" : "matches"} · ${visible.length} showing`
    : "";
  moreButton.hidden = !selectedSources().some((source) => continuations[source] !== null);
}

function createCandidateCard(item, modelRanked = false) {
  const card = element(
    "article",
    `library-card${item.isCurated ? " is-curated" : item.isSeed ? " is-semantic" : ""}`,
  );
  card.dataset.id = item.id;

  const frame = element("div", "frame library-frame");
  const image = document.createElement("img");
  image.src = item.thumbnailUrl;
  image.alt = item.captionShort || item.title;
  image.loading = "lazy";
  image.decoding = "async";

  const license = element("a", "library-license", item.license);
  license.href = item.licenseUrl;
  license.target = "_blank";
  license.rel = "noopener noreferrer";
  license.setAttribute("aria-label", `${item.license} license`);
  frame.append(image, license);

  const copy = element("div", "library-card-copy");
  const sourceLine = element(
    "span",
    "library-match",
    item.isCurated
      ? `curated ${item.curatedLabel || "tray"} · ${item.source}`
      : item.isSeed
        ? `${modelRanked ? "semantic" : "caption"} match · ${Math.round(item.semanticScore * 100)}%`
        : item.semanticScore
          ? `${item.source} rerank · ${Math.round(item.semanticScore * 100)}%`
          : item.source,
  );
  const title = element("a", "library-card-title", item.title);
  title.href = item.sourceUrl;
  title.target = "_blank";
  title.rel = "noopener noreferrer";
  const caption = element("p", "library-card-caption", item.captionShort || item.caption);
  const artist = element("p", "library-card-artist", item.artist);
  copy.append(sourceLine, title, caption, artist);

  const actions = element("div", "library-card-actions");
  const keepButton = element("button", "library-action library-keep");
  keepButton.type = "button";
  keepButton.textContent = kept.has(item.id) ? "kept" : "keep";
  keepButton.classList.toggle("is-kept", kept.has(item.id));
  keepButton.setAttribute("aria-pressed", kept.has(item.id) ? "true" : "false");
  keepButton.addEventListener("click", () => toggleKept(item));

  const skipButton = element("button", "library-action", "skip");
  skipButton.type = "button";
  skipButton.addEventListener("click", () => {
    skipped.add(item.id);
    renderResults();
  });
  actions.append(keepButton, skipButton);
  card.append(frame, copy, actions);
  return card;
}

function toggleKept(item) {
  if (kept.has(item.id)) kept.delete(item.id);
  else kept.set(item.id, { ...item, retrievedAt: item.retrievedAt || new Date().toISOString() });
  saveKept();
  renderKept();
  renderResults();
}

function renderKept() {
  keptListEl.replaceChildren();
  const records = [...kept.values()];
  keptCountEl.textContent = String(records.length);
  keptEmptyEl.hidden = records.length > 0;
  exportButton.disabled = records.length === 0;

  for (const item of records) {
    const row = element("article", "library-kept-item");
    const image = document.createElement("img");
    image.src = item.thumbnailUrl;
    image.alt = "";
    image.loading = "lazy";

    const body = element("div", "library-kept-body");
    const title = element("a", "library-kept-title", item.title);
    title.href = item.sourceUrl;
    title.target = "_blank";
    title.rel = "noopener noreferrer";

    const longLabel = element("label", "library-caption-label", "detailed caption");
    const longCaption = document.createElement("textarea");
    longCaption.rows = 4;
    longCaption.value = item.captionLong || item.caption || "";
    longCaption.setAttribute("aria-label", `detailed caption for ${item.title}`);
    longCaption.addEventListener("change", () => {
      item.captionLong = longCaption.value.trim();
      item.caption = item.captionLong;
      saveKept();
    });
    longLabel.append(longCaption);

    const shortLabel = element("label", "library-caption-label", "short caption");
    const shortCaption = document.createElement("textarea");
    shortCaption.rows = 2;
    shortCaption.value = item.captionShort || item.title;
    shortCaption.setAttribute("aria-label", `short caption for ${item.title}`);
    shortCaption.addEventListener("change", () => {
      item.captionShort = shortCaption.value.trim();
      saveKept();
    });
    shortLabel.append(shortCaption);
    body.append(title, longLabel, shortLabel);

    const remove = element("button", "library-remove", "×");
    remove.type = "button";
    remove.setAttribute("aria-label", `remove ${item.title}`);
    remove.addEventListener("click", () => {
      kept.delete(item.id);
      saveKept();
      renderKept();
      renderResults();
    });
    row.append(image, body, remove);
    keptListEl.append(row);
  }
}

function downloadKept() {
  const records = [...kept.values()].map(toDatasetRecord);
  const content =
    exportFormat === "jsonl"
      ? `${records.map((record) => JSON.stringify(record)).join("\n")}\n`
      : `${JSON.stringify(records, null, 2)}\n`;
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `compositions-library.${exportFormat}`;
  link.click();
  URL.revokeObjectURL(url);
}

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  searchLibrary();
});

moreButton.addEventListener("click", () => searchLibrary({ append: true }));
exportButton.addEventListener("click", downloadKept);

for (const button of document.querySelectorAll("[data-license]")) {
  button.addEventListener("click", () => {
    licenseFilter = button.dataset.license;
    for (const peer of document.querySelectorAll("[data-license]")) {
      peer.classList.toggle("active", peer === button);
    }
    queryInput.value = currentQuery || queryInput.value;
    searchLibrary();
  });
}

for (const button of document.querySelectorAll("[data-source]")) {
  button.addEventListener("click", () => {
    sourceFilter = button.dataset.source;
    for (const peer of document.querySelectorAll("[data-source]")) {
      peer.classList.toggle("active", peer === button);
    }
    queryInput.value = currentQuery || queryInput.value;
    searchLibrary();
  });
}

for (const button of document.querySelectorAll("[data-genre]")) {
  button.addEventListener("click", () => {
    genreFilter = button.dataset.genre;
    for (const peer of document.querySelectorAll("[data-genre]")) {
      peer.classList.toggle("active", peer === button);
    }
    searchLibrary();
  });
}

for (const button of document.querySelectorAll("[data-format]")) {
  button.addEventListener("click", () => {
    exportFormat = button.dataset.format;
    for (const peer of document.querySelectorAll("[data-format]")) {
      peer.classList.toggle("active", peer === button);
    }
  });
}

await loadSeed();
renderKept();
searchLibrary();
