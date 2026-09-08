import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { parseJsonl } from "../scripts/caption-compositions.mjs";
import {
  identityScore,
  matchKind,
  rankSeedRecords,
  semanticText,
  sourceSearchQuery,
} from "../lib/compositions/semantic-search.mjs";

const romantic = parseJsonl(
  await readFile(new URL("../compositions/data/seed/romantic-wash-seed.jsonl", import.meta.url), "utf8"),
);
const impressionism = parseJsonl(
  await readFile(new URL("../compositions/data/seed/impressionism-seed.jsonl", import.meta.url), "utf8"),
);
const catalog = [...romantic, ...impressionism];

function idsFor(query) {
  return rankSeedRecords(query, catalog, {}, null, "romantic-wash")
    .filter((record) => record.semanticScore > 0.28 || identityScore(query, record) >= 0.5)
    .map((record) => record.id);
}

test("artist queries rank that painter above other curated trays", () => {
  const turner = idsFor("Turner");
  const monet = idsFor("Monet");
  assert.ok(turner.length >= 3);
  assert.ok(turner.every((id) => catalog.find((record) => record.id === id)?.artist.includes("Turner")));
  assert.equal(catalog.find((record) => record.id === monet[0])?.artist, "Claude Monet");
  assert.ok(monet.every((id) => /monet/i.test(catalog.find((record) => record.id === id)?.artist || "")));
  assert.ok(!turner.includes("commons:23750619"));
  assert.ok(!monet.includes("commons:22213523"));
});

test("title fragments find the named painting", () => {
  const crichton = rankSeedRecords("Crichton", catalog)[0];
  const buttermere = rankSeedRecords("Buttermere", catalog)[0];
  assert.equal(crichton.id, "commons:22213523");
  assert.match(crichton.title, /Crichton Castle/);
  assert.equal(buttermere.id, "commons:91870920");
  assert.match(buttermere.title, /Buttermere Lake/);
  assert.equal(matchKind("Crichton", crichton), "title");
  assert.equal(matchKind("Turner", crichton), "artist");
});

test("identity scoring reads artist and title, not only captions", () => {
  const turner = romantic.find((record) => /turner/i.test(record.artist));
  const monet = impressionism.find((record) => /monet/i.test(record.artist));
  assert.equal(identityScore("Turner", turner), 1);
  assert.equal(identityScore("Monet", monet), 1);
  assert.ok(identityScore("Turner", monet) < 0.5);
  assert.match(semanticText(monet), /Claude Monet/);
});

test("typed queries stay literal for Commons and Met instead of appending genre wash terms", () => {
  assert.equal(sourceSearchQuery("Monet", "romantic-wash", "commons"), "Monet");
  assert.equal(sourceSearchQuery("Turner", "romantic-wash", "met"), "Turner");
  assert.equal(sourceSearchQuery("Crichton Castle", "impressionism", "semantic"), "Crichton Castle");
  assert.match(sourceSearchQuery("", "romantic-wash", "commons"), /romantic wash/);
  assert.equal(sourceSearchQuery("", "romantic-wash", "met"), "romantic wash");
});

test("library copy and search path cover artist, title, and meaning", async () => {
  const [html, js] = await Promise.all([
    readFile(new URL("../compositions/library.html", import.meta.url), "utf8"),
    readFile(new URL("../compositions/library.js", import.meta.url), "utf8"),
  ]);
  assert.match(html, /search by artist, title, or meaning/);
  assert.match(html, /Turner, Crichton Castle/);
  assert.match(html, /artist names, painting titles, and detailed captions/);
  assert.doesNotMatch(html, /search by meaning/);
  assert.match(js, /sourceSearchQuery/);
  assert.match(js, /identityScore/);
  assert.match(js, /currentQuery \? \[\] : curatedShelfItems/);
  assert.match(js, /identityScore\(query, record\) >= 0\.5/);
  assert.doesNotMatch(js, /ranking captions by meaning/);
});
