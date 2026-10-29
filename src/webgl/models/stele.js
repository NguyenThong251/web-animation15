// Doctoral stele on its stone turtle (bia tiến sĩ, 進士題名碑).
// The slab is an extruded arched outline. Its carving (inscription columns, title band,
// two dragons facing a sun disc in the crown, vine border) is drawn on a canvas as a
// height map, blurred, converted to a normal map with Sobel on the CPU, plus a cavity
// albedo so the grooves read under a single light. The turtle shell carries a hexagonal
// scute pattern the same way.
import {
  GeoBag,
  rng,
  clamp,
  roughen,
  whiteMaterial,
  mesh,
  makeCanvas,
  canvasToHeight,
  softBlur,
  heightToNormalRGBA,
  cavityRGBA,
  dataTexture,
  disposeTree,
} from "./util.js";

const HAN_FAMILY = "Noto Serif TC Han";

export const DEFAULT_TITLE = "大寶三年壬戌科進士題名記";

// Phrases built only from characters present in src/data/han-chars.txt (the font subset).
const PHRASES = [
  "賢才者國家之元氣",
  "黎聖宗洪德十五年",
  "文廟國子監",
  "奎文閣",
  "天光井",
  "至聖先師孔子",
  "周公",
  "道德文章",
  "詩書",
  "筆墨紙硯",
  "龍麟龜鳳",
  "進士題名",
  "大成門",
];

/** Default columns: the title column, then the phrases flowed into full-height columns. */
export function defaultSteleLines(columns = 15, perColumn = 20) {
  const out = [DEFAULT_TITLE];
  let col = "";
  let i = 0;
  while (out.length < columns - 1) {
    const phrase = PHRASES[i % PHRASES.length];
    i++;
    for (const ch of phrase) {
      col += ch;
      if (col.length === perColumn) out.push(col), (col = "");
      if (out.length >= columns - 1) break;
    }
    if (col.length && col.length < perColumn) col += "　"; // blank cell between phrases
    if (col.length >= perColumn) out.push(col.slice(0, perColumn)), (col = "");
  }
  out.push("洪德十五年" + "　" + "申仁忠記"); // date + author column, as stele texts close
  return out;
}

async function loadHanFont() {
  if (typeof document === "undefined" || !document.fonts) return false;
  const probe = `64px "${HAN_FAMILY}"`;
  try {
    await Promise.all([document.fonts.load(probe, "文"), document.fonts.load(`700 ${probe}`, "文")]);
    if (document.fonts.check(probe, "文")) return true;
  } catch {
    /* fall through to the explicit FontFace below */
  }
  // the page CSS did not declare the face (e.g. an isolated preview) — load it ourselves
  try {
    for (const [w, file] of [
      ["400", "NotoSerifTC-Han-400.woff2"],
      ["700", "NotoSerifTC-Han-700.woff2"],
    ]) {
      const face = new FontFace(HAN_FAMILY, `url(${new URL(`fonts/${file}`, document.baseURI)})`, { weight: w });
      document.fonts.add(await face.load());
    }
    return true;
  } catch {
    return false; // canvas falls back to the system serif — still a carved texture
  }
}

/* ------------------------------------------------------------------------------------------
 * Slab outline (metres): vertical sides, elliptical crown
 * ---------------------------------------------------------------------------------------- */
const SLAB = { w: 1.0, h: 1.6, t: 0.2, crown: 0.42 };
SLAB.body = SLAB.h - SLAB.crown; // height of the straight sides

function slabShape(THREE, w = SLAB.w, body = SLAB.body, crown = SLAB.crown) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, body);
  s.absellipse(0, body, w / 2, crown, 0, Math.PI, false);
  s.lineTo(-w / 2, 0);
  return s;
}

/* ------------------------------------------------------------------------------------------
 * Carving: height-map canvas for the stele face
 * ---------------------------------------------------------------------------------------- */
const LEVEL = { surface: 205, field: 112, relief: 238, carve: 64, line: 130 };
const grey = (v) => `rgb(${v},${v},${v})`;

