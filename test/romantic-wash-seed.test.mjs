import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { parseJsonl } from "../scripts/caption-compositions.mjs";
import { genreSearchQuery, rankSeedRecords } from "../lib/compositions/semantic-search.mjs";

const seedPath = new URL("../compositions/data/seed/romantic-wash-seed.jsonl", import.meta.url);
const records = parseJsonl(await readFile(seedPath, "utf8"));

const catalogLanguage =
  /\b(?:accession(?: number)?|gift of|catalog(?:ue)? no\.|dimensions?:|\d+\s*[×x]\s*\d+\s*(?:in|cm))\b/i;
const labeledFields = /\b(?:Composition|Subject|Materials and surface|Light|Color|Mood):/;

test("romantic wash seed holds 10–16 unique public-domain records", () => {
  assert.ok(records.length >= 10 && records.length <= 16);
  assert.equal(new Set(records.map((record) => record.id)).size, records.length);
  assert.equal(new Set(records.map((record) => record.source_url)).size, records.length);
  assert.ok(records.every((record) => record.license === "public domain"));
  assert.ok(records.every((record) => ["met", "commons"].includes(record.source)));
  assert.ok(records.some((record) => record.source === "met"));
  assert.ok(records.some((record) => record.source === "commons"));
});

test("romantic wash records include prompt captions, artist, and provenance", () => {
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
    assert.equal(record.category, "romantic wash");
    assert.equal(record.is_curated, true);
    assert.ok(record.caption_long.length >= 260, `${record.id} long caption is too short`);
    assert.ok(record.caption_short.length >= 25 && record.caption_short.length <= 180);
    assert.doesNotMatch(record.caption_long, catalogLanguage, record.id);
    assert.doesNotMatch(record.caption_long, labeledFields, record.id);
    assert.ok(record.provenance?.source);
  }
});

test("the romantic wash tray includes the requested Turner, Sargent, and Fragonard veins", () => {
  const ids = new Set(records.map((record) => record.id));
  assert.ok(ids.has("met:12119"));
  assert.ok(ids.has("met:12098"));
  assert.ok(ids.has("met:337499"));
  assert.ok(ids.has("met:459371"));
  assert.ok(ids.has("commons:22213523"));
  assert.ok(ids.has("commons:43119644"));
  assert.ok(records.some((record) => /turner/i.test(record.artist)));
  assert.ok(records.some((record) => /sargent/i.test(record.artist)));
  assert.ok(records.some((record) => /fragonard/i.test(record.artist)));
  assert.ok(records.some((record) => /homer/i.test(record.artist)));
});

test("romantic wash genre language boosts the curated tray over unrelated seeds", () => {
  const ranked = rankSeedRecords(
    "soft watercolor garden mist",
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
    "romantic-wash",
  );
  assert.equal(ranked[0].id, records[0].id);
});

test("romantic wash genre queries stay source-aware", () => {
  const commons = genreSearchQuery("", "romantic-wash", "commons");
  const met = genreSearchQuery("", "romantic-wash", "met");
  assert.match(commons, /romantic wash/);
  assert.match(commons, /watercolor|wash|mist/);
  assert.equal(met, "romantic wash");
});

test("the library opens on a romantic wash tray and stays unlinked from the studio", async () => {
  const [library, studio] = await Promise.all([
    readFile(new URL("../compositions/library.html", import.meta.url), "utf8"),
    readFile(new URL("../compositions/index.html", import.meta.url), "utf8"),
  ]);
  assert.match(library, /data-genre="romantic-wash"/);
  assert.match(library, /romantic wash/);
  assert.match(library, /curated tray/);
  assert.doesNotMatch(studio, /href=["'][^"']*library\.html/);
});
