import {
  MET_CONCURRENCY,
  MET_PAGE_SIZE,
  metObjectUrl,
  metSearchUrl,
  normalizeMetObjects,
  rankMetItems,
} from "../lib/compositions/met.mjs";
const REQUEST_HEADERS = {
  Accept: "application/json",
  "User-Agent": "mayasthinking-compositions/1.0 (private open-access image curator)",
};

async function fetchObjectBatch(objectIds) {
  const objects = [];
  for (let index = 0; index < objectIds.length; index += MET_CONCURRENCY) {
    const batch = objectIds.slice(index, index + MET_CONCURRENCY);
    const responses = await Promise.allSettled(
      batch.map(async (objectId) => {
        const response = await fetch(metObjectUrl(objectId), { headers: REQUEST_HEADERS });
        if (!response.ok) throw new Error(`met object ${objectId} returned ${response.status}`);
        return response.json();
      }),
    );
    objects.push(
      ...responses
        .filter((result) => result.status === "fulfilled")
        .map((result) => result.value),
    );
  }
  return objects;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "method not allowed" });
    return;
  }

  const search = String(req.query?.q || "").trim();
  const genre = String(req.query?.genre || "").trim();
  const keyword = String(req.query?.keyword || "").trim();
  const offset = Math.max(Number.parseInt(req.query?.continue, 10) || 0, 0);
  if (!search) {
    res.status(400).json({ error: "add something to search for" });
    return;
  }

  try {
    const searchResponse = await fetch(metSearchUrl(search), { headers: REQUEST_HEADERS });
    if (!searchResponse.ok) throw new Error(`met search returned ${searchResponse.status}`);

    const objectIds = (await searchResponse.json()).objectIDs || [];
    const pageIds = objectIds.slice(offset, offset + MET_PAGE_SIZE);
    const objects = await fetchObjectBatch(pageIds);

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=900");
    res.status(200).json({
      items: rankMetItems(normalizeMetObjects(objects), genre, keyword),
      continue: offset + MET_PAGE_SIZE < objectIds.length ? offset + MET_PAGE_SIZE : null,
    });
  } catch (error) {
    console.error("met search failed", error);
    res.status(502).json({ error: "the met is quiet right now. try again in a moment." });
  }
}
