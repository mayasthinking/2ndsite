const COMMONS_API = "https://commons.wikimedia.org/w/api.php";

export const COMMONS_BATCH_SIZE = 50;
export const COMMONS_PAGE_BATCHES = 4;
export const COMMONS_PAGE_SIZE = COMMONS_BATCH_SIZE * COMMONS_PAGE_BATCHES;

export function commonsPageOffsets(offset = 0) {
  const start = Math.max(Number(offset) || 0, 0);
  return Array.from(
    { length: COMMONS_PAGE_BATCHES },
    (_, index) => start + index * COMMONS_BATCH_SIZE,
  );
}

const ENTITY_MAP = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

export function plainText(value = "") {
  return String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, code) => {
      if (code[0] === "#") {
        const radix = code[1]?.toLowerCase() === "x" ? 16 : 10;
        const digits = radix === 16 ? code.slice(2) : code.slice(1);
        return String.fromCodePoint(Number.parseInt(digits, radix));
      }
      return ENTITY_MAP[code.toLowerCase()] ?? entity;
    })
    .replace(/\s+/g, " ")
    .trim();
}

function creativePrompt(description, title) {
  const scene = plainText(description);
  if (!scene) return `create a scene inspired by ${title}.`;
  const lowered = scene[0] ? `${scene[0].toLowerCase()}${scene.slice(1)}` : scene;
  return `create ${lowered.replace(/[.!?]+$/, "")}.`;
}

export function classifyLicense(metadata = {}) {
  const shortName = plainText(metadata.LicenseShortName?.value);
  const usage = plainText(metadata.UsageTerms?.value);
  const licenseUrl = metadata.LicenseUrl?.value || "";
  const statedTerms = `${shortName} ${usage}`.toLowerCase();
  const combined = `${statedTerms} ${licenseUrl}`.toLowerCase();

  if (/\bcc[\s-]?0\b|creative commons zero|public domain dedication/.test(combined)) {
    return {
      kind: "cc0",
      label: "cc0",
      url: licenseUrl || "https://creativecommons.org/publicdomain/zero/1.0/",
    };
  }

  if (/\bcc[\s-]?(?:by|nc|nd|sa)\b|creative commons attribution/.test(statedTerms)) {
    return null;
  }

  if (
    /\bpublic domain\b|creativecommons\.org\/publicdomain\/mark|(?:^|\s)pd(?:[-\s]|$)/.test(combined)
  ) {
    return {
      kind: "public-domain",
      label: "public domain",
      url: licenseUrl || "https://creativecommons.org/publicdomain/mark/1.0/",
    };
  }

  return null;
}

export function normalizeCommonsPage(page, retrievedDate = new Date().toISOString()) {
  const image = page?.imageinfo?.[0];
  const metadata = image?.extmetadata || {};
  const license = classifyLicense(metadata);
  if (!image?.url || !license) return null;

  const title = plainText(metadata.ObjectName?.value) || plainText(page.title).replace(/^File:/, "");
  const artist = plainText(metadata.Artist?.value);
  const credit = plainText(metadata.Credit?.value);
  const description = plainText(metadata.ImageDescription?.value);
  const captionLong = creativePrompt(description, title);

  return {
    id: `commons:${page.pageid}`,
    source: "wikimedia commons",
    sourceUrl: page.fullurl || `https://commons.wikimedia.org/?curid=${page.pageid}`,
    title,
    artist: artist || credit || "unknown",
    credit: credit || artist || "wikimedia commons contributor",
    license: license.label,
    licenseUrl: license.url,
    imageUrl: image.url,
    thumbnailUrl: image.thumburl || image.url,
    width: image.width || null,
    height: image.height || null,
    caption: captionLong,
    captionLong,
    captionShort: title,
    retrievedAt: retrievedDate,
  };
}

export function normalizeCommonsResponse(payload, licenseFilter = "public-domain", retrievedDate) {
  const pages = Object.values(payload?.query?.pages || {});
  const items = pages
    .map((page) => normalizeCommonsPage(page, retrievedDate))
    .filter(Boolean)
    .filter((item) => licenseFilter !== "cc0" || item.license === "cc0");

  return {
    items,
    continue: payload?.continue?.gsroffset ?? null,
  };
}

export function commonsSearchUrl(search, offset = 0, limit = COMMONS_BATCH_SIZE) {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    origin: "*",
    generator: "search",
    gsrsearch: `${search.trim()} filetype:bitmap`,
    gsrnamespace: "6",
    gsrlimit: String(Math.min(Math.max(limit, 1), COMMONS_BATCH_SIZE)),
    gsrprop: "size|wordcount|timestamp",
    prop: "imageinfo|info",
    iiprop: "url|size|extmetadata",
    iiurlwidth: "720",
    inprop: "url",
  });
  if (offset) params.set("gsroffset", String(offset));
  return `${COMMONS_API}?${params}`;
}

export function toDatasetRecord(item) {
  const source =
    item.source || (String(item.id).startsWith("met:") ? "met open access" : "wikimedia commons");
  return {
    id: item.id,
    source,
    source_url: item.sourceUrl,
    image_url: item.imageUrl,
    thumbnail_url: item.thumbnailUrl,
    title: item.title,
    artist: item.artist || item.credit || "",
    credit: item.credit || item.artist,
    license: item.license,
    license_url: item.licenseUrl,
    license_note:
      item.licenseNote ||
      (source === "wikimedia commons"
        ? "License metadata supplied by Wikimedia Commons."
        : null),
    retrieved_at: item.retrievedAt,
    provenance: item.provenance || {
      source: "Wikimedia Commons",
      pageId: Number.parseInt(String(item.id).replace("commons:", ""), 10) || null,
    },
    ocr_text: item.ocrText ?? null,
    ocr_status: item.ocrStatus || "not-run",
    caption_long: item.captionLong || item.caption || item.title,
    caption_short: item.captionShort || item.title,
    width: item.width ?? null,
    height: item.height ?? null,
    category: item.category || "uncategorized",
  };
}
