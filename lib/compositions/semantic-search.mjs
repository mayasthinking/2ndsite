export const SEMANTIC_MODEL = "onnx-community/all-MiniLM-L6-v2-ONNX";
export const SEMANTIC_MODEL_DTYPE = "q4";

export const GENRES = [
  {
    id: "romantic-wash",
    label: "romantic wash",
    terms: ["watercolor", "wash", "mist", "airy", "garden", "soft light"],
  },
  {
    id: "impressionism",
    label: "impressionism",
    terms: ["impressionist", "plein air", "broken color", "modern painting"],
  },
  {
    id: "still-life",
    label: "still life",
    terms: ["still-life", "fruit", "flowers", "tabletop", "objects"],
  },
  {
    id: "landscape",
    label: "landscape",
    terms: ["scenery", "countryside", "seascape", "mountain", "plein air"],
  },
  {
    id: "portrait",
    label: "portrait",
    terms: ["portraiture", "sitter", "face", "figure", "bust"],
  },
  {
    id: "cubism",
    label: "cubism",
    terms: ["cubist", "geometric", "fragmented", "modernism"],
  },
  {
    id: "ukiyo-e",
    label: "ukiyo-e",
    terms: ["ukiyo e", "Japanese woodblock print", "Edo period", "woodcut"],
  },
  {
    id: "baroque",
    label: "baroque",
    terms: ["dramatic light", "chiaroscuro", "seventeenth century", "old master"],
  },
  {
    id: "abstract",
    label: "abstract",
    terms: ["abstraction", "nonrepresentational", "geometric", "color field"],
  },
];

const GENRE_BY_ID = new Map(GENRES.map((genre) => [genre.id, genre]));

const CONCEPTS = [
  ["interior", "room", "kitchen", "bedroom", "parlor", "dining", "domestic", "indoors"],
  ["dusk", "twilight", "evening", "sunset", "nightfall", "dim", "shadow", "dark"],
  ["lonely", "solitary", "alone", "empty", "quiet", "still", "unoccupied", "isolated"],
  ["botanical", "plant", "flower", "rose", "fern", "leaf", "leaves", "flora", "herbarium"],
  ["fungus", "fungi", "mushroom", "toadstool", "mycology"],
  ["ocean", "sea", "wave", "coast", "shore", "marine", "algae"],
  [
    "food",
    "fruit",
    "apple",
    "citrus",
    "lemon",
    "lime",
    "orange",
    "meal",
    "table",
    "luncheon",
    "still-life",
    "stilllife",
  ],
  ["mountain", "peak", "alpine", "valley", "cliff", "landscape", "wilderness"],
  ["portrait", "face", "figure", "person", "woman", "man", "child", "sitter"],
  ["drawing", "sketch", "study", "charcoal", "graphite", "ink", "line"],
  ["sign", "signage", "lettering", "words", "text", "typography", "storefront", "poster"],
  ["pattern", "ornament", "textile", "fabric", "geometric", "repeat", "decorative", "motif"],
  ["historical", "archive", "vintage", "old", "documentary", "photograph", "monochrome"],
  ["warm", "amber", "golden", "ochre", "orange", "candlelit"],
  ["cool", "blue", "green", "gray", "grey", "misty"],
  ["watercolor", "wash", "mist", "airy", "romantic", "translucent"],
];

const TOKEN_TO_CONCEPT = new Map(
  CONCEPTS.flatMap((terms, concept) => terms.map((term) => [term, concept])),
);

export function tokenize(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/\bstill[\s_-]+life\b/g, "still-life")
    .replace(/\bukiyo[\s_-]+e\b/g, "ukiyo-e")
    .replace(/[^\p{L}\p{N}-]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

function localSemanticVector(value) {
  const vector = new Float32Array(CONCEPTS.length);
  for (const token of tokenize(value)) {
    const concept = TOKEN_TO_CONCEPT.get(token);
    if (concept !== undefined) vector[concept] += 1;
  }
  return vector;
}

export function cosineSimilarity(left, right) {
  if (!left?.length || left.length !== right?.length) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] ** 2;
    rightNorm += right[index] ** 2;
  }
  return leftNorm && rightNorm ? dot / Math.sqrt(leftNorm * rightNorm) : 0;
}