function drawSteleCarving(canvas, PPM, stripPx, { lines, title, seed = 1442 }) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const X = (x) => (x + SLAB.w / 2) * PPM;
  const Y = (y) => (SLAB.h - y) * PPM;
  const r = rng(seed);
  const font = (px, weight = 400) => `${weight} ${Math.round(px)}px "${HAN_FAMILY}", "Noto Serif TC", "Songti TC", serif`;

  ctx.fillStyle = grey(LEVEL.surface);
  ctx.fillRect(0, 0, W, H);

  const { body, crown } = SLAB;
  const half = SLAB.w / 2;
  const band = 0.055; // decorated border width

  // --- border: incised inner line, and a vine scroll running along the band
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = grey(LEVEL.line - 30);
  ctx.lineWidth = 0.006 * PPM;
  ctx.beginPath();
  ctx.moveTo(X(-half + band), Y(0.075));
  ctx.lineTo(X(-half + band), Y(body));
  ctx.ellipse(X(0), Y(body), (half - band) * PPM, (crown - band) * PPM, 0, Math.PI, 0, false);
  ctx.lineTo(X(half - band), Y(0.075));
  ctx.closePath();
  ctx.stroke();

  // band-centre polyline (left side up, crown arc, right side down), resampled by arc length
  const mid = band / 2;
  const poly = [];
  for (let y = 0.08; y <= body; y += 0.01) poly.push([-half + mid, y]);
  for (let i = 0; i <= 80; i++) {
    const a = Math.PI - (i / 80) * Math.PI;
    poly.push([Math.cos(a) * (half - mid), body + Math.sin(a) * (crown - mid)]);
  }
  for (let y = body; y >= 0.08; y -= 0.01) poly.push([half - mid, y]);
  const cum = [0];
  for (let i = 1; i < poly.length; i++) cum.push(cum[i - 1] + Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]));
  const total = cum[cum.length - 1];
  const at = (d) => {
    let i = 1;
    while (i < cum.length - 1 && cum[i] < d) i++;
    const t = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
    const p = [poly[i - 1][0] + (poly[i][0] - poly[i - 1][0]) * t, poly[i - 1][1] + (poly[i][1] - poly[i - 1][1]) * t];
    const tx = poly[i][0] - poly[i - 1][0], ty = poly[i][1] - poly[i - 1][1];
    const l = Math.hypot(tx, ty) || 1;
    return { p, n: [-ty / l, tx / l] };
  };
  const wave = 0.075; // vine wavelength (m)
  ctx.strokeStyle = grey(LEVEL.line - 20);
  ctx.lineWidth = 0.004 * PPM;
  ctx.beginPath();
  for (let d = 0; d <= total; d += 0.004) {
    const { p, n } = at(d);
    const o = Math.sin((d / wave) * Math.PI * 2) * 0.009;
    const x = X(p[0] + n[0] * o), y = Y(p[1] + n[1] * o);
    d ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.stroke();
  for (let d = wave / 4, k = 0; d < total; d += wave / 2, k++) {
    // a small curl (leaf) at every crest of the vine, alternating sides
    const { p, n } = at(d);
    const side = k % 2 ? -1 : 1;
    const cx = X(p[0] + n[0] * side * 0.006), cy = Y(p[1] + n[1] * side * 0.006);
    ctx.beginPath();
    ctx.arc(cx, cy, 0.007 * PPM, 0, Math.PI * 1.6);
    ctx.stroke();
  }

  // --- bottom band: a row of cloud-wave scrolls
  ctx.strokeStyle = grey(LEVEL.line - 25);
  ctx.lineWidth = 0.004 * PPM;
  ctx.beginPath();
  ctx.moveTo(X(-half + 0.02), Y(0.075));
  ctx.lineTo(X(half - 0.02), Y(0.075));
  ctx.stroke();
  for (let x = -half + 0.07; x < half - 0.05; x += 0.07) {
    spiral(ctx, X(x), Y(0.038), 0.022 * PPM, 1.6);
  }

  // --- crown: recessed field with two dragons facing a sun disc among clouds
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(X(0), Y(body), (half - band - 0.01) * PPM, (crown - band - 0.01) * PPM, 0, Math.PI, 0, false);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = grey(LEVEL.field);
  ctx.fillRect(0, 0, W, Y(body + 0.012));
  drawCrownRelief(ctx, X, Y, PPM, r);
  ctx.restore();

  // --- title band (seal heading under the crown), read right → left
  const tb0 = body - 0.105, tb1 = body - 0.005;
  ctx.strokeStyle = grey(LEVEL.line - 30);
  ctx.lineWidth = 0.005 * PPM;
  ctx.strokeRect(X(-half + band + 0.012), Y(tb1), (SLAB.w - 2 * (band + 0.012)) * PPM, (tb1 - tb0) * PPM);
  const tChars = [...title];
  const tPitch = Math.min(0.072, (SLAB.w - 2 * (band + 0.03)) / Math.max(1, tChars.length));
  ctx.fillStyle = grey(LEVEL.carve);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = font(tPitch * 0.82 * PPM, 700);
  tChars.forEach((ch, i) => {
    const x = ((tChars.length - 1) / 2 - i) * tPitch;
    ctx.fillText(ch, X(x), Y((tb0 + tb1) / 2));
  });

  // --- inscription: frame + vertical columns, right → left, top → bottom
  const fx0 = -half + band + 0.012, fx1 = half - band - 0.012, fy0 = 0.09, fy1 = tb0 - 0.012;
  ctx.strokeStyle = grey(LEVEL.line - 10);
  ctx.lineWidth = 0.003 * PPM;
  ctx.strokeRect(X(fx0), Y(fy1), (fx1 - fx0) * PPM, (fy1 - fy0) * PPM);
  const cols = lines.length;
  const colPitch = Math.min(0.06, (fx1 - fx0 - 0.02) / Math.max(cols, 1));
  const maxLen = Math.max(...lines.map((l) => [...l].length), 1);
  const charPitch = Math.min(colPitch * 1.02, (fy1 - fy0 - 0.03) / maxLen);
  const size = Math.min(colPitch, charPitch) * 0.84;
  ctx.fillStyle = grey(LEVEL.carve);
  lines.forEach((line, c) => {
    const x = fx1 - 0.012 - colPitch * (c + 0.5);
    const isTitle = c === 0 && line === title;
    ctx.font = font(size * PPM * (isTitle ? 1.06 : 1), isTitle ? 700 : 400);
    [...line].forEach((ch, k) => {
      if (ch === "　" || ch === " ") return;
      ctx.fillText(ch, X(x), Y(fy1 - 0.016 - charPitch * (k + 0.5)));
    });
  });

  // --- weathering: soft blotches and chips
  for (let i = 0; i < 70; i++) {
    const x = r() * W, y = r() * (H - stripPx), rad = (0.02 + r() * 0.09) * PPM;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const v = r() < 0.5 ? 0 : 255;
    g.addColorStop(0, `rgba(${v},${v},${v},${0.05 + r() * 0.05})`);
    g.addColorStop(1, `rgba(${v},${v},${v},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  for (let i = 0; i < 160; i++) {
    ctx.fillStyle = grey(LEVEL.surface - 40 - r() * 40);
    ctx.beginPath();
    ctx.arc(r() * W, r() * (H - stripPx), 0.6 + r() * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  // side strip (for the slab's edges): plain surface
  ctx.fillStyle = grey(LEVEL.surface);
  ctx.fillRect(0, H - stripPx, W, stripPx);
}

/** One open spiral (cloud scroll) incised with the current stroke style. */
function spiral(ctx, cx, cy, R, turns) {
  ctx.beginPath();
  const n = 40;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = t * turns * Math.PI * 2;
    const rr = R * (1 - t * 0.85);
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.stroke();
}

/** "Lưỡng long chầu nhật": two dragons facing a flaming sun disc, plus scroll clouds. */
function drawCrownRelief(ctx, X, Y, PPM, r) {
  const body = SLAB.body;
  const cy = body + 0.17; // sun centre height
  const relief = grey(LEVEL.relief);
  const groove = grey(LEVEL.field + 10);

  // clouds behind everything (relief), each = three lobes + an incised spiral
  const clouds = [
    [-0.33, body + 0.06, 0.026],
    [0.33, body + 0.06, 0.026],
    [-0.2, body + 0.31, 0.022],
    [0.2, body + 0.31, 0.022],
    [0, body + 0.045, 0.02],
    [-0.36, body + 0.2, 0.018],
    [0.36, body + 0.2, 0.018],
  ];
  for (const [x, y, s] of clouds) {
    ctx.fillStyle = relief;
    for (const [dx, dy, k] of [
      [-1, 0, 0.8],
      [0, 0.45, 1],
      [1, 0, 0.8],
    ]) {
      ctx.beginPath();
      ctx.arc(X(x + dx * s), Y(y + dy * s), k * s * PPM, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = groove;
    ctx.lineWidth = 0.003 * PPM;
    spiral(ctx, X(x), Y(y + 0.2 * s), s * 0.8 * PPM, 1.3);
  }

  // sun disc with a flame ring
  ctx.fillStyle = relief;
  const flames = 14;
  ctx.beginPath();
  for (let i = 0; i <= flames * 2; i++) {
    const a = (i / (flames * 2)) * Math.PI * 2;
    const rr = (i % 2 ? 0.088 : 0.064) * PPM;
    const x = X(0) + Math.cos(a) * rr, y = Y(cy) + Math.sin(a) * rr;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.fill();
  ctx.strokeStyle = groove;
  ctx.lineWidth = 0.004 * PPM;
  ctx.beginPath();
  ctx.arc(X(0), Y(cy), 0.05 * PPM, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(X(0), Y(cy), 0.032 * PPM, 0, Math.PI * 2);
  ctx.stroke();

  // two dragons, mirrored: an S-shaped body tapering to the tail, head toward the sun
  for (const side of [-1, 1]) {
    const P = [
      [0.4, body + 0.02],
      [0.37, body + 0.2],
      [0.29, body + 0.09],
      [0.21, body + 0.25],
      [0.15, body + 0.13],
      [0.115, body + 0.19],
    ].map(([x, y]) => [x * side, y]);
    const pts = catmull(P, 18);
    // body: overlapping discs, radius grows from tail to neck
    ctx.fillStyle = relief;
    pts.forEach(([x, y], i) => {
      const t = i / (pts.length - 1);
      const rad = (0.005 + 0.015 * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.55)) * PPM;
      ctx.beginPath();
      ctx.arc(X(x), Y(y), rad, 0, Math.PI * 2);
      ctx.fill();
    });
    // dorsal flames along the body
    for (let i = 4; i < pts.length - 6; i += 3) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      const tx = x1 - x0, ty = y1 - y0, l = Math.hypot(tx, ty) || 1;
      const nx = -ty / l, ny = tx / l;
      const s = side > 0 ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(X(x0), Y(y0));
      ctx.lineTo(X(x0 + nx * 0.026 * s + tx * 0.3), Y(y0 + ny * 0.026 * s + ty * 0.3));
      ctx.lineTo(X(x1), Y(y1));
      ctx.fill();
    }
    // scales: incised arcs along the body
    ctx.strokeStyle = groove;
    ctx.lineWidth = 0.0025 * PPM;
    for (let i = 3; i < pts.length - 4; i += 2) {
      const [x, y] = pts[i];
      ctx.beginPath();
      ctx.arc(X(x), Y(y), 0.007 * PPM, 0, Math.PI);
      ctx.stroke();
    }
    // legs with three claws
    for (const k of [0.32, 0.62]) {
      const [x, y] = pts[Math.floor(k * pts.length)];
      ctx.strokeStyle = relief;
      ctx.lineWidth = 0.009 * PPM;
      const fx = x + 0.03 * side * (k > 0.5 ? -1 : 0.6), fy = y - 0.045;
      ctx.beginPath();
      ctx.moveTo(X(x), Y(y));
      ctx.quadraticCurveTo(X(x + 0.02 * side), Y(y - 0.03), X(fx), Y(fy));
      ctx.stroke();
      ctx.lineWidth = 0.004 * PPM;
      for (const c of [-1, 0, 1]) {
        ctx.beginPath();
        ctx.moveTo(X(fx), Y(fy));
        ctx.lineTo(X(fx + c * 0.012), Y(fy - 0.014));
        ctx.stroke();
      }
    }
    // head: skull + snout toward the sun, eye, horn and whisker
    const [hx, hy] = pts[pts.length - 1];
    ctx.fillStyle = relief;
    ctx.beginPath();
    ctx.ellipse(X(hx), Y(hy), 0.03 * PPM, 0.022 * PPM, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(X(hx - side * 0.03), Y(hy - 0.004), 0.022 * PPM, 0.013 * PPM, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = relief;
    ctx.lineWidth = 0.006 * PPM;
    ctx.beginPath();
    ctx.moveTo(X(hx + side * 0.01), Y(hy + 0.015));
    ctx.quadraticCurveTo(X(hx + side * 0.04), Y(hy + 0.05), X(hx + side * 0.065), Y(hy + 0.04));
    ctx.stroke();
    ctx.lineWidth = 0.003 * PPM;
    ctx.beginPath();
    ctx.moveTo(X(hx - side * 0.05), Y(hy - 0.01));
    ctx.quadraticCurveTo(X(hx - side * 0.06), Y(hy - 0.05), X(hx - side * 0.03), Y(hy - 0.065));
    ctx.stroke();
    ctx.fillStyle = groove;
    ctx.beginPath();
    ctx.arc(X(hx - side * 0.004), Y(hy + 0.006), 0.0055 * PPM, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = groove;
    ctx.lineWidth = 0.0025 * PPM;
    ctx.beginPath();
    ctx.moveTo(X(hx - side * 0.052), Y(hy - 0.008));
    ctx.lineTo(X(hx - side * 0.012), Y(hy - 0.012));
    ctx.stroke();
  }
}

/** Uniform Catmull-Rom through 2D points → dense polyline. */
function catmull(P, perSeg) {
  const out = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    for (let k = 0; k < perSeg; k++) {
      const t = k / perSeg, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(P[P.length - 1]);
  return out;
}

/* ------------------------------------------------------------------------------------------
 * Turtle shell scutes: hexagonal grooves in lathe UV space (u around, v rim → apex)
 * ---------------------------------------------------------------------------------------- */
function drawShellPattern(canvas, rimV) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#000";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const yOf = (v) => (1 - v) * H; // canvas row of a v coordinate
  const cols = 16;
  const pitch = W / cols;
  const size = pitch / Math.sqrt(3); // pointy-top hexagon circumradius
  const rowH = size * 1.5;
  ctx.lineWidth = Math.max(3, W / 300);
  const rimY = yOf(rimV);
  // hexagons above the rim band, wrapped around u so the seam is invisible
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, rimY);
  ctx.clip();
  for (let row = 0; row * rowH < rimY + size; row++) {
    const cy = rimY - size * 0.55 - row * rowH;
    const off = row % 2 ? pitch / 2 : 0;
    for (let c = -1; c <= cols; c++) {
      const cx = c * pitch + off;
      ctx.beginPath();
      for (let k = 0; k <= 6; k++) {
        const a = Math.PI / 6 + (k * Math.PI) / 3;
        const x = cx + Math.cos(a) * size * 0.97, y = cy + Math.sin(a) * size * 0.97;
        k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
  // rim band: a groove on each edge and marginal scutes
  ctx.lineWidth = Math.max(3, W / 260);
  for (const y of [rimY, yOf(rimV * 0.18)]) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  for (let c = 0; c < cols * 2; c++) {
    const x = (c + 0.5) * (pitch / 2);
    ctx.beginPath();
    ctx.moveTo(x, rimY);
    ctx.lineTo(x, yOf(rimV * 0.18));
    ctx.stroke();
  }
}

/* ------------------------------------------------------------------------------------------
 * Turtle body parts (shared by the hero and the low-poly instance template)
 * ---------------------------------------------------------------------------------------- */
// shell profile (radius, height) from the rim to the apex, normalised
const SHELL_PROFILE = [
  [0.86, 0.0],
  [0.97, 0.025],
  [1.0, 0.08],
  [0.99, 0.15],
  [0.95, 0.26],
  [0.88, 0.43],
  [0.78, 0.61],
  [0.64, 0.77],
  [0.47, 0.89],
  [0.28, 0.965],
  [0.1, 0.996],
  [0.0, 1.0],
];
const TURTLE = { plinthH: 0.16, shell: { rx: 0.64, ry: 0.44, rz: 0.82 } };

function shellGeometry(THREE, segments, rings) {
  // resample the profile by arc length so v grows evenly from rim to apex
  const curve = new THREE.SplineCurve(SHELL_PROFILE.map(([r, y]) => new THREE.Vector2(r, y)));
  const pts = curve.getSpacedPoints(rings).map((p) => new THREE.Vector2(Math.max(0, p.x), p.y));
  pts[pts.length - 1].x = 0;
  const g = new THREE.LatheGeometry(pts, segments);
  g.scale(TURTLE.shell.rx, TURTLE.shell.ry, TURTLE.shell.rz);
  return g;
}

/**
 * Head on a raised neck, built facing +Z with +Y up (origin = neck base): neck, skull,
 * snout over a lower jaw (the overlap reads as the mouth line), eyes under brow ridges.
 */
function headWithFeatures(THREE, detail) {
  const bag = new GeoBag(THREE);
  const s = detail ? [18, 12] : [6, 4];
  const ell = (sx, sy, sz, x, y, z) => bag.add(new THREE.SphereGeometry(1, s[0], s[1]), { x, y, z, sx, sy, sz });
  bag.add(new THREE.CylinderGeometry(0.115, 0.15, 0.36, detail ? 16 : 6, 1, true), { z: 0.15, rx: Math.PI / 2 });
  ell(0.135, 0.108, 0.18, 0, 0.02, 0.33); // skull
  ell(0.095, 0.072, 0.125, 0, -0.005, 0.46); // snout
  if (detail) {
    ell(0.09, 0.05, 0.115, 0, -0.052, 0.42); // lower jaw
    for (const x of [-1, 1]) {
      bag.add(new THREE.SphereGeometry(0.027, 10, 8), { x: x * 0.097, y: 0.065, z: 0.375 }); // eye
      ell(0.05, 0.022, 0.042, x * 0.083, 0.094, 0.362); // brow ridge
      bag.add(new THREE.SphereGeometry(0.011, 6, 4), { x: x * 0.03, y: 0.04, z: 0.55 }); // nostril
    }
  }
  return bag.merge();
}

/** Adds head, flippers and tail (not the shell) to a bag; facing +Z, shell base at y0. */
function addTurtleBody(THREE, bag, y0, detail) {
  const { rz } = TURTLE.shell;
  // head raised ~30° (rotating the local +Z axis up about X)
  bag.add(headWithFeatures(THREE, detail), { x: 0, y: y0 + 0.16, z: rz * 0.68, rx: -0.52 });
  const seg = detail ? [18, 10] : [6, 3];
  for (const s of [-1, 1]) {
    // paddle flippers (flattened ellipsoids along local X): front yawed forward-out, rear back-out
    bag.add(new THREE.SphereGeometry(1, seg[0], seg[1]), { x: s * 0.6, y: y0 + 0.06, z: rz * 0.5, sx: 0.3, sy: 0.055, sz: 0.14, ry: -s * 0.62 });
    bag.add(new THREE.SphereGeometry(1, seg[0], seg[1]), { x: s * 0.56, y: y0 + 0.05, z: -rz * 0.56, sx: 0.23, sy: 0.05, sz: 0.12, ry: s * 0.62 });
  }
  // short blunt tail
  bag.add(new THREE.SphereGeometry(1, detail ? 12 : 5, detail ? 8 : 3), { x: 0, y: y0 + 0.06, z: -rz - 0.02, sx: 0.06, sy: 0.045, sz: 0.13, rx: 0.3 });
}

/* ------------------------------------------------------------------------------------------
 * Hero: one detailed stele on its turtle
 * ---------------------------------------------------------------------------------------- */
export async function buildSteleOnTurtle(THREE, { lines, title, quality = "high" } = {}) {
  await loadHanFont();
  const hi = quality !== "low";
  title = title || DEFAULT_TITLE;
  lines = Array.isArray(lines) && lines.length ? lines.map(String) : defaultSteleLines();

  const group = new THREE.Group();
  group.name = "stele-on-turtle";
  const stoneMat = whiteMaterial(THREE);
  stoneMat.name = "stone";

  // ---- plinth (slightly bumpy dressed stone)
  const plinthGeo = new THREE.BoxGeometry(1.8, TURTLE.plinthH, 2.35, hi ? 24 : 8, 2, hi ? 30 : 10);
  plinthGeo.translate(0, TURTLE.plinthH / 2, 0.05);
  roughen(THREE, plinthGeo, 0.006, 4, 41);
  group.add(mesh(THREE, plinthGeo, stoneMat, "plinth"));

  // ---- shell with the hexagonal scute normal map
  const shellW = hi ? 1024 : 512, shellH = hi ? 256 : 128;
  const rimV = 0.2;
  const shellCanvas = makeCanvas(shellW, shellH);
  drawShellPattern(shellCanvas, rimV);
  const raw = canvasToHeight(shellCanvas);
  const fine = softBlur(raw, shellW, shellH, Math.max(1, Math.round(shellW / 340)), true);
  const broad = softBlur(raw, shellW, shellH, Math.round(shellW / 70), true);
  const shellHeight = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++) shellHeight[i] = 0.55 * fine[i] + 0.45 * broad[i]; // grooves + domed scutes
  const shellNormal = dataTexture(THREE, heightToNormalRGBA(shellHeight, shellW, shellH, shellW / 90, true), shellW, shellH);
  const shellMat = whiteMaterial(THREE, { normalMap: shellNormal });
  shellMat.name = "shell";
  const shell = mesh(THREE, shellGeometry(THREE, hi ? 96 : 40, hi ? 40 : 16), shellMat, "shell");
  shell.position.y = TURTLE.plinthH;
  group.add(shell);

  // ---- head, flippers, tail
  const body = new GeoBag(THREE);
  addTurtleBody(THREE, body, TURTLE.plinthH, true); // the hero keeps its full detail on every tier
  group.add(mesh(THREE, body.merge(), stoneMat, "turtle"));

  // ---- socket block on the shell, then the slab
  const shellTop = TURTLE.plinthH + TURTLE.shell.ry;
  // socket block: its top sits 9 cm above the shell apex, its body sinks into the dome
  const socketH = 0.36;
  const socketGeo = new THREE.BoxGeometry(SLAB.w + 0.12, socketH, SLAB.t + 0.14, hi ? 12 : 4, 3, 4);
  socketGeo.translate(0, shellTop + 0.09 - socketH / 2, 0);
  roughen(THREE, socketGeo, 0.004, 7, 77);
  group.add(mesh(THREE, socketGeo, stoneMat, "socket"));
  const slabBase = shellTop + 0.09;

  // ---- carved face texture
  const PPM = hi ? 1024 : 640; // pixels per metre on the face
  const facePx = Math.round(SLAB.h * PPM);
  const stripPx = Math.round(PPM * 0.06);
  const W = Math.round(SLAB.w * PPM), H = facePx + stripPx;
  const canvas = makeCanvas(W, H);
  drawSteleCarving(canvas, PPM, stripPx, { lines, title });
  let height = canvasToHeight(canvas);
  const grain = rng(1484);
  for (let i = 0; i < height.length; i++) height[i] += (grain() - 0.5) * 0.06; // stone grain
  height = softBlur(height, W, H, Math.max(1, Math.round(PPM / 700)));
  const faceNormal = dataTexture(THREE, heightToNormalRGBA(height, W, H, PPM / 110), W, H);
  const faceAlbedo = dataTexture(THREE, cavityRGBA(height, W, H, { radius: Math.round(PPM / 150), gain: 3.4, floor: 0.42 }), W, H, THREE.SRGBColorSpace);
  faceNormal.wrapS = faceAlbedo.wrapS = THREE.ClampToEdgeWrapping;

  // ---- slab geometry with face UVs mapped onto the carving
  const vFace = (y) => (stripPx + y * PPM) / H;
  const depth = SLAB.t;
  const bevel = 0.012;
  const uvGen = {
    generateTopUV(geometry, v, a, b, c) {
      const front = v[a * 3 + 2] > depth / 2;
      return [a, b, c].map((i) => {
        const x = v[i * 3], y = v[i * 3 + 1];
        return new THREE.Vector2(front ? x / SLAB.w + 0.5 : 0.5 - x / SLAB.w, vFace(y));
      });
    },
    generateSideWallUV(geometry, v, a, b, c, d) {
      const strip = stripPx / H;
      return [a, b, c, d].map((i) => {
        const x = v[i * 3], y = v[i * 3 + 1], z = v[i * 3 + 2];
        return new THREE.Vector2(0.5 + (x + y) * 0.08, strip * (0.35 + 0.3 * clamp((z + bevel) / (depth + 2 * bevel), 0, 1)));
      });
    },
  };
  const slabGeo = new THREE.ExtrudeGeometry(slabShape(THREE), {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.8,
    bevelSegments: hi ? 3 : 1,
    curveSegments: hi ? 48 : 20,
    UVGenerator: uvGen,
  });
  slabGeo.translate(0, slabBase, -depth / 2);
  const slabMat = whiteMaterial(THREE, { map: faceAlbedo, normalMap: faceNormal });
  slabMat.name = "stele-face";
  group.add(mesh(THREE, slabGeo, slabMat, "stele"));

  const top = slabBase + SLAB.h;
  const anchors = {
    face: new THREE.Vector3(0, slabBase + SLAB.h * 0.5, depth / 2 + bevel),
    top: new THREE.Vector3(0, top, 0),
    base: new THREE.Vector3(0, 0, 0),
    head: new THREE.Vector3(0, TURTLE.plinthH + 0.38, TURTLE.shell.rz * 0.68 + 0.34),
    crown: new THREE.Vector3(0, slabBase + SLAB.body + SLAB.crown * 0.45, depth / 2 + bevel),
  };
  return {
    group,
    anchors,
    size: { w: SLAB.w, h: top, slab: { w: SLAB.w, h: SLAB.h, t: SLAB.t, base: slabBase } },
    dispose: () => disposeTree(group),
  };
}

/* ------------------------------------------------------------------------------------------
 * Low-poly stele + turtle for the InstancedMesh rows (face toward +Z, base at y = 0)
 * ---------------------------------------------------------------------------------------- */
export function steleInstanceGeometry(THREE, { quality = "high" } = {}) {
  const hi = quality !== "low";
  const bag = new GeoBag(THREE);
  bag.boxOn(1.55, 0.12, 2.0, 0, 0, 0.05);
  bag.add(shellGeometry(THREE, hi ? 12 : 9, hi ? 5 : 4), { y: 0.12 });
  addTurtleBody(THREE, bag, 0.12, false);
  const shellTop = 0.12 + TURTLE.shell.ry;
  bag.boxOn(1.0, 0.32, 0.32, 0, shellTop - 0.24, 0);
  const slab = new THREE.ExtrudeGeometry(slabShape(THREE, 0.9, 1.0, 0.36), {
    depth: 0.18,
    bevelEnabled: false,
    curveSegments: hi ? 8 : 5,
  });
  slab.translate(0, shellTop + 0.08, -0.09);
  bag.add(slab);
  return bag.merge();
}

export { SLAB, TURTLE };
