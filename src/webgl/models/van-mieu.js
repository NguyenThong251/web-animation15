// Văn Miếu – Quốc Tử Giám (文廟 – 國子監), procedural, metres, Y up.
// Five walled courtyards in a row along Z (entrance at +Z):
//   1  Văn Miếu môn (+140, with the two trụ biểu in front) → Đại Trung môn (+80)
//   2  avenue of trees → Khuê Văn Các (+22), flanked by the small Bí Văn / Súc Văn gates
//   3  Thiên Quang well (origin) between the two stele houses (2 × 41 steles on turtles)
//   4  Đại Thành môn (−30) → Đại Bái đường + Thượng điện, side halls
//   5  Thái Học môn (−85) → Thái Học hall with bell and drum towers, back wall (−150)
// The real precinct is ~350 m long; Z is compressed a little but the order is exact.
import { GeoBag, rng, whiteMaterial, mesh, roughen, disposeTree } from "./util.js";
import { hipRoof } from "./roof.js";
import { buildKhueVanCacGeometry, KVC } from "./khue-van-cac.js";
import { steleInstanceGeometry } from "./stele.js";

export const LAYOUT = {
  halfWidth: 36,
  wallH: 2.7,
  front: 140,
  daiTrungMon: 80,
  khueVanCac: 22,
  daiThanhMon: -30,
  thaiHocMon: -85,
  back: -150,
  well: { inner: 12, curb: 12.9, water: -0.55 },
  steleHouse: { x: 20, z: -2, length: 44 },
};

/* ------------------------------------------------------------------------------------------
 * shape helpers
 * ---------------------------------------------------------------------------------------- */
function roundedRect(THREE, target, h, r) {
  target.moveTo(-h + r, -h);
  target.lineTo(h - r, -h);
  target.absarc(h - r, -h + r, r, -Math.PI / 2, 0, false);
  target.lineTo(h, h - r);
  target.absarc(h - r, h - r, r, 0, Math.PI / 2, false);
  target.lineTo(-h + r, h);
  target.absarc(-h + r, h - r, r, Math.PI / 2, Math.PI, false);
  target.lineTo(-h, -h + r);
  target.absarc(-h + r, -h + r, r, Math.PI, Math.PI * 1.5, false);
  return target;
}

/** Ring between two rounded squares, extruded `depth` up from y = y0 (lies flat). */
function roundedRing(THREE, hOut, rOut, hIn, rIn, depth, y0, segs) {
  const s = roundedRect(THREE, new THREE.Shape(), hOut, rOut);
  s.holes.push(roundedRect(THREE, new THREE.Path(), hIn, rIn));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: segs });
  g.rotateX(-Math.PI / 2); // extrusion +Z → +Y
  g.translate(0, y0, 0);
  return g;
}

/**
 * Wall elevation with openings cut from the ground: openings = [{ x, w, spring, arch }]
 * (arch → semicircular head, else flat head at `spring`). Extruded through `depth` along Z.
 */
function wallWithOpenings(THREE, width, height, depth, openings, segs = 10) {
  const s = new THREE.Shape();
  s.moveTo(-width / 2, 0);
  for (const o of [...openings].sort((a, b) => a.x - b.x)) {
    s.lineTo(o.x - o.w / 2, 0);
    s.lineTo(o.x - o.w / 2, o.spring);
    if (o.arch) s.absarc(o.x, o.spring, o.w / 2, Math.PI, 0, true);
    else s.lineTo(o.x + o.w / 2, o.spring);
    s.lineTo(o.x + o.w / 2, 0);
  }
  s.lineTo(width / 2, 0);
  s.lineTo(width / 2, height);
  s.lineTo(-width / 2, height);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: segs });
  g.translate(0, 0, -depth / 2);
  return g;
}

/* ------------------------------------------------------------------------------------------
 * buildings
 * ---------------------------------------------------------------------------------------- */

