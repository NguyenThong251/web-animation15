// Vietnamese hipped roof (mái chảy / mái chồng diêm) as one merged geometry:
// four concave slopes whose eave corners lift and kick outward (đầu đao), a thickness
// with an eave fascia, raised hip beads ending in curled hooks, a ridge bead with
// hooked end ornaments (kìm nóc), an optional central "sun" ornament and a finial.
//
// Local frame: eave line at y = 0 (corners rise by `lift`), top at y = `height`.
// The eave rectangle has half extents (hx, hz); the top is the rectangle (ix, iz):
//   ix > 0, iz = 0      → classic hip roof with a ridge along X
//   ix = iz = 0         → pyramid (square pavilions) — gets a finial
//   ix > 0 and iz > 0   → skirt roof (lower tier of a two-tier roof), open at the top
import { GeoBag, lerp, clamp } from "./util.js";

const smooth01 = (t) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};

/** Scale each ring of a TubeGeometry around its centre-line point by f(u), u ∈ [0, 1]. */
function taperTube(THREE, geo, curve, segs, radial, f) {
  const p = geo.attributes.position;
  const c = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    curve.getPointAt(i / segs, c);
    const k = f(i / segs);
    for (let j = 0; j <= radial; j++) {
      const v = i * (radial + 1) + j;
      p.setXYZ(v, c.x + (p.getX(v) - c.x) * k, c.y + (p.getY(v) - c.y) * k, c.z + (p.getZ(v) - c.z) * k);
    }
  }
  geo.computeVertexNormals();
}

const CORNERS = [
  [-1, 1],
  [1, 1],
  [1, -1],
  [-1, -1],
];

