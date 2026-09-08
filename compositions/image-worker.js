import { CELLS, averageHex, blobToDataUrl, planFromPixels, rasterContain, splitSubjectFromImageData } from "./photo-wash-plan.js?v=5";

async function sourceFrom(payload) {
  if (payload.bitmap) return payload.bitmap;
  if (payload.file) return createImageBitmap(payload.file);
  if (payload.photo) {
    const res = await fetch(payload.photo);
    return createImageBitmap(await res.blob());
  }
  throw new Error("no image to work with");
}

async function rasterize(payload) {
  const bitmap = await sourceFrom(payload);
  const max = 1400;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.86 });
  const hex = averageHex(bitmap);
  bitmap.close?.();
  return { dataUrl: await blobToDataUrl(blob), hex };
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

async function previewSource(photo) {
  if (photo === previewPhoto && previewPixels) return previewPixels;
  const bitmap = await sourceFrom({ photo });
  const pixels = rasterContain(bitmap, CELLS);
  bitmap.close?.();
  previewPhoto = photo;
  previewPixels = pixels;
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
  const size = payload.size || 720;
  const pixels = await previewSource(payload.photo);
  const marks = planFromPixels(pixels, CELLS, size, payload.seed, payload.effects);
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#faf9f6";
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = "multiply";

  for (const mark of marks) {
    if (mark.kind !== "poly") continue;
    ctx.fillStyle = mark.hex;
    ctx.globalAlpha = Math.min(0.72, (mark.opacity / 255) * 0.58);
    ctx.filter = `blur(${Math.max(0.7, size / 720)}px)`;
    fillPolygon(ctx, mark.pts);
    ctx.filter = "none";
    ctx.globalAlpha *= 0.42;
    fillPolygon(ctx, mark.pts);
  }

  ctx.filter = "none";
  ctx.lineCap = "round";
  for (const mark of marks) {
    if (mark.kind !== "line") continue;
    ctx.strokeStyle = mark.hex;
    ctx.globalAlpha = 0.48;
    ctx.lineWidth = Math.max(0.7, mark.weight * 1.6);
    ctx.beginPath();
    ctx.moveTo(mark.x1, mark.y1);
    ctx.lineTo(mark.x2, mark.y2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";

  const blob = await canvas.convertToBlob({ type: "image/png" });
  return { dataUrl: await blobToDataUrl(blob) };
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