function normalizeSearchText(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function recordArtistText(record) {
  return `${record.artist || ""} ${record.credit || ""}`;
}

function recordTitleText(record) {
  return record.title || "";
}

function recordCaptionText(record) {
  return [
    record.caption_long,
    record.caption_short,
    record.caption,
    record.captionLong,
    record.captionShort,
    record.ocr_text,
    record.ocrText,
  ]
    .filter(Boolean)
    .join(" ");
}

function tokenCoverage(query, value) {
  const queryTokens = tokenize(query);
  if (!queryTokens.length) return 0;
  const haystack = ` ${normalizeSearchText(value)} `;
  const hits = queryTokens.filter((token) => haystack.includes(` ${token} `)).length;
  return hits / queryTokens.length;
}

function lexicalScore(query, record) {
  const queryTokens = new Set(tokenize(query));
  if (!queryTokens.size) return 0;
  const textTokens = new Set(
    tokenize(
      `${recordCaptionText(record)} ${recordTitleText(record)} ${recordArtistText(record)}`,
    ),
  );
  let overlap = 0;
  for (const token of queryTokens) overlap += textTokens.has(token) ? 1 : 0;
  return overlap / queryTokens.size;
}

export function identityScore(query, record) {
  const needle = normalizeSearchText(query);
  if (!needle) return 0;
  const artist = normalizeSearchText(recordArtistText(record));
  const title = normalizeSearchText(recordTitleText(record));
  if (artist.includes(needle) || title.includes(needle)) return 1;
  return Math.max(tokenCoverage(query, artist), tokenCoverage(query, title));
}

export function matchKind(query, record) {
  if (identityScore(query, record) < 0.5) return "caption";
  const artistCoverage = Math.max(
    tokenCoverage(query, recordArtistText(record)),
    normalizeSearchText(recordArtistText(record)).includes(normalizeSearchText(query)) ? 1 : 0,
  );
  const titleCoverage = Math.max(
    tokenCoverage(query, recordTitleText(record)),
    normalizeSearchText(recordTitleText(record)).includes(normalizeSearchText(query)) ? 1 : 0,
  );
  if (artistCoverage >= titleCoverage && artistCoverage >= 0.5) return "artist";
  if (titleCoverage >= 0.5) return "title";
  return "caption";
}

export function genreSearchQuery(query, genreId, source = "semantic") {
  const genre = GENRE_BY_ID.get(genreId);
  if (!genre) return query.trim();
  const termLimit = source === "met" ? 0 : source === "commons" ? 4 : genre.terms.length;
  return [query.trim(), genre.label, ...genre.terms.slice(0, termLimit)].filter(Boolean).join(" ");
}

export const OPEN_ACCESS_BROWSE = {
  commons: "filetype:bitmap",
  met: "*",
};

export function sourceSearchQuery(query, genreId, source = "semantic") {
  const trimmed = String(query || "").trim();
  if (trimmed) return trimmed;
  const genreQuery = genreSearchQuery("", genreId, source);
  if (genreQuery) return genreQuery;
  if (source === "commons") return OPEN_ACCESS_BROWSE.commons;
  if (source === "met") return OPEN_ACCESS_BROWSE.met;
  return "";
}

export function genreMatchScore(genreId, value) {
  const genre = GENRE_BY_ID.get(genreId);
  if (!genre) return 0;
  const normalize = (text) =>
    String(text)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  const haystack = ` ${normalize(value)} `;
  const phrases = [genre.label, ...genre.terms];
  const matches = phrases.filter((phrase) =>
    haystack.includes(` ${normalize(phrase)} `),
  ).length;
  return Math.min(matches / 2, 1);
}

export function rankSeedRecords(query, records, index = {}, queryEmbedding = null, genreId = "") {
  const queryConcepts = localSemanticVector(query);
  return records
    .map((record) => {
      const embedding = index[record.id];
      const modelScore =
        queryEmbedding && embedding ? cosineSimilarity(queryEmbedding, embedding) : null;
      const conceptScore = cosineSimilarity(
        queryConcepts,
        localSemanticVector(`${record.caption_long} ${record.caption_short}`),
      );
      const wordsScore = lexicalScore(query, record);
      const catalogScore = identityScore(query, record);
      const genreScore = genreMatchScore(
        genreId,
        `${recordCaptionText(record)} ${recordTitleText(record)} ${record.category || ""} ${recordArtistText(record)}`,
      );
      const meaningScore =
        modelScore === null
          ? conceptScore * 0.82 + wordsScore * 0.18
          : modelScore * 0.88 + conceptScore * 0.08 + wordsScore * 0.04;
      const baseScore = Math.max(catalogScore, meaningScore);
      const score = Math.min(baseScore + genreScore * 0.24, 1);
      return { ...record, semanticScore: score };
    })
    .sort((left, right) => right.semanticScore - left.semanticScore);
}

export function expandVisualQuery(query, maxTerms = 5) {
  const original = tokenize(query);
  const related = [];
  const seen = new Set(original);
  for (const token of original) {
    const concept = TOKEN_TO_CONCEPT.get(token);
    if (concept === undefined) continue;
    for (const term of CONCEPTS[concept]) {
      if (!seen.has(term)) {
        related.push(term);
        seen.add(term);
      }
      if (related.length >= maxTerms) break;
    }
    if (related.length >= maxTerms) break;
  }
  return related.length ? `${query} ${related.join(" ")}` : query;
}

export function semanticText(record) {
  return [
    record.caption_long,
    record.caption_short,
    record.caption,
    record.ocr_text,
    record.ocrText,
    record.title,
    record.artist,
    record.credit,
    record.category,
  ]
    .filter(Boolean)
    .join(" ");
}
