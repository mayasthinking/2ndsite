export const RATINGS_STORAGE_KEY = "compositions.library.ratings.v1";
export const RATING_VALUES = ["love", "okay", "nope"];
export const DEFAULT_PILE = "unrated";
export const PILES = ["unrated", "love", "okay", "nope"];

export function createMemoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
    removeItem(key) {
      delete data[key];
    },
  };
}

function safeStorage(storage) {
  if (storage) return storage;
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    // private mode or unavailable
  }
  return createMemoryStorage();
}

function asRating(value) {
  return RATING_VALUES.includes(value) ? value : null;
}

export function parseRatingsPayload(raw) {
  if (!raw) return { records: new Map(), history: [] };
  try {
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : parsed.records;
    const records = new Map();
    for (const item of list || []) {
      const rating = asRating(item?.rating);
      if (!item?.id || !rating) continue;
      records.set(String(item.id), {
        id: String(item.id),
        artist: item.artist || "",
        title: item.title || "",
        rating,
        timestamp: item.timestamp || "",
      });
    }
    const history = Array.isArray(parsed?.history)
      ? parsed.history
          .filter((entry) => entry?.id)
          .map((entry) => ({
            id: String(entry.id),
            previous: asRating(entry.previous),
          }))
      : [];
    return { records, history };
  } catch {
    return { records: new Map(), history: [] };
  }
}

export function serializeRatings(records, history = []) {
  return JSON.stringify({
    records: [...records.values()],
    history,
  });
}

export function exportRatingRows(records) {
  return [...records.values()]
    .sort((left, right) => String(left.timestamp).localeCompare(String(right.timestamp)))
    .map((item) => ({
      id: item.id,
      artist: item.artist,
      title: item.title,
      rating: item.rating,
      timestamp: item.timestamp,
    }));
}

export function filterWorks(works, records, pile = DEFAULT_PILE) {
  if (pile === "unrated") return works.filter((work) => !records.has(work.id));
  return works.filter((work) => records.get(work.id)?.rating === pile);
}

export function progressCounts(works, records) {
  const rated = [...records.values()].filter((item) => works.some((work) => work.id === item.id));
  const love = rated.filter((item) => item.rating === "love").length;
  const okay = rated.filter((item) => item.rating === "okay").length;
  const nope = rated.filter((item) => item.rating === "nope").length;
  return {
    total: works.length,
    rated: rated.length,
    unrated: Math.max(works.length - rated.length, 0),
    love,
    okay,
    nope,
  };
}

export function createRatingStore(storage) {
  const store = safeStorage(storage);
  const loaded = parseRatingsPayload(store.getItem(RATINGS_STORAGE_KEY));
  const records = loaded.records;
  let history = loaded.history;

  function persist() {
    store.setItem(RATINGS_STORAGE_KEY, serializeRatings(records, history));
  }

  return {
    get(id) {
      return records.get(id) || null;
    },
    all() {
      return new Map(records);
    },
    rate(work, rating, timestamp = new Date().toISOString()) {
      const next = asRating(rating);
      if (!work?.id || !next) return null;
      const previous = records.get(work.id) || null;
      records.set(work.id, {
        id: work.id,
        artist: work.artist || previous?.artist || "",
        title: work.title || previous?.title || "",
        rating: next,
        timestamp,
      });
      history.push({
        id: work.id,
        previous: previous?.rating || null,
        previousRecord: previous,
      });
      persist();
      return records.get(work.id);
    },
    undo() {
      const entry = history.pop();
      if (!entry) return null;
      if (entry.previousRecord) records.set(entry.id, entry.previousRecord);
      else if (entry.previous) {
        const current = records.get(entry.id);
        if (current) records.set(entry.id, { ...current, rating: entry.previous });
      } else records.delete(entry.id);
      persist();
      return { id: entry.id, record: records.get(entry.id) || null };
    },
    canUndo() {
      return history.length > 0;
    },
    exportRows() {
      return exportRatingRows(records);
    },
    persist,
  };
}