/** Văn Miếu môn: three-arch masonry gate with a two-tier roof, plus the two trụ biểu. */
function vanMieuMon(THREE, bag, z0, tile) {
  const W = 13, D = 4.2, Hh = 4.5;
  bag.add(
    wallWithOpenings(THREE, W, Hh, D, [
      { x: -3.75, w: 1.7, spring: 1.95, arch: true },
      { x: 0, w: 2.7, spring: 2.4, arch: true },
      { x: 3.75, w: 1.7, spring: 1.95, arch: true },
    ], 14),
    { z: z0 },
  );
  // plinth strips between the openings and a cornice
  for (const [x0, x1] of [
    [-W / 2 - 0.2, -4.6],
    [-2.9, -1.35],
    [1.35, 2.9],
    [4.6, W / 2 + 0.2],
  ]) bag.boxMinMax(x0, 0, z0 - D / 2 - 0.15, x1, 0.4, z0 + D / 2 + 0.15);
  bag.boxOn(W + 0.5, 0.28, D + 0.5, 0, Hh, z0);
  // name plaque over the central arch (both faces)
  for (const s of [-1, 1]) bag.boxOn(2.4, 0.75, 0.08, 0, 3.55, z0 + s * (D / 2 + 0.04));
  bag.add(
    hipRoof(THREE, { hx: W / 2 + 1.0, hz: D / 2 + 1.15, ix: 3.4, iz: 1.35, height: 0.95, lift: 0.5, flare: 0.42, reach: 2.0, sag: 0.3, thickness: 0.22, tile, segS: 14, segT: 6, curl: 0.58, bead: 0.09, beadSegs: 22 }),
    { y: Hh + 0.28, z: z0 },
  );
  // upper storey with three small windows a side
  bag.boxOn(6.4, 1.95, 2.5, 0, Hh + 0.28, z0);
  for (const s of [-1, 1]) for (const x of [-2, 0, 2]) bag.boxOn(0.9, 0.9, 0.06, x, Hh + 0.75, z0 + s * 1.27);
  bag.add(
    hipRoof(THREE, { hx: 4.15, hz: 2.35, ix: 2.0, iz: 0, height: 1.75, lift: 0.5, flare: 0.36, reach: 1.8, sag: 0.45, thickness: 0.2, tile, segS: 14, segT: 6, curl: 0.55, bead: 0.09, beadSegs: 22, ridgeOrnament: 0.85, sun: 0.3 }),
    { y: Hh + 2.1, z: z0 },
  );
  // trụ biểu: two tall pillars with lantern heads, in front of the gate
  for (const s of [-1, 1]) {
    const x = s * 8.8, z = z0 + 7.5;
    bag.boxOn(1.5, 0.5, 1.5, x, 0, z);
    bag.boxOn(0.85, 6.4, 0.85, x, 0.5, z);
    bag.boxOn(1.05, 0.16, 1.05, x, 6.9, z);
    for (const dx of [-0.36, 0.36]) for (const dz of [-0.36, 0.36]) bag.boxOn(0.16, 0.9, 0.16, x + dx, 7.06, z + dz);
    bag.boxOn(0.48, 0.9, 0.48, x, 7.06, z);
    bag.boxOn(1.12, 0.12, 1.12, x, 7.96, z);
    bag.add(
      hipRoof(THREE, { hx: 0.8, hz: 0.8, ix: 0, iz: 0, height: 0.55, lift: 0.14, flare: 0.1, reach: 0.45, sag: 0.4, thickness: 0.08, segS: 6, segT: 4, bead: 0.04, curl: 0.22, beadSegs: 14, finial: 0.8 }),
      { x, y: 8.08, z },
    );
  }
}

