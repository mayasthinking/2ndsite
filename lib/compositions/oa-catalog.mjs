import {
  COMMONS_BATCH_SIZE,
  COMMONS_PAGE_SIZE,
  commonsPageOffsets,
  commonsSearchUrl,
  normalizeCommonsResponse,
} from "./commons.mjs";
import {
  MET_BROWSE_QUERY,
  MET_CONCURRENCY,
  MET_PAGE_SIZE,
  metObjectUrl,
  metSearchUrl,
  normalizeMetObjects,
} from "./met-oa.mjs";

export const COMMONS_BROWSE_QUERY = "filetype:bitmap";
export const SEED_PATHS = [
  "data/seed/commons-seed.jsonl",
  "data/seed/romantic-wash-seed.jsonl",
  "data/seed/impressionism-seed.jsonl",
];

export function parseJsonl(content) {
  return String(content || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function recordSourceKind(record) {
  const source = String(record.source || record.id || "").toLowerCase();
  if (source.startsWith("met") || source === "met open access") return "met";
  return "commons";
}

export function cleanArtist(value = "") {
  const artist = String(value || "").replace(/\s+/g, " ").trim();
  if (!artist) return "";
  if (artist.length <= 72 && !/isbn|dvd-rom|distributed by|yorck project|own work by the original uploader/i.test(artist)) {
    return artist;
  }
  const short = artist.split(/\s+\d+\./)[0].replace(/[,;]\s*$/, "").trim();
  if (short && short.length <= 72 && !/isbn|dvd-rom|distributed by|yorck project|own work by the original uploader/i.test(short)) {
    return short;
  }
  return "";
}

export function seedToWork(record) {
  return {
    id: record.id,
    source: recordSourceKind(record) === "met" ? "met open access" : "wikimedia commons",
    sourceUrl: record.source_url || record.sourceUrl,
    imageUrl: record.image_url || record.imageUrl,
    thumbnailUrl: record.thumbnail_url || record.thumbnailUrl || record.image_url || record.imageUrl,
    title: record.title || "",
    artist: cleanArtist(record.artist) || cleanArtist(record.credit) || "",
    credit: record.credit || record.artist || "",
    license: record.license,
    licenseUrl: record.license_url || record.licenseUrl,
    caption: record.caption_long || record.captionLong || record.caption || record.caption_short || "",
    captionLong: record.caption_long || record.captionLong || record.caption || "",
    captionShort: record.caption_short || record.captionShort || record.title || "",
    width: record.width ?? null,
    height: record.height ?? null,
    category: record.category || "",
    isSeed: true,
  };
}

export function mergeWorks(...lists) {
  const merged = [];
  const seen = new Set();
  for (const list of lists) {
    for (const work of list || []) {
      if (!work?.id || !work.imageUrl || seen.has(work.id)) continue;
      seen.add(work.id);
      merged.push(work);
    }
  }
  return merged;
}

export function interleaveSources(works) {
  const commons = works.filter((work) => recordSourceKind(work) === "commons");
  const met = works.filter((work) => recordSourceKind(work) === "met");
  const interleaved = [];
  for (let index = 0; index < Math.max(commons.length, met.length); index += 1) {
    if (commons[index]) interleaved.push(commons[index]);
    if (met[index]) interleaved.push(met[index]);
  }
  return interleaved;
}

async function readJson(response, label) {
  if (!response.ok) throw new Error(`${label} returned ${response.status}`);
  return response.json();
}

export async function loadSeedCatalog(fetcher = fetch, paths = SEED_PATHS) {
  const responses = await Promise.allSettled(paths.map((path) => fetcher(path)));
  const records = [];
  for (const result of responses) {
    if (result.status !== "fulfilled" || !result.value?.ok) continue;
    try {
      records.push(...parseJsonl(await result.value.text()));
    } catch {
      // skip a broken seed file and keep the rest of the shelf
    }
  }
  return mergeWorks(records.map(seedToWork));
}

export async function fetchCommonsShelf({
  search = COMMONS_BROWSE_QUERY,
  offset = 0,
  fetcher = fetch,
  signal,
} = {}) {
  const responses = await Promise.all(
    commonsPageOffsets(offset).map((batchOffset) =>
      fetcher(commonsSearchUrl(search, batchOffset, COMMONS_BATCH_SIZE), { signal }),
    ),
  );
  if (responses.some((response) => !response.ok)) {
    throw new Error(`commons returned ${responses.find((response) => !response.ok).status}`);
  }
  const batches = await Promise.all(
    responses.map(async (response) => normalizeCommonsResponse(await response.json(), "public-domain")),
  );
  return {
    items: batches.flatMap((batch) => batch.items),
    continue: batches.some((batch) => batch.continue !== null) ? offset + COMMONS_PAGE_SIZE : null,
  };
}

export async function fetchMetShelf({
  search = MET_BROWSE_QUERY,
  offset = 0,
  fetcher = fetch,
  signal,
} = {}) {
  const searchResponse = await fetcher(metSearchUrl(search), { signal });
  const objectIds = (await readJson(searchResponse, "met search")).objectIDs || [];
  const pageIds = objectIds.slice(offset, offset + MET_PAGE_SIZE);
  const objects = [];
  for (let index = 0; index < pageIds.length; index += MET_CONCURRENCY) {
    const responses = await Promise.all(
      pageIds
        .slice(index, index + MET_CONCURRENCY)
        .map((objectId) => fetcher(metObjectUrl(objectId), { signal })),
    );
    objects.push(
      ...(await Promise.all(
        responses.filter((response) => response.ok).map((response) => response.json()),
      )),
    );
  }
  return {
    items: normalizeMetObjects(objects),
    continue: offset + MET_PAGE_SIZE < objectIds.length ? offset + MET_PAGE_SIZE : null,
  };
}

export async function loadOpenAccessPage({
  fetcher = fetch,
  signal,
  commonsOffset = 0,
  metOffset = 0,
} = {}) {
  const tasks = [];
  const labels = [];
  if (commonsOffset !== null) {
    labels.push("commons");
    tasks.push(fetchCommonsShelf({ offset: commonsOffset || 0, fetcher, signal }));
  }
  if (metOffset !== null) {
    labels.push("met");
    tasks.push(fetchMetShelf({ offset: metOffset || 0, fetcher, signal }));
  }
  if (!tasks.length) {
    return { items: [], continuations: { commons: null, met: null } };
  }
  const settled = await Promise.allSettled(tasks);
  const bySource = { commons: { items: [], continue: null }, met: { items: [], continue: null } };
  settled.forEach((result, index) => {
    const source = labels[index];
    if (result.status === "fulfilled") bySource[source] = result.value;
  });
  if (settled.every((result) => result.status === "rejected")) {
    throw settled[0].reason || new Error("open-access sources are quiet");
  }
  return {
    items: interleaveSources(mergeWorks(bySource.commons.items, bySource.met.items)),
    continuations: {
      commons: labels.includes("commons") ? bySource.commons.continue : commonsOffset,
      met: labels.includes("met") ? bySource.met.continue : metOffset,
    },
  };
}