export function hipRoof(THREE, o) {
  const {
    hx,
    hz,
    ix = 0,
    iz = 0,
    height,
    lift = 0.4, // corner upturn (m)
    flare = 0.3, // corner outward kick (m)
    reach = 2.2, // how far from a corner the upturn spreads along the eave (m)
    sag = 0.42, // 0 = straight slope, → 1 = strongly concave (flat eaves, steep top)
    thickness = 0.22,
    segS = 16,
    segT = 8,
    tile = 0, // tile channel pitch along the eave (m), 0 = smooth
    tileDepth = 0.05,
    bead = 0.09, // hip / ridge bead radius (0 = none)
    curl = 0.6, // size of the hooked corner curls (0 = none)
    ridgeOrnament = 0.6, // size of the hooked ridge-end ornaments (0 = none)
    sun = 0, // radius of a central ridge disc ornament (0 = none)
    finial = 0, // height of a gourd finial for pyramids (0 = none)
    beadSegs = 28, // tube segments along a hip bead with its hook
  } = o;

  const bag = new GeoBag(THREE);
  const C = CORNERS.map(([sx, sz]) => [sx * hx, sz * hz]);
  const T = CORNERS.map(([sx, sz]) => [sx * ix, sz * iz]);
  const profile = (t) => (1 - sag) * t + sag * t * t; // concave: slope grows toward the top

  // Surface point of slope k at (s along the eave, t from eave → top).
  function point(k, s, t, withTile, nTiles, out) {
    const k1 = (k + 1) % 4;
    const L = Math.hypot(C[k1][0] - C[k][0], C[k1][1] - C[k][1]);
    const R = Math.min(reach, L / 2);
    const d0 = s * L, d1 = (1 - s) * L;
    // corner weights: 1 at the corner, 0 beyond `reach` — identical for both slopes sharing a corner
    const w0 = d0 < R ? (1 - d0 / R) ** 2 : 0;
    const w1 = d1 < R ? (1 - d1 / R) ** 2 : 0;
    const fall = Math.max(0, 1 - t) ** 2.4; // upturn and kick concentrate at the eave
    const bx = lerp(C[k][0], C[k1][0], s), bz = lerp(C[k][1], C[k1][1], s);
    const tx = lerp(T[k][0], T[k1][0], s), tz = lerp(T[k][1], T[k1][1], s);
    const ox = flare * (w0 * CORNERS[k][0] + w1 * CORNERS[k1][0]);
    const oz = flare * (w0 * CORNERS[k][1] + w1 * CORNERS[k1][1]);
    let y = height * profile(t) + lift * (w0 + w1) * fall;
    if (withTile && nTiles > 0) {
      // channels of tiles running down the slope; zero on the hips so slopes still meet
      y += tileDepth * 0.5 * (1 - Math.cos(2 * Math.PI * nTiles * s)) * (1 - t ** 6);
    }
    out[0] = lerp(bx, tx, t) + ox * fall;
    out[1] = y;
    out[2] = lerp(bz, tz, t) + oz * fall;
    return out;
  }

  const tmp = [0, 0, 0];
  // one slope as an indexed grid; `under` = soffit (offset down, reversed winding, no tiles)
  const grid = (k, ns, nt, nTiles, under) => {
    const cols = ns + 1, rows = nt + 1;
    const pos = new Float32Array(cols * rows * 3);
    const uv = new Float32Array(cols * rows * 2);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const v = j * cols + i;
        point(k, i / ns, j / nt, !under, nTiles, tmp);
        if (under) tmp[1] -= thickness;
        pos.set(tmp, v * 3);
        uv[v * 2] = i / ns;
        uv[v * 2 + 1] = j / nt;
      }
    }
    const idx = [];
    for (let j = 0; j < nt; j++) {
      for (let i = 0; i < ns; i++) {
        const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
        if (under) idx.push(a, c, b, c, d, b);
        else idx.push(a, b, c, c, b, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };

  for (let k = 0; k < 4; k++) {
    const k1 = (k + 1) % 4;
    const L = Math.hypot(C[k1][0] - C[k][0], C[k1][1] - C[k][1]);
    const nTiles = tile > 0 ? Math.max(2, Math.round(L / tile)) : 0;
    const ns = nTiles ? Math.max(segS, nTiles * 4) : segS;
    bag.add(grid(k, ns, segT, nTiles, false));
    bag.add(grid(k, segS, Math.max(2, segT >> 1), 0, true));
    // eave fascia (the visible thickness along the eave line)
    const fas = new Float32Array((ns + 1) * 2 * 3);
    for (let i = 0; i <= ns; i++) {
      point(k, i / ns, 0, true, nTiles, tmp);
      fas.set(tmp, i * 6);
      point(k, i / ns, 0, false, 0, tmp);
      tmp[1] -= thickness;
      fas.set(tmp, i * 6 + 3);
    }
    const fIdx = [];
    for (let i = 0; i < ns; i++) {
      const t0 = i * 2, b0 = t0 + 1, t1 = t0 + 2, b1 = t0 + 3;
      fIdx.push(b0, b1, t0, t0, b1, t1);
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute("position", new THREE.BufferAttribute(fas, 3));
    fg.setIndex(fIdx);
    fg.computeVertexNormals();
    bag.add(fg);
  }

  const up = new THREE.Vector3(0, 1, 0);

  // hip beads with hooked corner curls (đầu đao): a tube along each hip that runs past the
  // corner into an upturned hook, fattest at the corner and thinning to the curled tip
  if (bead > 0) {
    for (let k = 0; k < 4; k++) {
      const pts = [];
      const dn = new THREE.Vector3(CORNERS[k][0], 0, CORNERS[k][1]).normalize();
      const E = new THREE.Vector3(...point(k, 0, 0, false, 0, tmp)).addScaledVector(up, bead * 0.6);
      if (curl > 0) {
        // (outward, up) offsets of the hook, tip first so the tube runs tip → corner → top
        const hook = [
          [0.3, 1.0],
          [0.52, 0.94],
          [0.64, 0.7],
          [0.56, 0.38],
          [0.3, 0.12],
        ];
        for (const [a, b] of hook) pts.push(E.clone().addScaledVector(dn, a * curl).addScaledVector(up, b * curl));
      }
      const hookPts = pts.length;
      const steps = 8;
      for (let j = 0; j <= steps; j++) {
        const t = (j / steps) * (iz > 0 && ix > 0 ? 1 : 0.97);
        pts.push(new THREE.Vector3(...point(k, 0, t, false, 0, tmp)).addScaledVector(up, bead * 0.6));
      }
      const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
      const segs = curl > 0 ? beadSegs : Math.max(6, beadSegs >> 1);
      const radial = 6;
      const tube = new THREE.TubeGeometry(curve, segs, bead, radial, false);
      if (curl > 0) {
        let hookLen = 0, total = 0;
        for (let i = 1; i < pts.length; i++) {
          const d = pts[i].distanceTo(pts[i - 1]);
          total += d;
          if (i <= hookPts) hookLen += d;
        }
        const hf = hookLen / total;
        taperTube(THREE, tube, curve, segs, radial, (u) =>
          u < hf ? 0.55 + 1.35 * smooth01(u / hf) : 1.9 - 0.9 * smooth01((u - hf) / 0.25),
        );
        bag.add(new THREE.SphereGeometry(bead * 0.95, 8, 6), { x: pts[0].x, y: pts[0].y, z: pts[0].z });
      }
      bag.add(tube);
    }
  }

  // ridge bead + hooked ridge-end ornaments (kìm nóc)
  if (ix > 0 && iz === 0 && bead > 0) {
    const r = bead * 1.25;
    bag.add(new THREE.BoxGeometry(ix * 2 + r * 2, r * 2.2, r * 2.2), { y: height + r * 0.7 });
    if (ridgeOrnament > 0) {
      for (const side of [-1, 1]) {
        const g = ridgeHook(THREE, ridgeOrnament, r * 1.6);
        bag.add(g, { x: side * ix, y: height + r * 0.4, ry: side > 0 ? 0 : Math.PI });
      }
    }
    if (sun > 0) bag.add(sunOrnament(THREE, sun, r * 1.6), { y: height + r * 1.6 });
  }

  if (ix === 0 && iz === 0 && finial > 0) {
    bag.add(gourd(THREE, finial), { y: height - 0.05 });
  }

  return bag.merge();
}

/** Hooked ridge-end ornament (stylised dragon-tail "kìm"), extruded flat, pointing +X. */
function ridgeHook(THREE, size, depth) {
  const s = new THREE.Shape();
  const p = (x, y) => new THREE.Vector2(x * size, y * size);
  s.moveTo(-0.25 * size, 0);
  s.lineTo(0.18 * size, 0);
  s.splineThru([p(0.36, 0.12), p(0.46, 0.36), p(0.44, 0.62), p(0.3, 0.82), p(0.1, 0.9), p(-0.06, 0.82)]);
  s.splineThru([p(0.02, 0.72), p(0.16, 0.7), p(0.26, 0.56), p(0.26, 0.4), p(0.16, 0.26), p(-0.02, 0.2)]);
  s.lineTo(-0.25 * size, 0.14 * size);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, {
    depth,
    bevelEnabled: true,
    bevelThickness: depth * 0.2,
    bevelSize: depth * 0.12,
    bevelSegments: 1,
    curveSegments: 6,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** Ridge-centre disc with a flame ring (the "moon" of lưỡng long chầu nguyệt). */
function sunOrnament(THREE, radius, depth) {
  const s = new THREE.Shape();
  const n = 12;
  for (let i = 0; i <= n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2;
    const r = i % 2 ? radius * 1.32 : radius * 1.05;
    const x = Math.cos(a) * r, y = Math.sin(a) * r + radius * 1.2;
    i ? s.lineTo(x, y) : s.moveTo(x, y);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 4 });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** Bottle-gourd finial (hồ lô) for pyramid roofs. */
export function gourd(THREE, h) {
  const pts = [
    [0.0, 0],
    [0.16, 0.02],
    [0.2, 0.1],
    [0.12, 0.2],
    [0.2, 0.3],
    [0.3, 0.45],
    [0.27, 0.6],
    [0.13, 0.7],
    [0.17, 0.78],
    [0.13, 0.88],
    [0.05, 0.96],
    [0.0, 1.0],
  ].map(([r, y]) => new THREE.Vector2(r * h * 0.55, y * h));
  return new THREE.LatheGeometry(pts, 12);
}