/** Timber gate-hall (Đại Trung môn, Đại Thành môn, Thái Học môn): 3 doors under a hip roof. */
function gateHall(THREE, bag, z0, { W = 10, D = 5, sun = 0, tile = 0 } = {}) {
  bag.boxOn(W + 1.6, 0.45, D + 1.6, 0, 0, z0);
  bag.add(
    wallWithOpenings(THREE, W, 3.6, 0.4, [
      { x: -W * 0.32, w: 1.7, spring: 2.6 },
      { x: 0, w: 2.3, spring: 3.0 },
      { x: W * 0.32, w: 1.7, spring: 2.6 },
    ]),
    { y: 0.45, z: z0 },
  );
  const n = 6;
  for (const zs of [-D / 2, D / 2]) {
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + (i * W) / (n - 1);
      bag.add(new THREE.CylinderGeometry(0.19, 0.22, 3.6, 10), { x, y: 0.45 + 1.8, z: z0 + zs });
    }
    bag.boxOn(W + 0.5, 0.34, 0.34, 0, 4.05, z0 + zs);
  }
  for (let i = 0; i < n; i++) bag.boxOn(0.3, 0.3, D, -W / 2 + (i * W) / (n - 1), 4.05, z0);
  bag.add(
    hipRoof(THREE, {
      hx: W / 2 + 1.4,
      hz: D / 2 + 1.5,
      ix: W / 2 - D / 2 + 0.3,
      iz: 0,
      height: (D / 2 + 1.5) * 0.8,
      lift: 0.55,
      flare: 0.45,
      reach: 2.3,
      sag: 0.42,
      thickness: 0.22,
      tile,
      segS: 14,
      segT: 6,
      curl: 0.6,
      bead: 0.1,
      ridgeOrnament: 0.95,
      sun,
    }),
    { y: 4.25, z: z0 },
  );
}

/** Small masonry arch gate with a crest (Thành Đức, Đạt Tài, Bí Văn, Súc Văn …). */
function smallGate(THREE, bag, x0, z0) {
  bag.add(wallWithOpenings(THREE, 3.0, 3.9, 0.8, [{ x: 0, w: 1.3, spring: 2.25, arch: true }], 12), { x: x0, z: z0 });
  bag.boxOn(3.35, 0.22, 1.05, x0, 3.9, z0);
  for (const s of [-1, 1]) {
    bag.boxOn(0.6, 0.9, 0.85, x0 + s * 1.12, 4.12, z0);
    bag.boxOn(0.76, 0.12, 1.0, x0 + s * 1.12, 5.02, z0);
  }
  // crest panel with a rounded top between the two piers
  const c = new THREE.Shape();
  c.moveTo(-0.82, 0);
  c.lineTo(0.82, 0);
  c.lineTo(0.82, 0.45);
  c.quadraticCurveTo(0.6, 0.62, 0.42, 0.62);
  c.quadraticCurveTo(0.2, 0.95, 0, 0.98);
  c.quadraticCurveTo(-0.2, 0.95, -0.42, 0.62);
  c.quadraticCurveTo(-0.6, 0.62, -0.82, 0.45);
  c.closePath();
  const cg = new THREE.ExtrudeGeometry(c, { depth: 0.36, bevelEnabled: false, curveSegments: 6 });
  cg.translate(0, 0, -0.18);
  bag.add(cg, { x: x0, y: 4.12, z: z0 });
}

/** Hall on a platform: enclosed body, front colonnade, hip roof (optionally two tiers). */
function hall(THREE, { w, d, h, twoTier = false, sun = 0, tile = 0 }) {
  const bag = new GeoBag(THREE);
  bag.boxOn(w + 2, 0.5, d + 2, 0, 0, 0);
  bag.boxOn(w, h, d - 2.4, 0, 0.5, -0.4);
  const nCols = Math.max(2, Math.round(w / 3.4) + 1);
  for (let i = 0; i < nCols; i++) {
    const x = -w / 2 + (i * w) / (nCols - 1);
    bag.add(new THREE.CylinderGeometry(0.22, 0.25, h, 10), { x, y: 0.5 + h / 2, z: d / 2 - 0.35 });
  }
  bag.boxOn(w + 0.4, 0.35, 0.4, 0, 0.5 + h - 0.35, d / 2 - 0.35);
  const eave = 0.5 + h;
  const R = { lift: 0.6, flare: 0.5, reach: 2.6, sag: 0.42, thickness: 0.24, tile, segS: 12, segT: 6, curl: 0.62, bead: 0.11, beadSegs: 18 };
  if (!twoTier) {
    bag.add(
      hipRoof(THREE, { ...R, hx: w / 2 + 1.4, hz: d / 2 + 1.4, ix: Math.max(0.6, w / 2 - d / 2), iz: 0, height: (d / 2 + 1.4) * 0.82, ridgeOrnament: 1.1, sun }),
      { y: eave },
    );
  } else {
    bag.add(
      hipRoof(THREE, { ...R, hx: w / 2 + 1.4, hz: d / 2 + 1.4, ix: Math.max(0.5, w / 2 - 1.1), iz: Math.max(0.5, d / 2 - 1.1), height: 1.05, sag: 0.3 }),
      { y: eave },
    );
    bag.boxOn(Math.max(1, w - 2.2), 1.5, Math.max(1, d - 2.2), 0, eave + 0.7, 0);
    const pyramid = Math.abs(w - d) < 0.01;
    bag.add(
      hipRoof(THREE, {
        ...R,
        hx: w / 2 + 0.3,
        hz: d / 2 + 0.3,
        ix: pyramid ? 0 : Math.max(0.6, w / 2 - d / 2),
        iz: 0,
        height: (d / 2 + 0.3) * 0.85,
        ridgeOrnament: pyramid ? 0 : 1.0,
        finial: pyramid ? 1.0 : 0,
        sun,
      }),
      { y: eave + 2.1 },
    );
  }
  return bag.merge();
}

