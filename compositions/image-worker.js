import {
  CELLS,
  PREVIEW_CELLS,
  averageHex,
  blobToDataUrl,
  brushPreviewProfile,
  planFromPixels,
  rasterContain,
  splitSubjectFromImageData,
} from "./photo-wash-plan.js?v=8";

async function sourceFrom(payload, resizeTo = 0) {
  const opts =
    resizeTo > 0
      ? { resizeWidth: resizeTo, resizeHeight: resizeTo, resizeQuality: "low" }
      : undefined;
  if (payload.bitmap) return payload.bitmap;
  if (payload.file) {
    try {
      return opts ? await createImageBitmap(payload.file, opts) : await createImageBitmap(payload.file);
    } catch {
      return createImageBitmap(payload.file);
    }
  }
  if (payload.photo) {
    const res = await fetch(payload.photo);
    const blob = await res.blob();
    try {
      return opts ? await createImageBitmap(blob, opts) : await createImageBitmap(blob);
    } catch {
      return createImageBitmap(blob);
    }
  }
  throw new Error("no image to work with");
}

async function rasterize(payload) {
  const max = Number(payload.max) || 1400;
  const quality = Number(payload.quality) || 0.86;
  const bitmap = await sourceFrom(payload, Math.min(max, 1024));
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
  const hex = averageHex(bitmap);
  bitmap.close?.();
  if (payload.asBlob) return { blob, hex };
  return { dataUrl: await blobToDataUrl(blob), hex, blob };
}

async function planWash(payload) {
  const bitmap = await sourceFrom(payload);
  const data = rasterContain(bitmap, CELLS);
  const marks = planFromPixels(data, CELLS, payload.size || 720, payload.seed, payload.effects);
  bitmap.close?.();
  return { marks, brushName: payload.effects?.brushType || "HB" };
}

let previewPhoto = null;
let previewPixels = null;
let previewCells = 0;

async function previewSource(photo, cells) {
  if (photo === previewPhoto && previewPixels && previewCells === cells) return previewPixels;
  // Decode already-resized — never pull full camera resolution into the wash planner.
  const bitmap = await sourceFrom({ photo }, Math.max(cells * 2, 96));
  const pixels = rasterContain(bitmap, cells);
  bitmap.close?.();
  previewPhoto = photo;
  previewPixels = pixels;
  previewCells = cells;
  return pixels;
}

function fillPolygon(ctx, points) {
  if (!points?.length) return;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
  ctx.fill();
}

async function renderWash(payload) {
  const preview = Boolean(payload.preview);
  const size = payload.size || (preview ? 280 : 720);
  const cells = preview ? PREVIEW_CELLS : CELLS;
  const pixels = await previewSource(payload.photo, cells);
  const effects = payload.effects || {};
  const brushType = effects.brushType || "HB";
  const profile = brushPreviewProfile(brushType);
  const marks = planFromPixels(pixels, cells, size, payload.seed, effects, {
    fast: preview,
    maxDabs: preview ? 90 : 0,
    skipLines: preview,
    lineScale: preview ? 0.45 : 1,
  });
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.fillStyle = "#f3eee4";
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = "multiply";

  const baseBlur = Math.max(0.05, (size / 720) * profile.blur);
  const skipBlur = preview || size <= 400;

  for (const mark of marks) {
    if (mark.kind !== "poly") continue;
    ctx.fillStyle = mark.hex;
    const alpha = Math.min(0.92, (mark.opacity / 255) * profile.fillAlpha);
    if (profile.stipple || mark.stipple) {
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const [x, y] of mark.pts) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
      const area = Math.max(8, (maxX - minX) * (maxY - minY));
      const dots = Math.min(preview ? 18 : 90, Math.max(6, Math.round(area / (preview ? 420 : 180))));
      ctx.globalAlpha = alpha;
      ctx.filter = "none";
      for (let i = 0; i < dots; i++) {
        const px = minX + Math.random() * (maxX - minX);
        const py = minY + Math.random() * (maxY - minY);
        const r = 0.6 + Math.random() * Math.max(1.1, size / 300);
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      }
      continue;
    }
    ctx.globalAlpha = alpha;
    ctx.filter = skipBlur || profile.hardEdge ? "none" : `blur(${baseBlur}px)`;
    fillPolygon(ctx, mark.pts);
    if (!preview && profile.secondPass > 0.05) {
      ctx.filter = profile.hardEdge ? "none" : `blur(${Math.max(0.05, baseBlur * 0.4)}px)`;
      ctx.globalAlpha *= profile.secondPass;
      fillPolygon(ctx, mark.pts);
    }
  }

  if (!preview) {
    ctx.filter = "none";
    ctx.lineCap = profile.lineCap;
    for (const mark of marks) {
      if (mark.kind !== "line") continue;
      ctx.strokeStyle = mark.hex;
      ctx.globalAlpha = profile.lineAlpha;
      ctx.lineWidth = Math.max(0.45, mark.weight * profile.lineScale);
      ctx.beginPath();
      ctx.moveTo(mark.x1, mark.y1);
      ctx.lineTo(mark.x2, mark.y2);
      ctx.stroke();
    }
  }

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";

  const type = preview ? "image/jpeg" : "image/png";
  const quality = preview ? 0.72 : undefined;
  const blob = await canvas.convertToBlob(quality == null ? { type } : { type, quality });
  if (payload.asBlob || preview) return { blob };
  return { dataUrl: await blobToDataUrl(blob), blob };
}

async function encodePng(payload) {
  const bitmap = await sourceFrom(payload);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext("2d").drawImage(bitmap, 0, 0);
  const blob = await canvas.convertToBlob({ type: "image/png" });
  bitmap.close?.();
  return { dataUrl: await blobToDataUrl(blob) };
}

async function canvasUrl(pixels, width, height) {
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext("2d").putImageData(new ImageData(pixels, width, height), 0, 0);
  return blobToDataUrl(await canvas.convertToBlob({ type: "image/png" }));
}

async function splitSubject(payload) {
  const bitmap = await sourceFrom(payload);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  const split = splitSubjectFromImageData(ctx.getImageData(0, 0, bitmap.width, bitmap.height));
  bitmap.close?.();
  const [baseUrl, liftUrl] = await Promise.all([
    canvasUrl(split.base, split.width, split.height),
    canvasUrl(split.lift, split.width, split.height),
  ]);
  return { baseUrl, liftUrl, hits: split.hits, hitsSize: split.hitsSize };
}

const jobs = { rasterize, planWash, renderWash, encodePng, splitSubject };

self.onmessage = async (event) => {
  const { id, type } = event.data || {};
  const job = jobs[type];
  if (!job) {
    self.postMessage({ id, ok: false, error: "unknown image job" });
    return;
  }
  try {
    const result = await job(event.data);
    self.postMessage({ id, ok: true, result });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err.message || err) });
  }
};
