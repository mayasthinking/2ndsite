import test from "node:test";
import assert from "node:assert/strict";

import { toDatasetRecord } from "../lib/compositions/commons.mjs";
import {
  MET_CONCURRENCY,
  MET_OPEN_ACCESS_URL,
  MET_PAGE_SIZE,
  metObjectUrl,
  metSearchUrl,
  normalizeMetObject,
  normalizeMetObjects,
  rankMetItems,
} from "../lib/compositions/met.mjs";

const retrievedAt = "2026-09-06T08:30:00.000Z";

function metObject(overrides = {}) {
  return {
    objectID: 123,
    isPublicDomain: true,
    primaryImage: "https://images.metmuseum.org/CRDImages/ep/original/example.jpg",
    primaryImageSmall: "https://images.metmuseum.org/CRDImages/ep/web-large/example.jpg",
    objectURL: "https://www.metmuseum.org/art/collection/search/123",
    title: "Evening Interior",
    artistDisplayName: "Example Painter",
    objectName: "Painting",
    classification: "Paintings",
    medium: "Oil on canvas",
    objectDate: "1888",
    culture: "American",
    department: "American Paintings and Sculpture",
    accessionNumber: "12.34",
    creditLine: "Gift of an Example Donor, 1912",
    repository: "Metropolitan Museum of Art, New York, NY",
    tags: [{ term: "Interiors" }, { term: "Evening" }],
    ...overrides,
  };
}

test("Met search requests only public-domain records with images", () => {
  const rawUrl = metSearchUrl("flowers & dusk");
  const url = new URL(rawUrl);
  assert.equal(url.searchParams.get("q"), "flowers & dusk");
  assert.equal(url.searchParams.get("hasImages"), "true");
  assert.equal(url.searchParams.get("isPublicDomain"), "true");
  assert.match(rawUrl, /&q=flowers%20%26%20dusk$/);
  assert.equal(metObjectUrl(123), `${url.origin}/public/collection/v1/objects/123`);
});

test("Met normalization rejects restricted or unusable object records", () => {
  assert.equal(normalizeMetObject(metObject({ isPublicDomain: false })), null);
  assert.equal(normalizeMetObject(metObject({ primaryImage: "" })), null);
  assert.equal(normalizeMetObject(metObject({ objectID: null })), null);
  assert.equal(
    normalizeMetObjects([
      metObject(),
      metObject({ objectID: 124, isPublicDomain: false }),
      metObject({ objectID: 125, primaryImage: "" }),
    ]).length,
    1,
  );
});

test("Met records use the shared item shape and preserve Open Access provenance", () => {
  const item = normalizeMetObject(metObject(), retrievedAt);
  assert.equal(item.id, "met:123");
  assert.equal(item.source, "met open access");
  assert.equal(item.license, "public domain");
  assert.equal(item.licenseUrl, MET_OPEN_ACCESS_URL);
  assert.equal(item.retrievedAt, retrievedAt);
  assert.deepEqual(item.provenance, {
    source: "The Metropolitan Museum of Art Open Access",
    objectId: 123,
    accessionNumber: "12.34",
    repository: "Metropolitan Museum of Art, New York, NY",
    department: "American Paintings and Sculpture",
    classification: "Paintings",
    objectName: "Painting",
    objectDate: "1888",
    culture: "American",
    medium: "Oil on canvas",
    creditLine: "Gift of an Example Donor, 1912",
    tags: ["Interiors", "Evening"],
  });
  assert.match(item.captionLong, /^create a scene of Evening Interior;/);
  assert.match(item.captionLong, /include interiors, evening/);
  assert.match(item.captionLong, /layered painterly texture/);
  assert.equal(item.captionShort, "Evening Interior, Interiors, Evening.");
  assert.doesNotMatch(item.captionLong, /12\.34|Gift of|1888|American Paintings/);

  const record = toDatasetRecord(item);
  assert.equal(record.source, "met open access");
  assert.equal(record.artist, "Example Painter");
  assert.equal(record.license_note, "The Met Open Access API marks this object as public domain.");
  assert.equal(record.provenance.accessionNumber, "12.34");
  assert.equal(record.source_url, item.sourceUrl);
  assert.equal(record.image_url, item.imageUrl);
});

test("Met genre ranking filters broad API matches using normalized object fields", () => {
  const unrelated = normalizeMetObject(
    metObject({
      objectID: 200,
      title: "Virgin and Child",
      tags: [{ term: "Fruit" }, { term: "Figures" }],
    }),
  );
  const stillLife = normalizeMetObject(
    metObject({
      objectID: 201,
      title: "Still Life with Citrus",
      classification: "Paintings",
      tags: [{ term: "Still Life" }, { term: "Fruit" }],
    }),
  );
  const ranked = rankMetItems([unrelated, stillLife], "still-life", "citrus");
  assert.deepEqual(ranked.map((item) => item.id), ["met:201"]);
});

test("Met ranking keeps artist and title matches even when they miss the genre medium", () => {
  const monet = normalizeMetObject(
    metObject({
      objectID: 300,
      title: "Impression, Sunrise",
      artistDisplayName: "Claude Monet",
      medium: "Oil on canvas",
      tags: [{ term: "Harbors" }, { term: "Sun" }],
    }),
  );
  const wash = normalizeMetObject(
    metObject({
      objectID: 301,
      title: "Lake Study",
      artistDisplayName: "Example Painter",
      medium: "Watercolor",
      tags: [{ term: "Lakes" }],
    }),
  );
  const ranked = rankMetItems([wash, monet], "romantic-wash", "Monet");
  assert.equal(ranked[0].id, "met:300");
  assert.ok(ranked.some((item) => item.id === "met:300"));
});

test("Met shelf pages resolve 120 objects with bounded concurrency", () => {
  assert.equal(MET_PAGE_SIZE, 120);
  assert.equal(MET_CONCURRENCY, 16);
});