/** Brick wall segment along X or Z, with a coping and a tiled ridge. */
function wallSeg(bag, x0, z0, x1, z1, h) {
  const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  const len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
  if (len < 0.05) return;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const ry = alongX ? 0 : Math.PI / 2;
  bag.boxOn(len, h, 0.6, cx, 0, cz, ry);
  bag.boxOn(len + 0.1, 0.16, 0.95, cx, h, cz, ry);
  bag.boxOn(len, 0.14, 0.38, cx, h + 0.16, cz, ry);
}

/** Wall across the precinct at z, from −half to +half, leaving the given x gaps open. */
function crossWall(bag, z, half, gaps, h) {
  const sorted = [...gaps].sort((a, b) => a[0] - b[0]);
  let x = -half;
  for (const [g0, g1] of sorted) {
    wallSeg(bag, x, z, g0, z, h);
    x = g1;
  }
  wallSeg(bag, x, z, half, z, h);
}

/* ------------------------------------------------------------------------------------------
 * Thiên Quang well
 * ---------------------------------------------------------------------------------------- */
function well(THREE, bag, hi) {
  const { inner, curb } = LAYOUT.well;
  const segs = hi ? 10 : 6;
  // basin walls + stone curb (top 5 cm above the lawn)
  bag.add(roundedRing(THREE, curb, 3.4, inner, 2.5, 1.25, -1.2, segs));
  // low balustrade: parapet, coping, square posts with caps
  bag.add(roundedRing(THREE, 12.75, 3.3, 12.45, 3.0, 0.55, 0.05, segs));
  bag.add(roundedRing(THREE, 12.86, 3.4, 12.34, 2.9, 0.1, 0.6, segs));
  const path = roundedRect(THREE, new THREE.Shape(), 12.6, 3.15);
  const per = path.getLength();
  const n = Math.round(per / 2.45);
  const pts = path.getSpacedPoints(n);
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    // shape y → world −z (the ring geometry was rotated the same way)
    const tx0 = q.x - p.x, tz0 = -(q.y - p.y);
    const tl = Math.hypot(tx0, tz0) || 1;
    const tx = tx0 / tl, tz = tz0 / tl;
    const ry = Math.atan2(-tz, tx); // local X along the tangent
    bag.boxOn(0.34, 0.98, 0.34, p.x, 0.05, -p.y, ry);
    bag.boxOn(0.44, 0.1, 0.44, p.x, 1.03, -p.y, ry);
    bag.boxOn(0.2, 0.14, 0.2, p.x, 1.13, -p.y, ry);
    if (hi) {
      // round pierced-panel medallions on the outer face of the parapet between posts
      const mx = (p.x + q.x) / 2, mz = -(p.y + q.y) / 2;
      let nx = tz, nz = -tx;
      if (nx * mx + nz * mz < 0) (nx = -nx), (nz = -nz);
      for (const k of [-0.55, 0, 0.55]) {
        bag.add(new THREE.TorusGeometry(0.15, 0.035, 4, 10), {
          x: mx + tx * k + nx * 0.16,
          y: 0.33,
          z: mz + tz * k + nz * 0.16,
          ry: Math.atan2(nx, nz),
        });
      }
    }
  }
}

