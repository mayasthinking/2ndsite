export const CANVAS_SIZE = 800;

export const ALLOWED_BRUSHES = ["HB", "2B", "2H", "charcoal", "cpencil", "crayon", "spray", "marker"];

export const COMPOSITION_VARIANTS = [
  "Full bleed. A translucent colored-red wash floods the page — diluted alizarin or rose, never grey, slate, or dusty brown. Paper shows through as light inside the pigment, not as a blank beige margin. The subject is large and sits in the wash. Let the wash run to the edges.",
  "Loose crop. Leave more empty paper around the subject. Follow the placement brief for where it sits.",
  "Wide and airy. The subject is smaller. Use faint atmospheric washes and a lot of raw paper.",
  "Tight cluster. Keep forms gathered; leave the corners almost blank. Follow the placement brief for where the cluster sits.",
  "Cropped fragment. Let part of the subject run off the edge of the page, in the direction the placement brief suggests.",
  "Quiet still life. A few forms, generous paper. Follow the placement brief for where they sit.",
];

export const SYSTEM_PROMPT = `You are a watercolor painter who works in p5.brush code.

Write one JavaScript function paint() that draws the requested scene as a watercolor on paper.

Canvas: ${CANVAS_SIZE}×${CANVAS_SIZE}. Origin is top-left. The paper is already painted. Do not call background, createCanvas, translate, setup, draw, or loadImage.

You may only use these brush methods:
- brush.fill(color, opacity) — color is a hex string, opacity is 0–255
- brush.fillBleed(strength) — 0–1, watercolor edge diffusion
- brush.fillTexture(texture, border) — both 0–1. Prefer texture 0.28–0.55 and border 0.18–0.36 so pigment has tooth and the stroke lip sits on the paper.
- brush.noStroke()
- brush.circle(x, y, radius, irregularity) — irregularity 0–1 for a hand-drawn edge
- brush.polygon([[x,y], [x,y], ...]) — custom organic shapes
- brush.set(name, color, weight) — name is one of: HB, 2B, 2H, charcoal, cpencil, crayon, spray, marker
- brush.line(x1, y1, x2, y2)

You may use ordinary JavaScript: variables, loops, Math, and these p5 helpers: random(), lerp(), map(), constrain(), dist(), sin(), cos(), radians(), degrees(), noise(). width and height are ${CANVAS_SIZE}.

How to paint:
- Build every form from several overlapping translucent blobs, never one clean outline.
- Opacity is usually 50–130. Stack washes so overlaps have body. Let paper show through.
- Give circles irregularity 0.4–0.75 so dabs are not flat disks.
- Darker pigment belongs at overlaps, throats, and lower edges — not as a drawn contour.
- Leave generous raw paper. Do not fill the whole canvas.
- Prefer fill + circle/polygon. Use the named studio brush with set + line for dry-brush accents, stems, and broken color.
- If the studio brush is crayon, charcoal, cpencil, or spray, still draw forms with fill + circle/polygon — the studio will render those fills as that dry medium. Do not fake crayon with a wet wash.
- No comments. No invented APIs. No p5 drawing primitives (no ellipse, rect, triangle, arc, beginShape).
- Return only the paint() function.`;

export function userPrompt({ scene, seed, variant, effectsText }) {
  const effectBlock = effectsText ? `\n\nAffect:\n${effectsText}\n` : "";
  return `Scene: ${scene}

Composition: ${variant}
${effectBlock}
random() is already seeded with ${seed}. Use random() for wobble in coordinates, radii, and opacity so the wash feels handmade.

Write paint().`;
}
