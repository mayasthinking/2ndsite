import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyLicense,
  commonsSearchUrl,
  normalizeCommonsResponse,
  plainText,
  toDatasetRecord,
} from "../lib/compositions/commons.mjs";

const retrievedAt = "2026-09-05T15:00:00.000Z";

function page(pageid, license, overrides = {}) {
  return {
    pageid,
    title: `File:Study ${pageid}.jpg`,
    fullurl: `https://commons.wikimedia.org/wiki/File:Study_${pageid}.jpg`,
    imageinfo: [
      {
        url: `https://upload.wikimedia.org/study-${pageid}.jpg`,
        thumburl: `https://upload.wikimedia.org/thumb/study-${pageid}.jpg`,
        width: 1200,
        height: 900,
        extmetadata: {
          LicenseShortName: { value: license },
          LicenseUrl: { value: "https://creativecommons.org/publicdomain/mark/1.0/" },
          ObjectName: { value: "<i>Field &amp; flower</i>" },
          Artist: { value: "<b>Maya Example</b>" },
          Credit: { value: "Open collection" },
          ImageDescription: { value: "A study of leaves." },
          ...overrides,
        },
      },
    ],
  };
}

test("plainText removes Commons HTML without losing entities", () => {
  assert.equal(plainText("<span>Field &amp; flower</span>&nbsp; study"), "Field & flower study");
});

test("classifyLicense accepts only CC0 and public-domain markings", () => {
  assert.equal(classifyLicense({ LicenseShortName: { value: "CC0 1.0" } }).kind, "cc0");
  assert.equal(classifyLicense({ UsageTerms: { value: "Public domain" } }).kind, "public-domain");
  assert.equal(classifyLicense({ LicenseShortName: { value: "CC BY-SA 4.0" } }), null);
});

test("normalizeCommonsResponse filters non-public-domain files and preserves provenance", () => {
  const response = normalizeCommonsResponse(
    {
      query: {
        pages: [
          page(1, "Public domain"),
          page(2, "CC0", {
            LicenseUrl: { value: "https://creativecommons.org/publicdomain/zero/1.0/" },
          }),
          page(3, "CC BY-SA 4.0"),
        ],
      },
      continue: { gsroffset: 48 },
    },
    "public-domain",
    retrievedAt,
  );

  assert.equal(response.items.length, 2);
  assert.equal(response.continue, 48);
  assert.deepEqual(
    {
      title: response.items[0].title,
      artist: response.items[0].artist,
      retrievedAt: response.items[0].retrievedAt,
    },
    {
      title: "Field & flower",
      artist: "Maya Example",
      retrievedAt,
    },
  );
});

test("CC0-only mode excludes general public-domain records", () => {
  const response = normalizeCommonsResponse(
    { query: { pages: [page(1, "Public domain"), page(2, "CC0")] } },
    "cc0",
    retrievedAt,
  );
  assert.deepEqual(response.items.map((item) => item.id), ["commons:2"]);
});

test("Commons query is image-only, paginated, and safely encoded", () => {
  const url = new URL(commonsSearchUrl("cats & gardens", 48));
  assert.equal(url.searchParams.get("gsrsearch"), "cats & gardens filetype:bitmap");
  assert.equal(url.searchParams.get("gsrnamespace"), "6");
  assert.equal(url.searchParams.get("gsroffset"), "48");
  assert.equal(url.searchParams.get("origin"), "*");
});

test("dataset export contains caption and complete provenance", () => {
  const item = normalizeCommonsResponse(
    { query: { pages: [page(7, "Public domain")] } },
    "public-domain",
    retrievedAt,
  ).items[0];
  const record = toDatasetRecord({
    ...item,
    captionLong: "An edited detailed caption.",
    captionShort: "edited caption",
  });

  assert.equal(record.caption_long, "An edited detailed caption.");
  assert.equal(record.caption_short, "edited caption");
  assert.equal(record.artist, "Maya Example");
  assert.deepEqual(Object.keys(record), [
    "id",
    "source",
    "source_url",
    "image_url",
    "thumbnail_url",
    "title",
    "artist",
    "credit",
    "license",
    "license_url",
    "license_note",
    "retrieved_at",
    "provenance",
    "ocr_text",
    "ocr_status",
    "caption_long",
    "caption_short",
    "width",
    "height",
    "category",
  ]);
  assert.equal(record.source, "wikimedia commons");
  assert.equal(record.provenance.pageId, 7);
  assert.equal(record.retrieved_at, retrievedAt);
});