/* ------------------------------------------------------------------------------------------
 * trees: three low-poly templates, instanced; "far" copies (woods outside the walls) are coarser
 * ---------------------------------------------------------------------------------------- */
const TREE_KINDS = [
  { trunk: [0.32, 0.46, 5.4], blobs: [[0, 7.4, 0, 3.3], [2.1, 6.5, 0.8, 2.4], [-1.9, 6.7, -0.9, 2.5], [0.4, 9.2, -0.3, 2.3]] },
  { trunk: [0.26, 0.38, 7.0], blobs: [[0, 8.4, 0, 2.5], [0.3, 10.4, 0.2, 2.1], [-0.5, 6.9, 0.6, 2.2], [0.2, 12.0, 0, 1.5]] },
  { trunk: [0.42, 0.62, 4.6], blobs: [[0, 6.6, 0, 3.1], [3.1, 6.0, 0.5, 2.6], [-3.1, 6.2, -0.3, 2.7], [0.3, 7.6, 0, 2.6]] },
];

function treeGeometry(THREE, kind, detail, seed) {
  const bag = new GeoBag(THREE);
  const { trunk, blobs } = TREE_KINDS[kind];
  bag.add(new THREE.CylinderGeometry(trunk[0], trunk[1], trunk[2], detail ? 7 : 5, 1, true), { y: trunk[2] / 2 });
  if (detail) {
    // two limbs reaching into the crown
    bag.add(new THREE.CylinderGeometry(trunk[0] * 0.5, trunk[0] * 0.75, trunk[2] * 0.6, 5, 1, true), { x: 0.5, y: trunk[2] * 0.95, rz: -0.5 });
    bag.add(new THREE.CylinderGeometry(trunk[0] * 0.5, trunk[0] * 0.75, trunk[2] * 0.55, 5, 1, true), { x: -0.45, y: trunk[2] * 0.9, z: 0.2, rz: 0.55 });
  }
  const crown = new GeoBag(THREE);
  for (const [x, y, z, r] of blobs) crown.add(new THREE.IcosahedronGeometry(r, detail ? 1 : 0), { x, y, z });
  const crownGeo = crown.merge();
  roughen(THREE, crownGeo, detail ? 0.5 : 0.35, 0.42, seed);
  bag.add(crownGeo);
  return bag.merge();
}

/** Deterministic tree layout: avenues in courtyards 1–2, groves around the halls, woods outside. */
function treeLayout(hi) {
  const r = rng(1070);
  const L = LAYOUT;
  const trees = []; // [x, z, scale, yaw, kind, far]
  const add = (x, z, s, kind, far = false) => trees.push([x, z, s, r() * Math.PI * 2, kind, far]);
  // avenues: two lines each side of the central path, clear of the axis view
  for (const [z0, z1] of [
    [L.daiTrungMon + 7, L.front - 6],
    [L.khueVanCac + 9, L.daiTrungMon - 6],
  ]) {
    for (const side of [-1, 1]) {
      for (const col of [15, 27]) {
        for (let z = z0 + (col === 27 ? 5 : 0); z < z1; z += hi ? 11 : 16) {
          if (r() < 0.2) continue;
          add(side * (col + (r() - 0.5) * 2), z + (r() - 0.5) * 3, 0.72 + r() * 0.3, r() < 0.6 ? 0 : 2);
        }
      }
    }
  }
  // courtyard 3: between the stele houses and the side walls
  for (const side of [-1, 1]) for (let z = -20; z <= 16; z += hi ? 12 : 18) add(side * (30 + (r() - 0.5) * 1.5), z, 0.72 + r() * 0.2, 1);
  // courtyards 4–5: a few big trees near the corners
  for (const [x, z] of [
    [-30, -37],
    [30, -38],
    [-29, -78],
    [30, -79],
    [-13, -93],
    [14, -95],
    [-30, -141],
    [30, -140],
  ]) add(x + (r() - 0.5) * 2, z + (r() - 0.5) * 2, 0.8 + r() * 0.3, r() < 0.5 ? 0 : 2);
  // woods outside the walls (both long sides and the back), Poisson-ish by rejection
  const outside = [];
  const want = hi ? 90 : 45;
  const minD = hi ? 9 : 12;
  for (let tries = 0; outside.length < want && tries < want * 40; tries++) {
    let x, z;
    if (r() < 0.82) {
      x = (r() < 0.5 ? -1 : 1) * (42 + r() * 50);
      z = -200 + r() * 350;
    } else {
      x = -92 + r() * 184;
      z = -158 - r() * 45;
    }
    if (outside.every(([ox, oz]) => (ox - x) ** 2 + (oz - z) ** 2 > minD * minD)) outside.push([x, z]);
  }
  for (const [x, z] of outside) add(x, z, 0.9 + r() * 0.6, Math.floor(r() * 3), true);
  return trees;
}

