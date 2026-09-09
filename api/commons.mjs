import {
  COMMONS_BATCH_SIZE,
  COMMONS_PAGE_SIZE,
  commonsPageOffsets,
  commonsSearchUrl,
  normalizeCommonsResponse,
} from "../lib/compositions/commons.mjs";

const ALLOWED_FILTERS = new Set(["public-domain", "cc0"]);

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "method not allowed" });
    return;
  }

  const search = String(req.query?.q || "").trim();
  const license = ALLOWED_FILTERS.has(req.query?.license) ? req.query.license : "public-domain";
  const offset = Number.parseInt(req.query?.continue, 10) || 0;

  if (!search) {
    res.status(400).json({ error: "add something to search for" });
    return;
  }

  try {
    const responses = await Promise.all(
      commonsPageOffsets(offset).map((batchOffset) =>
        fetch(commonsSearchUrl(search, batchOffset, COMMONS_BATCH_SIZE), {
          headers: {
            Accept: "application/json",
            "User-Agent": "mayasthinking-compositions/1.0 (open access image curator)",
          },
        }),
      ),
    );
    if (responses.some((response) => !response.ok)) {
      throw new Error(`commons returned ${responses.find((response) => !response.ok).status}`);
    }
    const batches = await Promise.all(
      responses.map(async (response) =>
        normalizeCommonsResponse(await response.json(), license),
      ),
    );
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=900");
    res.status(200).json({
      items: batches.flatMap((batch) => batch.items),
      continue: batches.some((batch) => batch.continue !== null) ? offset + COMMONS_PAGE_SIZE : null,
    });
  } catch (error) {
    console.error("commons search failed", error);
    res.status(502).json({ error: "commons is quiet right now. try again in a moment." });
  }
}
