import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { parseJsonl } from "../scripts/caption-compositions.mjs";
import { genreSearchQuery, rankSeedRecords } from "../lib/compositions/semantic-search.mjs";

const seedPath = new URL("../compositions/data/seed/impressionism-seed.jsonl", import.meta.url);
const records = parseJsonl(await readFile(seedPath, "utf8"));

const catalogLanguage =
  /\b(?:accession(?: number)?|gift of|catalog(?:ue)? no\.|dimensions?:|\d+\s*[×x]\s*\d+\s*(?:in|cm))\b/i;
const labeledFields = /\b(?:Composition|Subject|Materials and surface|Light|Color|Mood):/;

test("impressionism seed holds 10–16 unique public-domain records", () => {
  assert.ok(records.length >= 10 && records.length <= 16);
  assert.equal(new Set(records.map((record) => record.id)).size, records.length);
  assert.equal(new Set(records.map((record) => record.source_url)).size, records.length);
  assert.ok(records.every((record) => record.license === "public domain"));
  assert.ok(records.every((record) => ["met", "commons"].includes(record.source)));
  assert.ok(records.some((record) => record.source === "met"));
  assert.ok(records.some((record) => record.source === "commons"));
});

test("impressionism records include prompt captions, artist, and provenance", () => {
  const required = [
    "id",
    "source",
    "source_url",
    "image_url",
    "thumbnail_url",
    "title",
    "artist",
    "license",
    "caption_long",
    "caption_short",
  ];
  for (const record of records) {
    for (const field of required) assert.ok(field in record, `${record.id} is missing ${field}`);
    assert.equal(record.category, "impressionism");
    assert.equal(record.is_curated, true);
    assert.ok(record.caption_long.length >= 260, `${record.id} long caption is too short`);
    assert.ok(record.caption_short.length >= 25 && record.caption_short.length <= 180);
    assert.doesNotMatch(record.caption_long, catalogLanguage, record.id);
    assert.doesNotMatch(record.caption_long, labeledFields, record.id);
    assert.ok(record.provenance?.source);
  }
});

test("the impressionism tray includes Monet, Pissarro, Sisley, and Renoir veins", () => {
  const ids = new Set(records.map((record) => record.id));
  assert.ok(ids.has("commons:23750619"));
  assert.ok(ids.has("commons:22174454"));
  assert.ok(ids.has("met:437313"));
  assert.ok(ids.has("met:437683"));
  assert.ok(ids.has("met:438010"));
  assert.ok(records.some((record) => /monet/i.test(record.artist)));
  assert.ok(records.some((record) => /pissarro/i.test(record.artist)));
  assert.ok(records.some((record) => /sisley/i.test(record.artist)));
  assert.ok(records.some((record) => /renoir/i.test(record.artist)));
});

test("impressionism genre language boosts the curated tray over unrelated seeds", () => {
  const ranked = rankSeedRecords(
    "plein air garden light",
    [
      {
        id: "kitchen",
        title: "Untitled",
        caption_long: "A dim empty kitchen after supper.",
        caption_short: "an empty kitchen",
        category: "interior",
      },
      records[0],
    ],
    {},
    null,
    "impressionism",
  );
  assert.equal(ranked[0].id, records[0].id);
});

test("the library loads an impressionism curated shelf without a studio link", async () => {
  const [libraryJs, libraryHtml, studio] = await Promise.all([
    readFile(new URL("../compositions/library.js", import.meta.url), "utf8"),
    readFile(new URL("../compositions/library.html", import.meta.url), "utf8"),
    readFile(new URL("../compositions/index.html", import.meta.url), "utf8"),
  ]);
  assert.match(libraryJs, /impressionism-seed\.jsonl/);
  assert.match(libraryHtml, /data-genre="impressionism"/);
  assert.doesNotMatch(studio, /href=["'][^"']*library\.html/);
});

test("impressionism genre queries stay source-aware", () => {
  const commons = genreSearchQuery("", "impressionism", "commons");
  const met = genreSearchQuery("", "impressionism", "met");
  assert.match(commons, /impressionism/);
  assert.match(commons, /impressionist|plein air/);
  assert.equal(met, "impressionism");
});
