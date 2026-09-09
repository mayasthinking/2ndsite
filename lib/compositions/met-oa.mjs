const MET_API = "https://collectionapi.metmuseum.org/public/collection/v1";

export const MET_OPEN_ACCESS_URL =
  "https://www.metmuseum.org/about-the-met/policies-and-documents/open-access";
export const MET_PAGE_SIZE = 120;
export const MET_CONCURRENCY = 16;
export const MET_BROWSE_QUERY = "*";

function text(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function materialDirection(medium = "") {
  const value = medium.toLowerCase();
  if (value.includes("watercolor")) return "use translucent washes and soft-edged color";
  if (value.includes("oil")) return "use layered painterly texture and visible brushwork";
  if (value.includes("ink")) return "use expressive ink lines and varied dark marks";
  if (value.includes("woodblock") || value.includes("woodcut")) {
    return "use flat color shapes and crisp carved lines";
  }
  if (value.includes("photograph")) return "keep the light and surfaces photographically observed";
  return "";
}

export function metSearchUrl(search = MET_BROWSE_QUERY) {
  return `${MET_API}/search?hasImages=true&isPublicDomain=true&q=${encodeURIComponent(search.trim() || MET_BROWSE_QUERY)}`;
}

export function metObjectUrl(objectId) {
  return `${MET_API}/objects/${encodeURIComponent(objectId)}`;
}

export function normalizeMetObject(object, retrievedDate = new Date().toISOString()) {
  const imageUrl = text(object?.primaryImage);
  const thumbnailUrl = text(object?.primaryImageSmall) || imageUrl;
  if (!object?.objectID || object.isPublicDomain !== true || !imageUrl) return null;

  const title = text(object.title) || `Met object ${object.objectID}`;
  const artist = text(object.artistDisplayName) || text(object.culture) || "unknown";
  const credit = text(object.creditLine) || text(object.department) || "The Metropolitan Museum of Art";
  const tags = (object.tags || []).map((tag) => text(tag?.term)).filter(Boolean);
  const material = materialDirection(text(object.medium));
  const promptParts = [
    `create a scene of ${title}`,
    tags.length ? `include ${tags.slice(0, 6).join(", ").toLowerCase()}` : "",
    material,
  ].filter(Boolean);
  const captionLong = `${promptParts.join("; ")}.`;
  const captionShort = `${[title, ...tags.slice(0, 3)].filter(Boolean).join(", ")}.`;

  return {
    id: `met:${object.objectID}`,
    source: "met open access",
    sourceUrl:
      text(object.objectURL) ||
      `https://www.metmuseum.org/art/collection/search/${object.objectID}`,
    title,
    artist,
    credit,
    license: "public domain",
    licenseUrl: MET_OPEN_ACCESS_URL,
    licenseNote: "The Met Open Access API marks this object as public domain.",
    imageUrl,
    thumbnailUrl,
    width: null,
    height: null,
    category: text(object.classification) || text(object.objectName) || text(object.department),
    caption: captionLong,
    captionLong,
    captionShort,
    retrievedAt: retrievedDate,
    provenance: {
      source: "The Metropolitan Museum of Art Open Access",
      objectId: object.objectID,
      accessionNumber: text(object.accessionNumber) || null,
      repository: text(object.repository) || "Metropolitan Museum of Art, New York, NY",
      department: text(object.department) || null,
      classification: text(object.classification) || null,
      objectName: text(object.objectName) || null,
      objectDate: text(object.objectDate) || null,
      culture: text(object.culture) || null,
      medium: text(object.medium) || null,
      creditLine: text(object.creditLine) || null,
      tags,
    },
  };
}

export function normalizeMetObjects(objects, retrievedDate) {
  return objects.map((object) => normalizeMetObject(object, retrievedDate)).filter(Boolean);
}
