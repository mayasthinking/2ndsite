import { CELLS, planFromPixels, rasterContain } from "./photo-wash-plan.js?v=8";
import { imageWork } from "./image-work.js?v=9";

let cachedSrc = "";
let cachedImg = null;

function loadImage(src) {
  if (cachedSrc === src && cachedImg) return Promise.resolve(cachedImg);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      cachedSrc = src;
      cachedImg = img;
      resolve(img);
    };
    img.onerror = () => reject(new Error("the photograph would not open."));
    img.src = src;
  });
}

function paintFromMarks(marks, brushName) {
  return function paint() {
    const brush = window.brush;
    if (!brush) throw new Error("p5.brush failed to load");
    window.__photoPaint = true;
    try {
      brush.noStroke();
      for (const mark of marks) {
        if (mark.kind !== "poly") continue;
        brush.fill(mark.hex, mark.opacity);
        brush.fillBleed(mark.bleed);
        brush.fillTexture(mark.texture, mark.border);
        brush.polygon(mark.pts);
      }
      for (const mark of marks) {
        if (mark.kind !== "line") continue;
        brush.set(brushName, mark.hex, mark.weight);
        brush.line(mark.x1, mark.y1, mark.x2, mark.y2);
      }
    } finally {
      window.__photoPaint = false;
    }
  };
}

async function planLocally({ photo, seed, size, effects }) {
  const img = await loadImage(photo);
  const data = rasterContain(img, CELLS);
  return {
    marks: planFromPixels(data, CELLS, size, seed, effects),
    brushName: effects?.brushType || "HB",
  };
}

export async function buildPhotoPaint({ photo, seed = 1, size = 720, effects = null }) {
  let planned;
  try {
    planned = await imageWork("planWash", { photo, seed, size, effects });
  } catch {
    planned = await planLocally({ photo, seed, size, effects });
  }
  return paintFromMarks(planned.marks, planned.brushName || effects?.brushType || "HB");
}

window.__buildPhotoPaint = buildPhotoPaint;
