const SPRITE_URL = new URL("./sprite.svg", import.meta.url);
const SPRITE_ID = "lucide-local-sprite";

function hideSprite(svg) {
  svg.id = SPRITE_ID;
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
  svg.querySelectorAll("symbol[id]").forEach((symbol) => {
    const name = symbol.id;
    symbol.dataset.lucideName = name;
    symbol.id = `lucide-${name}`;
  });
}

const pending = new WeakMap();

export function loadSprite(doc = document) {
  const existing = doc.getElementById(SPRITE_ID);
  if (existing) return Promise.resolve(existing);

  const inflight = pending.get(doc);
  if (inflight) return inflight;

  const task = (async () => {
    const already = doc.getElementById(SPRITE_ID);
    if (already) return already;

    const response = await fetch(SPRITE_URL);
    if (!response.ok) {
      throw new Error(`Could not load Lucide sprite (${response.status})`);
    }

    const wrapper = doc.createElement("div");
    wrapper.innerHTML = await response.text();
    const svg = wrapper.querySelector("svg");
    if (!svg) {
      throw new Error("Lucide sprite.svg did not contain an <svg>");
    }

    hideSprite(svg);
    doc.body.prepend(svg);
    return svg;
  })();

  pending.set(doc, task);
  return task;
}

export function iconSvg(name, doc = document) {
  const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.classList.add("lucide-icon");
  svg.dataset.lucide = name;

  const use = doc.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#lucide-${name}`);
  svg.append(use);
  return svg;
}

export async function createIcons(root = document) {
  const doc = root.ownerDocument || root;
  await loadSprite(doc);

  root.querySelectorAll("[data-lucide]").forEach((node) => {
    if (node.tagName.toLowerCase() === "svg") return;
    const name = node.getAttribute("data-lucide");
    if (!name) return;

    const svg = iconSvg(name, doc);
    node.getAttribute("class")?.split(/\s+/).filter(Boolean).forEach((cls) => {
      svg.classList.add(cls);
    });
    if (node.hasAttribute("aria-hidden")) {
      svg.setAttribute("aria-hidden", node.getAttribute("aria-hidden"));
    }
    node.replaceWith(svg);
  });
}

createIcons().catch((error) => {
  console.error(error);
});
