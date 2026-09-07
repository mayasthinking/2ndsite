import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  buildLongCaption,
  buildShortCaption,
  captionCandidate,
  parseJsonl,
} from "../scripts/caption-compositions.mjs";
import {
  expandVisualQuery,
  genreSearchQuery,
  rankSeedRecords,
} from "../lib/compositions/semantic-search.mjs";

const seedPath = new URL("../compositions/data/seed/commons-seed.jsonl", import.meta.url);
const indexPath = new URL("../compositions/data/seed/semantic-index.json", import.meta.url);
const records = parseJsonl(await readFile(seedPath, "utf8"));
const index = JSON.parse(await readFile(indexPath, "utf8"));

test("caption helpers produce detailed and short variants", async () => {
  const candidate = {
    id: "commons:1",
    source_url: "https://commons.wikimedia.org/?curid=1",
    title: "Untitled",
    credit: "Example collection",
    license: "public domain",
    composition: "A table sits beneath a small window",
    subject: "An empty kitchen",
    materials: "Oil on rough canvas",
    light: "Dim blue evening light",
    caption_short: "a dim empty kitchen",
  };
  const long = buildLongCaption(candidate);
  assert.match(long, /^An empty kitchen;/);
  assert.match(long, /Dim blue evening light/);
  assert.doesNotMatch(long, /\b(?:Composition|Subject|Materials|Light|Color|Mood):/);
  assert.equal(buildShortCaption(candidate, long), "a dim empty kitchen.");

  const record = await captionCandidate(candidate, { ocr: false });
  assert.equal(record.ocr_status, "not-run");
  assert.equal(record.caption_long, long);

  const withOcr = await captionCandidate(
    { ...candidate, ocr_text: "FRESH CITRUS", ocr_status: "detected" },
    { ocr: false },
  );
  assert.match(withOcr.caption_long, /include visible text reading “FRESH CITRUS”/);
});

test("seed contains 30–50 diverse, unique CC0/public-domain records", () => {
  assert.ok(records.length >= 30 && records.length <= 50);
  assert.ok(new Set(records.map((record) => record.category)).size >= 8);
  assert.equal(new Set(records.map((record) => record.id)).size, records.length);
  assert.equal(new Set(records.map((record) => record.source_url)).size, records.length);
  assert.ok(records.every((record) => ["cc0", "public domain"].includes(record.license)));
});

test("every seed record has provenance, OCR status, and two useful caption lengths", () => {
  const required = [
    "id",
    "source_url",
    "title",
    "credit",
    "license",
    "retrieved_at",
    "ocr_text",
    "caption_long",
    "caption_short",
    "width",
    "height",
  ];
  for (const record of records) {
    for (const field of required) assert.ok(field in record, `${record.id} is missing ${field}`);
    assert.ok(record.caption_long.length >= 260, `${record.id} long caption is too short`);
    assert.ok(record.caption_short.length >= 25 && record.caption_short.length <= 180);
    assert.ok(record.ocr_status);
  }
});

test("seed captions use visual prompt language rather than catalog metadata", () => {
  const catalogLanguage =
    /\b(?:accession(?: number)?|gift of|catalog(?:ue)? no\.|dimensions?:|\d+\s*[×x]\s*\d+\s*(?:in|cm))\b/i;
  const labeledFields = /\b(?:Composition|Subject|Materials and surface|Light|Color|Mood):/;
  for (const record of records) {
    assert.doesNotMatch(record.caption_long, catalogLanguage, record.id);
    assert.doesNotMatch(record.caption_long, labeledFields, record.id);
  }
});

test("semantic index covers every seed record with normalized MiniLM vectors", () => {
  assert.equal(index.model, "onnx-community/all-MiniLM-L6-v2-ONNX");
  assert.equal(index.dimensions, 384);
  assert.deepEqual(Object.keys(index.vectors).sort(), records.map((record) => record.id).sort());
  for (const vector of Object.values(index.vectors)) {
    assert.equal(vector.length, 384);
    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value ** 2, 0));
    assert.ok(Math.abs(norm - 1) < 0.01);
  }
});

test("non-title language finds the intended dim interior through caption semantics", () => {
  const query = "solitary supper after sunset";
  const ranked = rankSeedRecords(query, records);
  assert.equal(ranked[0].id, "commons:98005051");
  assert.ok(!ranked[0].title.toLowerCase().includes("solitary"));
  assert.ok(!ranked[0].title.toLowerCase().includes("sunset"));
});

test("Commons intake expands visual concepts while preserving the original query", () => {
  const expanded = expandVisualQuery("lonely kitchen at dusk");
  assert.match(expanded, /^lonely kitchen at dusk /);
  assert.match(expanded, /interior|room|twilight|evening|solitary/);
});

test("genre searches preserve keywords and add source-appropriate vocabulary", () => {
  const commons = genreSearchQuery("citrus", "still-life", "commons");
  const met = genreSearchQuery("citrus", "still-life", "met");
  assert.match(commons, /^citrus still life /);
  assert.match(commons, /fruit|flowers|tabletop/);
  assert.equal(met, "citrus still life");
  assert.ok(met.split(" ").length < commons.split(" ").length);
});

test("genre selection boosts matching seed captions", () => {
  const candidates = [
    {
      id: "interior",
      title: "Untitled",
      caption_long: "A dim furnished room with a chair.",
      caption_short: "an empty room",
      category: "interior",
    },
    {
      id: "still-life",
      title: "Untitled",
      caption_long: "A still life arranges fruit and flowers on a tabletop.",
      caption_short: "fruit on a table",
      category: "still life",
    },
  ];
  const ranked = rankSeedRecords("citrus", candidates, {}, null, "still-life");
  assert.equal(ranked[0].id, "still-life");
  assert.ok(ranked[0].semanticScore > ranked[1].semanticScore);
});

test("browser semantic search imports the published Transformers.js web bundle", async () => {
  const library = await readFile(
    new URL("../compositions/library.js", import.meta.url),
    "utf8",
  );
  assert.match(library, /@huggingface\/transformers@4\.2\.0\/\+esm/);
  assert.doesNotMatch(library, /dist\/transformers\.web/);
});

test("the public compositions studio does not expose the library route", async () => {
  const studio = await readFile(
    new URL("../compositions/index.html", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(studio, /href=["'][^"']*library\.html/);
  assert.doesNotMatch(studio, /class=["'][^"']*library-entry/);
});

test("romantic wash is a first-class genre with wash vocabulary", () => {
  const commons = genreSearchQuery("garden", "romantic-wash", "commons");
  assert.match(commons, /^garden romantic wash /);
  assert.match(commons, /watercolor|mist|airy/);
});
