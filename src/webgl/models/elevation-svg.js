// Architectural line drawing of Khuê Văn Các for the closing wall: front elevation at
// 1:100-ish (70 px per metre) on a faint grid, with a plan, a round-window detail and level
// marks. Black strokes on white, viewBox 0 0 1440 950. Proportions come from the same KVC
// table as the 3D model, and the roof curves use the same eave/hip formula.
import { KVC } from "./khue-van-cac.js";

const W = 1440, H = 950;
const S = 70; // px per metre
const CX = 720, GY = 862; // elevation axis and ground line
const X = (m) => CX + m * S;
const Y = (m) => GY - m * S;
const f = (n) => Math.round(n * 10) / 10;

const line = (x1, y1, x2, y2, w = 1.2, extra = "") =>
  `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke-width="${w}"${extra}/>`;
const rect = (x, y, w, h, sw = 1.2, extra = "") => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" stroke-width="${sw}"${extra}/>`;
const circle = (cx, cy, r, sw = 1.2, extra = "") => `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" stroke-width="${sw}"${extra}/>`;
const poly = (pts, sw = 1.2, extra = "") => `<polyline points="${pts.map(([x, y]) => `${f(x)},${f(y)}`).join(" ")}" stroke-width="${sw}"${extra}/>`;
const text = (x, y, s, size = 13, anchor = "start", extra = "") =>
  `<text x="${f(x)}" y="${f(y)}" font-size="${size}" text-anchor="${anchor}" fill="#000" stroke="none"${extra}>${s}</text>`;