/* ------------------------------------------------------------------------------------------
 * main builder
 * ---------------------------------------------------------------------------------------- */
export function buildVanMieu(THREE, { quality = "high" } = {}) {
  const hi = quality !== "low";
  const L = LAYOUT;
  const tile = hi ? 0.42 : 0;
  const mat = whiteMaterial(THREE);
  mat.name = "van-mieu";
  const group = new THREE.Group();
  group.name = "van-mieu";
  const complex = []; // meshes that define the bounds

  const addMesh = (geo, name, opts) => {
    const m = mesh(THREE, geo, mat, name, opts);
    group.add(m);
    return m;
  };

  // ---- ground: a large lawn with the well cut out
  const groundShape = new THREE.Shape();
  groundShape.moveTo(-320, -420);
  groundShape.lineTo(320, -420);
  groundShape.lineTo(320, 420);
  groundShape.lineTo(-320, 420);
  groundShape.closePath();
  groundShape.holes.push(roundedRect(THREE, new THREE.Path(), L.well.curb - 0.02, 3.4));
  const groundGeo = new THREE.ShapeGeometry(groundShape, hi ? 10 : 6);
  groundGeo.rotateX(-Math.PI / 2);
  addMesh(groundGeo, "ground", { cast: false, receive: true });

  // ---- Thiên Quang well: basin, balustrade, and the water as its own mesh
  const wellBag = new GeoBag(THREE);
  well(THREE, wellBag, hi);
  complex.push(addMesh(wellBag.merge(), "well"));
  const waterGeo = new THREE.ShapeGeometry(roundedRect(THREE, new THREE.Shape(), L.well.inner + 0.05, 2.5), hi ? 10 : 6);
  waterGeo.rotateX(-Math.PI / 2);
  waterGeo.translate(0, L.well.water, 0);
  // darker and smoother than stone so the basin reads as water under one light (engine may restyle)
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x8c8c8c, roughness: 0.22, metalness: 0 });
  waterMat.name = "water";
  const water = mesh(THREE, waterGeo, waterMat, "water", { cast: false, receive: true });
  group.add(water);

  // ---- Khuê Văn Các (kept as its own positioned mesh so the engine can find it)
  const kvc = addMesh(buildKhueVanCacGeometry(THREE, { quality }), "khue-van-cac");
  kvc.position.z = L.khueVanCac;
  complex.push(kvc);

  // ---- gates
  const vmm = new GeoBag(THREE);
  vanMieuMon(THREE, vmm, L.front, tile);
  complex.push(addMesh(vmm.merge(), "van-mieu-mon"));

  const gates = new GeoBag(THREE);
  gateHall(THREE, gates, L.daiTrungMon, { W: 10, D: 5, tile });
  gateHall(THREE, gates, L.daiThanhMon, { W: 12, D: 6, sun: 0.42, tile });
  gateHall(THREE, gates, L.thaiHocMon, { W: 9, D: 5, tile: 0 });
  for (const s of [-1, 1]) {
    smallGate(THREE, gates, s * 12.5, L.daiTrungMon); // Thành Đức môn, Đạt Tài môn
    smallGate(THREE, gates, s * 11, L.khueVanCac); // Bí Văn môn, Súc Văn môn
    smallGate(THREE, gates, s * 13.5, L.daiThanhMon); // Kim Thanh môn, Ngọc Chấn môn
  }
  complex.push(addMesh(gates.merge(), "gates"));

  // ---- perimeter and cross walls
  const walls = new GeoBag(THREE);
  const hw = L.halfWidth, wh = L.wallH;
  wallSeg(walls, -hw, L.back, -hw, L.front, wh);
  wallSeg(walls, hw, L.back, hw, L.front, wh);
  wallSeg(walls, -hw - 0.3, L.back, hw + 0.3, L.back, wh);
  crossWall(walls, L.front, hw + 0.3, [[-6.4, 6.4]], wh);
  crossWall(walls, L.daiTrungMon, hw, [[-5, 5], [-14, -11], [11, 14]], wh);
  crossWall(walls, L.khueVanCac, hw, [[-KVC.platform.half, KVC.platform.half], [-12.5, -9.5], [9.5, 12.5]], wh);
  crossWall(walls, L.daiThanhMon, hw, [[-6, 6], [-15, -12], [12, 15]], wh);
  crossWall(walls, L.thaiHocMon, hw, [[-4.5, 4.5]], wh);
  complex.push(addMesh(walls.merge(), "walls"));

  // ---- paved paths (6 cm proud of the lawn)
  const paths = new GeoBag(THREE);
  const pave = (x0, z0, x1, z1) => paths.boxMinMax(x0, 0, z0, x1, 0.06, z1);
  pave(-1.6, L.daiTrungMon + 4, 1.6, L.front - 2.6);
  pave(-1.6, L.khueVanCac + 5.4, 1.6, L.daiTrungMon - 4);
  pave(-1.6, L.well.curb + 0.4, 1.6, L.khueVanCac - 5.4);
  for (const s of [-1, 1]) {
    pave(s * 13.6, -L.well.curb - 0.4, s * 15.4, L.well.curb + 0.4);
    pave(Math.min(s * 1.6, s * 15.4), L.well.curb + 0.4, Math.max(s * 1.6, s * 15.4), L.well.curb + 1.8);
    pave(Math.min(s * 1.6, s * 15.4), -L.well.curb - 1.8, Math.max(s * 1.6, s * 15.4), -L.well.curb - 0.4);
  }
  pave(-1.6, L.daiThanhMon + 3.9, 1.6, -L.well.curb - 1.8);
  pave(-1.6, -40.5, 1.6, L.daiThanhMon - 3.9);
  pave(-1.6, -110, 1.6, L.thaiHocMon - 3.5);
  addMesh(paths.merge(), "paths");

  // ---- stele houses (long open roofs on columns), 2 × 41 steles on turtles
  const houses = new GeoBag(THREE);
  const SH = L.steleHouse;
  for (const side of [-1, 1]) {
    const c = side * SH.x;
    houses.boxOn(6.6, 0.25, SH.length + 1, c, 0, SH.z);
    for (let z = SH.z - SH.length / 2 + 1; z <= SH.z + SH.length / 2 - 1 + 1e-6; z += 4) {
      for (const xo of [-2.75, 2.75]) houses.add(new THREE.CylinderGeometry(0.17, 0.19, 3.95, 8), { x: c + xo, y: 0.25 + 1.975, z });
    }
    for (const xo of [-2.75, 2.75]) houses.boxOn(0.3, 0.3, SH.length - 1.4, c + xo, 4.1, SH.z);
    houses.add(
      hipRoof(THREE, { hx: SH.length / 2 + 1.0, hz: 3.8, ix: SH.length / 2 - 2.2, iz: 0, height: 2.1, lift: 0.42, flare: 0.36, reach: 2.2, sag: 0.4, thickness: 0.18, segS: 24, segT: 6, curl: 0.5, bead: 0.08, beadSegs: 18, ridgeOrnament: 0.75 }),
      { x: c, y: 4.35, z: SH.z, ry: Math.PI / 2 },
    );
  }
  complex.push(addMesh(houses.merge(), "stele-houses"));

  const steleGeo = steleInstanceGeometry(THREE, { quality });
  const sr = rng(1484);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pos = new THREE.Vector3(), scl = new THREE.Vector3();
  for (const side of [-1, 1]) {
    const c = side * SH.x;
    const im = new THREE.InstancedMesh(steleGeo, mat, 41);
    im.name = side < 0 ? "steles-left" : "steles-right";
    im.castShadow = im.receiveShadow = true;
    let k = 0;
    const rows = [
      { x: c - side * 1.0, z0: SH.z - 20, n: 21 }, // inner row, nearer the well
      { x: c + side * 1.15, z0: SH.z - 19, n: 20 }, // outer row, staggered
    ];
    for (const row of rows) {
      for (let i = 0; i < row.n; i++) {
        const s = 0.82 + sr() * 0.36; // real steles range 1.1–2.07 m
        pos.set(row.x, 0.25, row.z0 + i * 2);
        e.set(0, -side * (Math.PI / 2) + (sr() - 0.5) * 0.06, 0);
        q.setFromEuler(e);
        scl.set(s, s, s);
        im.setMatrixAt(k++, m4.compose(pos, q, scl));
      }
    }
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingBox();
    im.computeBoundingSphere();
    group.add(im);
    complex.push(im);
  }

  // ---- halls of courtyards 4 and 5
  const halls = new GeoBag(THREE);
  halls.add(hall(THREE, { w: 34, d: 10, h: 4.2, sun: 0.5 }), { z: -46 }); // Đại Bái đường
  halls.add(hall(THREE, { w: 30, d: 11, h: 4.4 }), { z: -60 }); // Thượng điện
  for (const s of [-1, 1]) halls.add(hall(THREE, { w: 24, d: 6, h: 3.2 }), { x: s * 27.5, z: -58, ry: (-s * Math.PI) / 2 }); // Tả vu, Hữu vu
  halls.add(hall(THREE, { w: 32, d: 14, h: 4.6, twoTier: true, sun: 0.5 }), { z: -120 }); // Thái Học
  for (const s of [-1, 1]) halls.add(hall(THREE, { w: 5, d: 5, h: 3.4, twoTier: true }), { x: s * 24, z: -100 }); // bell / drum towers
  complex.push(addMesh(halls.merge(), "halls"));

  // ---- trees (three templates × near/far, instanced)
  const layout = treeLayout(hi);
  for (const far of [false, true]) {
    for (let kind = 0; kind < TREE_KINDS.length; kind++) {
      const items = layout.filter((t) => t[4] === kind && t[5] === far);
      if (!items.length) continue;
      const im = new THREE.InstancedMesh(treeGeometry(THREE, kind, hi && !far, 31 + kind * 17), mat, items.length);
      im.name = `trees-${far ? "far" : "near"}-${kind}`;
      im.castShadow = im.receiveShadow = true;
      items.forEach(([x, z, s, yaw], i) => {
        pos.set(x, 0, z);
        q.setFromEuler(e.set(0, yaw, 0));
        scl.set(s, s * (0.9 + (i % 5) * 0.05), s);
        im.setMatrixAt(i, m4.compose(pos, q, scl));
      });
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingBox();
      im.computeBoundingSphere();
      group.add(im);
    }
  }

  // ---- anchors
  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  for (const m of complex) bounds.expandByObject(m);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const anchors = {
    gate: V(0, 0, L.front),
    daiTrungMon: V(0, 0, L.daiTrungMon),
    khueVanCac: V(0, 0, L.khueVanCac),
    khueVanCacTop: V(0, KVC.top, L.khueVanCac),
    pond: V(0, L.well.water, 0),
    daiThanhMon: V(0, 0, L.daiThanhMon),
    steleLeft: V(-SH.x, 0, SH.z),
    steleRight: V(SH.x, 0, SH.z),
    bounds,
    // extras
    truBieuLeft: V(-8.8, 8.9, L.front + 7.5),
    truBieuRight: V(8.8, 8.9, L.front + 7.5),
    daiBaiDuong: V(0, 0, -46),
    thaiHocMon: V(0, 0, L.thaiHocMon),
    thaiHoc: V(0, 0, -120),
  };

  return {
    group,
    anchors,
    dispose: () => disposeTree(group),
  };
}
