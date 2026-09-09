import test from "node:test";
import assert from "node:assert/strict";

import {
  createMemoryStorage,
  createRatingStore,
  exportRatingRows,
  filterWorks,
  parseRatingsPayload,
  progressCounts,
  RATINGS_STORAGE_KEY,
} from "../lib/compositions/ratings.mjs";

const works = [
  { id: "commons:1", artist: "Turner", title: "Rain, Steam and Speed" },
  { id: "met:2", artist: "Monet", title: "Water Lilies" },
  { id: "commons:3", artist: "Friedrich", title: "Wanderer" },
];

test("rating store persists love/okay/nope by stable work id", () => {
  const storage = createMemoryStorage();
  const store = createRatingStore(storage);
  store.rate(works[0], "love", "2026-09-09T12:00:00.000Z");
  store.rate(works[1], "okay", "2026-09-09T12:01:00.000Z");
  store.rate(works[2], "nope", "2026-09-09T12:02:00.000Z");

  const restored = createRatingStore(storage);
  assert.equal(restored.get("commons:1").rating, "love");
  assert.equal(restored.get("met:2").title, "Water Lilies");
  assert.equal(JSON.parse(storage.getItem(RATINGS_STORAGE_KEY)).records.length, 3);
});

test("undo restores the previous rating or clears it", () => {
  const store = createRatingStore(createMemoryStorage());
  store.rate(works[0], "okay", "2026-09-09T12:00:00.000Z");
  store.rate(works[0], "love", "2026-09-09T12:01:00.000Z");
  assert.equal(store.get("commons:1").rating, "love");
  store.undo();
  assert.equal(store.get("commons:1").rating, "okay");
  store.undo();
  assert.equal(store.get("commons:1"), null);
  assert.equal(store.canUndo(), false);
});

test("unrated is the default pile and review piles use stored ratings", () => {
  const store = createRatingStore(createMemoryStorage());
  store.rate(works[0], "love", "2026-09-09T12:00:00.000Z");
  store.rate(works[2], "nope", "2026-09-09T12:02:00.000Z");
  const records = store.all();
  assert.deepEqual(
    filterWorks(works, records, "unrated").map((work) => work.id),
    ["met:2"],
  );
  assert.deepEqual(
    filterWorks(works, records, "love").map((work) => work.id),
    ["commons:1"],
  );
  assert.equal(progressCounts(works, records).rated, 2);
  assert.equal(progressCounts(works, records).unrated, 1);
});

test("export JSON rows are id, artist, title, rating, timestamp", () => {
  const store = createRatingStore(createMemoryStorage());
  store.rate(works[1], "okay", "2026-09-09T12:01:00.000Z");
  store.rate(works[0], "love", "2026-09-09T12:00:00.000Z");
  assert.deepEqual(store.exportRows(), [
    {
      id: "commons:1",
      artist: "Turner",
      title: "Rain, Steam and Speed",
      rating: "love",
      timestamp: "2026-09-09T12:00:00.000Z",
    },
    {
      id: "met:2",
      artist: "Monet",
      title: "Water Lilies",
      rating: "okay",
      timestamp: "2026-09-09T12:01:00.000Z",
    },
  ]);
  assert.deepEqual(exportRatingRows(store.all()), store.exportRows());
});

test("parseRatingsPayload ignores broken storage", () => {
  assert.equal(parseRatingsPayload("not-json").records.size, 0);
  assert.equal(parseRatingsPayload('[{"id":"x","rating":"maybe"}]').records.size, 0);
});