/** Smooth path through points (Catmull-Rom → cubic Bézier). */
function smooth(pts) {
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`;
  }
  return d;
}
const path = (d, sw = 1.2, extra = "") => `<path d="${d}" stroke-width="${sw}"${extra}/>`;
/** "Tube" look: a thick black stroke with a white core (outlined bead). */
const tube = (d, w) => path(d, w + 3) + path(d, w, ' stroke="#fff"');

/**
 * Front slope of a hip roof in elevation (same maths as roof.js, projected on x/y).
 * Returns the outline, hips, tile lines and curls as SVG.
 */
function roofElevation({ hx, ix, eave, h, lift, flare, reach, sag, thickness, tile, curl, bead }) {
  const profile = (t) => (1 - sag) * t + sag * t * t;
  const L = 2 * hx;
  const R = Math.min(reach, L / 2);
  const pt = (s, t) => {
    const d0 = s * L, d1 = (1 - s) * L;
    const w0 = d0 < R ? (1 - d0 / R) ** 2 : 0;
    const w1 = d1 < R ? (1 - d1 / R) ** 2 : 0;
    const fall = Math.max(0, 1 - t) ** 2.4;
    const bx = -hx + 2 * hx * s, tx = -ix + 2 * ix * s;
    const x = bx + (tx - bx) * t + flare * (w1 - w0) * fall;
    const y = eave + h * profile(t) + lift * (w0 + w1) * fall;
    return [X(x), Y(y)];
  };
  let out = "";
  // tile channels first (thin), then the heavier outline on top
  const n = Math.round(L / tile);
  for (let i = 1; i < n; i++) {
    const s = i / n;
    const pts = [];
    for (let j = 0; j <= 10; j++) pts.push(pt(s, j / 10));
    out += poly(pts, 0.7);
  }
  const eaveTop = [], eaveBot = [];
  for (let i = 0; i <= 60; i++) {
    const [x, y] = pt(i / 60, 0);
    eaveTop.push([x, y]);
    eaveBot.push([x, y + thickness * S]);
  }
  out += poly(eaveTop, 2) + poly(eaveBot, 1.4);
  // hips and the top edge
  for (const s of [0, 1]) {
    const pts = [];
    for (let j = 0; j <= 20; j++) pts.push(pt(s, j / 20));
    out += tube(smooth(pts), bead * 2 * S);
  }
  out += line(...pt(0, 1), ...pt(1, 1), 1.6);
  // hooked corner curls (đầu đao): outward along x, up in y
  for (const side of [-1, 1]) {
    const [ex, ey] = pt(side < 0 ? 0 : 1, 0);
    const hook = [
      [0, 0],
      [0.3, 0.12],
      [0.55, 0.38],
      [0.62, 0.7],
      [0.52, 0.94],
      [0.34, 1.02],
    ].map(([a, b]) => [ex + side * a * curl * 0.75 * S, ey - b * curl * S]);
    out += tube(smooth(hook), bead * 2 * S);
    out += circle(hook[hook.length - 1][0], hook[hook.length - 1][1], bead * 1.35 * S, 1.6);
  }
  return out;
}

/** Ridge-end hook ornament (kìm) outline, mirrored by `side`. */
function ridgeHookPath(x0, y0, size, side) {
  const p = [
    [-0.25, 0],
    [0.18, 0],
    [0.36, 0.12],
    [0.46, 0.36],
    [0.44, 0.62],
    [0.3, 0.82],
    [0.1, 0.9],
    [-0.06, 0.82],
    [0.02, 0.72],
    [0.16, 0.7],
    [0.26, 0.56],
    [0.26, 0.4],
    [0.16, 0.26],
    [-0.02, 0.2],
    [-0.25, 0.14],
  ].map(([a, b]) => [x0 + side * a * size * S, y0 - b * size * S]);
  return smooth(p) + " Z";
}

/** Vertical scroll ornament for the carved pillar panels. */
function scrollOrnament(x, y0, y1, amp) {
  const pts = [];
  for (let y = y0; y <= y1; y += 4) pts.push([x + Math.sin((y - y0) / 26) * amp, y]);
  let out = poly(pts, 0.8);
  for (let y = y0 + 20, k = 0; y < y1 - 10; y += 41, k++) {
    const side = k % 2 ? -1 : 1;
    const cx = x + side * amp * 1.2;
    out += path(`M${f(cx)},${f(y)} a${f(amp * 0.7)},${f(amp * 0.7)} 0 1 ${side > 0 ? 1 : 0} ${f(side * amp * 0.5)},${f(amp * 0.9)}`, 0.8);
  }
  return out;
}

/** Round window: proud outer frame, opening, inner ring and radiating bars. r = opening radius in px. */
function roundWindow(cx, cy, r, { hole, ring0, ring1, bars }, sw = 1.2) {
  const k = r / hole; // px per metre at this drawing scale
  let out = circle(cx, cy, r + 0.09 * k, sw) + circle(cx, cy, r, sw * 1.4);
  out += circle(cx, cy, ring1 * k, sw) + circle(cx, cy, ring0 * k, sw);
  const w = 0.025 * k; // half bar width
  for (let i = 0; i < bars; i++) {
    const a = (i / bars) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    const r0 = ring1 * k;
    out += line(cx + c * r0 - s * w, cy + s * r0 + c * w, cx + c * r - s * w, cy + s * r + c * w, sw * 0.8);
    out += line(cx + c * r0 + s * w, cy + s * r0 - c * w, cx + c * r + s * w, cy + s * r - c * w, sw * 0.8);
  }
  return out;
}

function levelMark(x, m, label) {
  const y = Y(m);
  return (
    line(x - 70, y, x + 8, y, 0.7, ' stroke-dasharray="2 3"') +
    poly(
      [
        [x - 6, y - 9],
        [x + 6, y - 9],
        [x, y],
        [x - 6, y - 9],
      ],
      0.9,
    ) +
    text(x + 12, y - 4, label, 12)
  );
}

export function khueVanCacElevationSVG() {
  const { platform, pillar, floor, balustrade, room, window: win, lowerRoof, band, upperRoof } = KVC;
  let g = "";

  // ---- faint grid (0.5 m) with heavier metre lines, and the centre axis
  let grid = "";
  for (let x = CX % (S / 2); x <= W; x += S / 2) grid += line(x, 0, x, H, Math.round((x - CX) / (S / 2)) % 2 ? 0.4 : 0.7);
  for (let y = GY % (S / 2); y <= H; y += S / 2) grid += line(0, y, W, y, Math.round((GY - y) / (S / 2)) % 2 ? 0.4 : 0.7);
  g += `<g stroke-opacity="0.16">${grid}</g>`;
  g += line(CX, 70, CX, 925, 0.9, ' stroke-dasharray="26 6 4 6"');

  // ---- ground, hatching
  g += line(60, GY, 1380, GY, 2.4);
  let hatch = "";
  for (let x = 70; x < 1380; x += 14) hatch += line(x, GY + 2, x - 12, GY + 14, 0.7);
  g += `<g stroke-opacity="0.55">${hatch}</g>`;

  // ---- platform and steps
  g += rect(X(-platform.half), Y(platform.h), platform.half * 2 * S, platform.h * S, 1.8);
  g += line(X(-platform.half + 0.1), Y(platform.h - 0.08), X(platform.half - 0.1), Y(platform.h - 0.08), 0.9);
  g += rect(X(-1.7), Y(0.2), 3.4 * S, 0.2 * S, 1.2) + rect(X(-1.7), Y(0.4), 3.4 * S, 0.2 * S, 1.2);

  // ---- pillars with carved panels, lintel
  for (const sx of [-1, 1]) {
    const px = sx * pillar.at;
    const x0 = X(px - pillar.size / 2);
    g += rect(X(px - pillar.size / 2 - 0.12), Y(platform.h + 0.22), (pillar.size + 0.24) * S, 0.22 * S, 1.4);
    g += rect(x0, Y(pillar.top), pillar.size * S, (pillar.top - platform.h - 0.22) * S, 2);
    const p0 = Y(platform.h + 0.3 + (pillar.top - platform.h) * 0.74), p1 = Y(platform.h + 0.3);
    const pw = pillar.size * 0.66 * S;
    g += `<rect x="${f(X(px) - pw / 2)}" y="${f(p0)}" width="${f(pw)}" height="${f(p1 - p0)}" rx="7" stroke-width="1"/>`;
    g += scrollOrnament(X(px), p0 + 10, p1 - 10, pw * 0.22);
  }
  g += rect(X(-pillar.at + pillar.size / 2), Y(pillar.top), (pillar.at * 2 - pillar.size) * S, 0.42 * S, 1.4);

  // ---- floor frieze with a meander band
  g += rect(X(-floor.half), Y(floor.y1), floor.half * 2 * S, (floor.y1 - floor.y0) * S, 1.8);
  let meander = "";
  const my0 = Y(floor.y1) + 6, my1 = Y(floor.y0) - 6, step = 18;
  for (let x = X(-floor.half) + 8; x < X(floor.half) - step; x += step) {
    meander += poly(
      [
        [x, my1],
        [x, my0],
        [x + step * 0.7, my0],
        [x + step * 0.7, my1 - 6],
        [x + step * 0.3, my1 - 6],
        [x + step * 0.3, my0 + 6],
      ],
      0.8,
    );
  }
  g += meander;

  // ---- upper room: wall, columns, couplet boards, name board, round window
  const wallTop = lowerRoof.eave + 0.05;
  g += rect(X(-room.half), Y(wallTop), room.half * 2 * S, (wallTop - floor.y1 - balustrade.h) * S, 1.6);
  for (const sx of [-1, 1]) {
    g += rect(X(sx * room.half) - 0.15 * S, Y(wallTop), 0.3 * S, (wallTop - floor.y1 - balustrade.h) * S, 1.5);
    g += rect(X(sx * 1.2) - 0.11 * S, Y(wallTop), 0.22 * S, (wallTop - floor.y1 - balustrade.h) * S, 1.2);
    const bx = X(sx * 1.72) - 0.17 * S, by = Y(floor.y1 + 1.15 + 0.775);
    g += rect(bx, by, 0.34 * S, 1.55 * S * 0.7, 1.1);
    for (let k = 0; k < 5; k++) g += line(bx + 8, by + 12 + k * 14, bx + 0.34 * S - 8, by + 12 + k * 14, 0.7);
  }
  g += roundWindow(X(0), Y(win.y), win.hole * S, win, 1.2);
  const nbY = Y(win.y + win.hole + 0.22);
  g += rect(X(-0.62), nbY - 0.15 * S, 1.25 * S, 0.3 * S, 1.2);
  for (const k of [-1, 0, 1]) g += rect(X(k * 0.34) - 7, nbY - 7, 14, 14, 0.9);
  // corner brackets under the lower eave
  for (const sx of [-1, 1]) g += line(X(sx * room.half), Y(lowerRoof.eave - 0.65), X(sx * (lowerRoof.half - 0.1)), Y(lowerRoof.eave - 0.02), 1.6);

  // ---- balustrade: posts, rails, turned balusters
  const B = balustrade.half;
  const yb1 = Y(floor.y1 + balustrade.h);
  // rails, posts and balusters are filled white: they stand in front of the round window
  const W_ = ' fill="#fff"';
  g += rect(X(-B), yb1, B * 2 * S, 0.08 * S, 1.3, W_);
  g += rect(X(-B), Y(floor.y1 + 0.17), B * 2 * S, 0.1 * S, 1.1, W_);
  for (let i = 0; i <= balustrade.bays; i++) {
    const x = -B + (i * 2 * B) / balustrade.bays;
    g += rect(X(x) - 5, Y(floor.y1 + balustrade.h + 0.1), 10, (balustrade.h + 0.1) * S, 1.3, W_);
    g += rect(X(x) - 7.5, Y(floor.y1 + balustrade.h + 0.18), 15, 0.08 * S, 1.1, W_);
    if (i === balustrade.bays) break;
    const bayW = (2 * B) / balustrade.bays;
    for (let j = 1; j <= 5; j++) {
      const bx = X(x + (j * bayW) / 6);
      const ya = Y(floor.y1 + 0.17), yz = yb1 + 0.08 * S;
      g += `<ellipse cx="${f(bx)}" cy="${f((ya + yz) / 2)}" rx="3.3" ry="${f((ya - yz) * 0.32)}" stroke-width="0.9" fill="#fff"/>`;
      g += line(bx, ya, bx, yz, 0.6);
    }
  }

  // ---- band between the roofs (cổ diêm) with small panels
  g += rect(X(-band.half), Y(upperRoof.eave), band.half * 2 * S, (upperRoof.eave - lowerRoof.eave - lowerRoof.h + 0.05) * S, 1.4);
  for (let x = -band.half + 0.25; x < band.half - 0.3; x += 0.55) {
    g += rect(X(x), Y(upperRoof.eave - 0.08), 0.4 * S, 0.22 * S, 0.8);
  }

  // ---- roofs (lower skirt first, upper roof over it)
  const bg = (d) => path(d, 0, ' fill="#fff" stroke="none"');
  g += roofElevation({
    hx: lowerRoof.half, ix: lowerRoof.inner, eave: lowerRoof.eave, h: lowerRoof.h,
    lift: 0.55, flare: 0.38, reach: 1.9, sag: 0.3, thickness: 0.2, tile: 0.3, curl: 0.75, bead: 0.08,
  });
  // the upper roof hides what is behind it: paint its silhouette white first
  const up = { hx: upperRoof.half, ix: upperRoof.ridge, eave: upperRoof.eave, h: upperRoof.h };
  g += bg(
    `M${f(X(-up.hx - 0.3))},${f(Y(up.eave + 0.5))} L${f(X(-up.ix))},${f(Y(up.eave + up.h))} L${f(X(up.ix))},${f(Y(up.eave + up.h))} L${f(X(up.hx + 0.3))},${f(Y(up.eave + 0.5))} L${f(X(up.hx))},${f(Y(up.eave - 0.2))} L${f(X(-up.hx))},${f(Y(up.eave - 0.2))} Z`,
  );
  g += roofElevation({
    hx: up.hx, ix: up.ix, eave: up.eave, h: up.h,
    lift: 0.5, flare: 0.3, reach: 1.6, sag: 0.45, thickness: 0.2, tile: 0.3, curl: 0.65, bead: 0.08,
  });
  // ridge bead and the hooked ridge-end ornaments
  const rr = 0.1;
  const ridgeY = up.eave + up.h;
  g += rect(X(-up.ix - rr), Y(ridgeY + rr * 2.2), (up.ix + rr) * 2 * S, rr * 2.2 * S, 1.6);
  for (const side of [-1, 1]) g += path(ridgeHookPath(X(side * up.ix), Y(ridgeY + rr * 0.4), 0.8, side), 1.6, ' fill="#fff"');

  // ---- level marks and dimensions (right of the elevation)
  const lx = X(5.6);
  g += levelMark(lx, 0, "±0,00");
  g += levelMark(lx, platform.h, "+0,40");
  g += levelMark(lx, pillar.top, "+3,40");
  g += levelMark(lx, lowerRoof.eave, "+5,95");
  g += levelMark(lx, upperRoof.eave + upperRoof.h, "+8,50");
  const dy = GY + 44;
  g += line(X(-pillar.at), dy, X(pillar.at), dy, 0.9);
  for (const x of [-pillar.at, pillar.at]) g += line(X(x), dy - 8, X(x), dy + 8, 0.9) + line(X(x) - 5, dy + 5, X(x) + 5, dy - 5, 1.2);
  g += text(CX, dy - 8, "4,90", 12, "middle");
  g += line(X(-platform.half), dy + 26, X(platform.half), dy + 26, 0.9);
  for (const x of [-platform.half, platform.half]) g += line(X(x), dy + 18, X(x), dy + 34, 0.9) + line(X(x) - 5, dy + 31, X(x) + 5, dy + 21, 1.2);
  g += text(CX, dy + 22, "8,80", 12, "middle");

  // ---- detail A: the round window at 2.6× (left)
  const dcx = 205, dcy = 300, dr = 118;
  g += roundWindow(dcx, dcy, dr, win, 1.4);
  g += rect(dcx - dr - 34, dcy - dr - 34, (dr + 34) * 2, (dr + 34) * 2, 0.8, ' stroke-dasharray="3 4"');
  g += circle(X(0), Y(win.y), win.hole * S + 16, 0.8, ' stroke-dasharray="3 4"');
  g += poly(
    [
      [X(0) - win.hole * S - 16, Y(win.y)],
      [dcx + dr + 60, dcy + 110],
      [dcx + dr + 34, dcy + 60],
    ],
    0.8,
  );
  g += text(dcx - dr - 34, dcy - dr - 46, "CHI TIẾT A — CỬA SỔ TRÒN", 13, "start", ' letter-spacing="2"');

  // ---- plan (right): platform, pillars, upper room, eave line, passage arrow
  const pcx = 1225, pcy = 300, ps = 19;
  const P = (x, z) => [pcx + x * ps, pcy + z * ps];
  const prect = (h, sw, extra = "") => rect(P(-h, -h)[0], P(-h, -h)[1], h * 2 * ps, h * 2 * ps, sw, extra);
  g += prect(platform.half, 1.6);
  g += prect(floor.half, 0.9, ' stroke-dasharray="6 4"');
  g += prect(room.half, 1.1, ' stroke-dasharray="2 3"');
  g += prect(lowerRoof.half + 0.2, 0.7, ' stroke-dasharray="14 4 2 4"');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const [x, y] = P(sx * pillar.at - pillar.size / 2, sz * pillar.at - pillar.size / 2);
    g += rect(x, y, pillar.size * ps, pillar.size * ps, 1.6);
    g += line(x, y, x + pillar.size * ps, y + pillar.size * ps, 0.7);
  }
  for (const [x, z] of [
    [0, -room.half],
    [0, room.half],
    [-room.half, 0],
    [room.half, 0],
  ]) {
    const [px, py] = P(x, z);
    g += circle(px, py, win.hole * ps, 0.9);
  }
  g += line(pcx, pcy - (platform.half + 2.2) * ps, pcx, pcy + (platform.half + 2.2) * ps, 0.8, ' stroke-dasharray="26 6 4 6"');
  const ay = pcy + (platform.half + 1.4) * ps;
  g += poly(
    [
      [pcx - 7, ay - 12],
      [pcx, ay - 26],
      [pcx + 7, ay - 12],
    ],
    1.2,
  );
  g += text(pcx - (platform.half + 0.2) * ps, pcy - (platform.half + 1.2) * ps, "MẶT BẰNG", 13, "start", ' letter-spacing="2"');
  // scale bar (0–5 m)
  const sbx = pcx - 2.5 * ps, sby = pcy + (platform.half + 3.3) * ps;
  for (let i = 0; i < 5; i++) g += rect(sbx + i * ps, sby, ps, 5, 0.8, i % 2 ? "" : ' fill="#000"');
  g += text(sbx, sby + 20, "0", 11, "middle") + text(sbx + 5 * ps, sby + 20, "5 m", 11, "middle");

  // ---- title block (bottom right)
  g += line(1040, 900, 1380, 900, 0.9);
  g += text(1380, 892, "KHUÊ VĂN CÁC · MẶT ĐỨNG CHÍNH", 15, "end", ' letter-spacing="3"');
  g += text(1380, 918, "Văn Miếu – Quốc Tử Giám, Hà Nội · dựng năm 1805", 12, "end", ' font-style="italic"');

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
    `<rect width="${W}" height="${H}" fill="#fff"/>` +
    `<g fill="none" stroke="#000" stroke-linecap="round" stroke-linejoin="round" font-family="'EB Garamond', Georgia, 'Times New Roman', serif">${g}</g>` +
    `</svg>`
  );
}
