import test from "node:test";
import assert from "node:assert/strict";

import { commonsSearchUrl, normalizeCommonsResponse } from "../lib/compositions/commons.mjs";
import { metObjectUrl, metSearchUrl, normalizeMetObject } from "../lib/compositions/met-oa.mjs";
import {
  fetchCommonsShelf,
  interleaveSources,
  loadSeedCatalog,
  mergeWorks,
  parseJsonl,
  seedToWork,
} from "../lib/compositions/oa-catalog.mjs";

test("seed works keep stable commons/met ids used by the library", () => {
  const records = parseJsonl(
    [
      JSON.stringify({
        id: "commons:151068",
        title: "Mountain Landscape with Rainbow",
        artist: "Caspar David Friedrich",
        image_url: "https://example.test/friedrich.jpg",
        caption_short: "a lone traveler beneath a rainbow",
        source: "wikimedia commons",
      }),
      JSON.stringify({
        id: "met:436535",
        title: "Wheat Field with Cypresses",
        artist: "Vincent van Gogh",
        image_url: "https://example.test/wheat.jpg",
        source: "met open access",
      }),
    ].join("\n"),
  );
  const works = records.map(seedToWork);
  assert.equal(works[0].id, "commons:151068");
  assert.equal(works[1].id, "met:436535");
  assert.equal(works[1].source, "met open access");
});

test("mergeWorks dedupes by id and interleave alternates sources", () => {
  const commons = [
    { id: "commons:1", imageUrl: "a.jpg", source: "wikimedia commons" },
    { id: "commons:2", imageUrl: "b.jpg", source: "wikimedia commons" },
  ];
  const met = [{ id: "met:9", imageUrl: "c.jpg", source: "met open access" }];
  const merged = mergeWorks(commons, [{ ...commons[0], title: "dup" }], met);
  assert.deepEqual(
    merged.map((work) => work.id),
    ["commons:1", "commons:2", "met:9"],
  );
  assert.deepEqual(
    interleaveSources(merged).map((work) => work.id),
    ["commons:1", "met:9", "commons:2"],
  );
});

test("Met and Commons ids match the library catalog contract", () => {
  const work = normalizeMetObject({
    objectID: 436535,
    isPublicDomain: true,
    primaryImage: "https://images.metmuseum.org/wheat.jpg",
    primaryImageSmall: "https://images.metmuseum.org/wheat-sm.jpg",
    title: "Wheat Field with Cypresses",
    artistDisplayName: "Vincent van Gogh",
    objectURL: "https://www.metmuseum.org/art/collection/search/436535",
    tags: [{ term: "Landscapes" }],
    medium: "Oil on canvas",
  });
  assert.equal(work.id, "met:436535");
  assert.match(metSearchUrl("*"), /isPublicDomain=true/);
  assert.equal(metObjectUrl(436535), "https://collectionapi.metmuseum.org/public/collection/v1/objects/436535");
  assert.match(commonsSearchUrl("filetype:bitmap"), /origin=\*/);
});

test("loadSeedCatalog skips missing files and keeps valid rows", async () => {
  const fetcher = async (path) => {
    if (path.includes("missing")) return new Response("nope", { status: 404 });
    return new Response(
      `${JSON.stringify({
        id: "commons:9",
        title: "Study",
        artist: "Maya",
        image_url: "https://example.test/study.jpg",
      })}\n`,
      { status: 200 },
    );
  };
  const works = await loadSeedCatalog(fetcher, ["data/seed/missing.jsonl", "data/seed/commons-seed.jsonl"]);
  assert.equal(works.length, 1);
  assert.equal(works[0].artist, "Maya");
});

test("fetchCommonsShelf pages four bitmap batches like the library", async () => {
  const urls = [];
  const fetcher = async (url) => {
    urls.push(url);
    return Response.json({
      query: {
        pages: [
          {
            pageid: urls.length,
            title: `File:Study ${urls.length}.jpg`,
            fullurl: `https://commons.wikimedia.org/wiki/File:Study_${urls.length}.jpg`,
            imageinfo: [
              {
                url: `https://upload.wikimedia.org/study-${urls.length}.jpg`,
                thumburl: `https://upload.wikimedia.org/thumb/study-${urls.length}.jpg`,
                width: 800,
                height: 600,
                extmetadata: {
                  LicenseShortName: { value: "Public domain" },
                  LicenseUrl: { value: "https://creativecommons.org/publicdomain/mark/1.0/" },
                  ObjectName: { value: `Study ${urls.length}` },
                  Artist: { value: "Unknown" },
                },
              },
            ],
          },
        ],
      },
      continue: { gsroffset: 50 },
    });
  };
  const page = await fetchCommonsShelf({ fetcher, offset: 0 });
  assert.equal(urls.length, 4);
  assert.equal(page.items.length, 4);
  assert.equal(page.items[0].id, "commons:1");
  assert.equal(page.continue, 200);
  assert.equal(normalizeCommonsResponse({ query: { pages: {} } }).items.length, 0);
});
