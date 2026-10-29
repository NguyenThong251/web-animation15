// Animated favicon: the loader's 40-frame glyph cycle rendered to 64×64 canvases (pink glyph on the
// indigo tile of public/favicon.svg), then link[rel=icon] cycles through them every 80 ms (3.2 s loop).
// The static SVG stays in place under reduced motion, before the frames are ready, and on any error.
import { glyphFrames, frameFont, loadCycleFonts } from "./glyph-cycle.js";

const SIZE = 64;
const INTERVAL_MS = 80;
const PINK = "#ff9cef";
const INDIGO = "#5b74eb";

function renderFrames() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");

  return glyphFrames().map((f) => {
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = INDIGO;
    ctx.beginPath();
    ctx.roundRect(0, 0, SIZE, SIZE, 12);
    ctx.fill();

    // fit the ink box (stacked marks included) inside 52px, then centre it optically
    let px = 48;
    ctx.font = frameFont(f, px);
    let m = ctx.measureText(f.text);
    const inkH = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
    const inkW = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
    const fit = Math.min(1, 52 / Math.max(inkH, inkW, 1));
    if (fit < 1) {
      px = Math.floor(px * fit);
      ctx.font = frameFont(f, px);
      m = ctx.measureText(f.text);
    }
    const x = SIZE / 2 - (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2;
    const y = SIZE / 2 + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;

    if (f.stroke) {
      // outline variant, like .stroke-text: 40% pink fill + pink stroke
      ctx.fillStyle = "rgba(255, 156, 239, 0.4)";
      ctx.fillText(f.text, x, y);
      ctx.lineWidth = 2;
      ctx.strokeStyle = PINK;
      ctx.lineJoin = "round";
      ctx.strokeText(f.text, x, y);
    } else {
      ctx.fillStyle = PINK;
      ctx.fillText(f.text, x, y);
    }
    return canvas.toDataURL("image/png");
  });
}

export function init(app) {
  const link = document.querySelector('link[rel~="icon"]');
  if (!link || link.dataset.animated || app.mq.rm.matches) return;
  link.dataset.animated = "true";

  const original = { href: link.getAttribute("href"), type: link.getAttribute("type") };
  let timer = 0;

  const restore = () => {
    clearInterval(timer);
    timer = 0;
    link.setAttribute("href", original.href);
    if (original.type) link.setAttribute("type", original.type);
  };

  loadCycleFonts(3000)
    .then(() => {
      if (app.mq.rm.matches) return;
      const frames = renderFrames();
      let i = 0;
      link.setAttribute("type", "image/png");
      timer = setInterval(() => {
        link.href = frames[i];
        i = (i + 1) % frames.length;
      }, INTERVAL_MS);
    })
    .catch(restore);

  // a reduced-motion switch mid-session stops the loop
  app.mq.rm.addEventListener("change", (e) => e.matches && restore());
  addEventListener("pagehide", restore);
}
