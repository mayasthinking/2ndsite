import { imageWork } from "./image-work.js?v=6";

const PAPER = "#f3eee4";

let instance = null;
let instanceSize = 0;
let instanceDensity = 0;
let paintFn = () => {};
let currentSeed = 1;

window.__PAINTING_DONE = false;
window.__PAINTING_ERROR = null;

function bindHelpers(p) {
  window.random = p.random.bind(p);
  window.lerp = p.lerp.bind(p);
  window.map = p.map.bind(p);
  window.constrain = p.constrain.bind(p);
  window.dist = p.dist.bind(p);
  window.noise = p.noise.bind(p);
  window.radians = p.radians.bind(p);
  window.degrees = p.degrees.bind(p);
  window.sin = Math.sin;
  window.cos = Math.cos;
  window.width = p.width;
  window.height = p.height;
  window.PI = Math.PI;
  window.TWO_PI = Math.PI * 2;
}

function compilePaint(code) {
  const lib = window.brush;
  if (!lib) {
    throw new Error("p5.brush failed to load");
  }
  const paint = new Function(
    "brush",
    `${code}\n; return typeof paint === "function" ? paint : null;`
  )(lib);
  if (typeof paint !== "function") {
    throw new Error("paint() was not defined");
  }
  return paint;
}

function canvasEl(canvas) {
  return canvas?.elt || canvas || instance?.canvas?.elt || instance?.canvas || null;
}

function snapshotSync(canvas) {
  const target = canvasEl(canvas);
  if (!target) return null;
  try {
    return target.toDataURL("image/png");
  } catch {
    return null;
  }
}

async function snapshotCanvas(canvas) {
  const target = canvasEl(canvas);
  if (!target) return null;
  try {
    const bitmap = await createImageBitmap(target);
    const { dataUrl } = await imageWork("encodePng", { bitmap }, [bitmap]);
    if (dataUrl) return dataUrl;
  } catch {
    /* fall through */
  }
  return snapshotSync(target);
}

function finish(error, canvas, dataUrl = null) {
  const send = (url, fail) => {
    window.__PAINTING_ERROR = fail || null;
    window.__PAINTING_DONE = true;
    parent.postMessage(
      {
        type: "painted",
        error: fail || null,
        dataUrl: fail ? null : url,
      },
      "*"
    );
  };
  if (error) {
    send(null, error);
    return;
  }
  if (dataUrl) {
    send(dataUrl);
    return;
  }
  snapshotCanvas(canvas).then((url) => {
    send(url, url ? null : "the wash dried invisibly. try re-rendering.");
  });
}

function resetInstance() {
  if (!instance) return;
  try {
    instance.remove();
  } catch {
    /* ignore */
  }
  instance = null;
  instanceSize = 0;
  instanceDensity = 0;
}

function ensureInstance(size, density) {
  if (instance && (instanceSize !== size || instanceDensity !== density)) {
    resetInstance();
  }
  if (instance) return instance;

  instanceSize = size;
  instanceDensity = density;

  const sketch = (p) => {
    if (window.brush?.instance) {
      window.brush.instance(p);
    }

    p.setup = () => {
      const canvas = p.createCanvas(size, size, p.WEBGL);
      canvas.elt.style.display = "block";
      canvas.elt.style.width = `${size}px`;
      canvas.elt.style.height = `${size}px`;
      p.pixelDensity(density);
      p.noLoop();
      p.angleMode(p.DEGREES);
      if (window.brush?.scaleBrushes) {
        window.brush.scaleBrushes(2.8);
      }
      if (typeof window.brush?.load === "function") {
        try {
          window.brush.load();
        } catch {
          // instance() already bound the sketch
        }
      }
      window.__brushReady = Boolean(window.brush);
    };

    p.draw = () => {
      bindHelpers(p);
      p.randomSeed(currentSeed);
      p.noiseSeed(currentSeed);
      p.background(PAPER);
      p.translate(-p.width / 2, -p.height / 2);
      try {
        if (typeof window.__applyStudioBrush === "function") window.__applyStudioBrush();
        paintFn();
        finish(null, p.canvas);
      } catch (err) {
        finish(String(err.message || err));
      }
    };
  };

  instance = new p5(sketch, document.body);
  return instance;
}

window.renderPainting = function renderPainting({
  code,
  photo,
  seed = 1,
  size = 720,
  density = 1,
  effects = null,
}) {
  window.__PAINTING_DONE = false;
  window.__PAINTING_ERROR = null;
  currentSeed = seed;
  if (typeof window.__setBrushEffects === "function") {
    window.__setBrushEffects(effects);
  }

  const photoSrc = photo === true ? window.__pendingPhoto : photo;
  if (photoSrc) {
    const start = Date.now();
    const run = () => {
      const build = window.__buildPhotoPaint;
      if (typeof build !== "function") {
        if (Date.now() - start > 2500) {
          finish("photo wash is not ready.");
          return;
        }
        requestAnimationFrame(run);
        return;
      }
      build({ photo: photoSrc, seed, size, effects })
        .then((fn) => {
          paintFn = fn;
          const same = Boolean(instance) && instanceSize === size && instanceDensity === density;
          const p = ensureInstance(size, density);
          if (same && typeof p.redraw === "function") p.redraw();
        })
        .catch((err) => finish(String(err.message || err)));
    };
    run();
    return;
  }

  try {
    paintFn = compilePaint(code);
  } catch (err) {
    finish(String(err.message || err));
    return;
  }

  const same = Boolean(instance) && instanceSize === size && instanceDensity === density;
  const p = ensureInstance(size, density);
  if (same && typeof p.redraw === "function") {
    p.redraw();
  }
};

window.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "paint") return;
  window.renderPainting(data);
});

window.addEventListener("load", () => {
  parent.postMessage({ type: "ready" }, "*");
});
