// Writing tools for the "hands" chapter, both ≈1 m long, tip at the origin, handle toward +Y:
//   bút lông — calligraphy brush: tapered hair tuft, collar, bamboo handle with node rings, loop
//   ngòi bút — steel dip pen: curved slit nib with a breather hole, metal ferrule, black holder
import { GeoBag, whiteMaterial, mesh, smoothstep } from "./util.js";

const v2 = (THREE, list) => list.map(([r, y]) => new THREE.Vector2(r, y));

/* ------------------------------------------------------------------------------------------
 * Brush
 * ---------------------------------------------------------------------------------------- */
export function buildBrush(THREE) {
  const group = new THREE.Group();
  group.name = "brush";
  const mat = whiteMaterial(THREE);

  // hair tuft: lathe with a fine tip, then strand ridges pushed into the surface
  const tuft = [
    [0.0, 0.0],
    [0.0012, 0.002],
    [0.004, 0.009],
    [0.008, 0.02],
    [0.014, 0.036],
    [0.022, 0.06],
    [0.031, 0.09],
    [0.038, 0.12],
    [0.0425, 0.15],
    [0.0435, 0.175],
    [0.041, 0.2],
    [0.037, 0.225],
    [0.034, 0.245],
    [0.0335, 0.255],
  ];
  const hairGeo = new THREE.LatheGeometry(v2(THREE, tuft), 64);
  const p = hairGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-6) continue;
    const phi = Math.atan2(x, z);
    // strands: fine ridges that twist slightly toward the tip, fading out at the very point
    const strands = Math.abs(Math.sin(phi * 18 + y * 26)) * 0.6 + Math.abs(Math.sin(phi * 41 - y * 13)) * 0.4;
    const k = 1 - 0.07 * strands * smoothstep(0.004, 0.05, y);
    p.setX(i, x * k);
    p.setZ(i, z * k);
  }
  hairGeo.computeVertexNormals();
  group.add(mesh(THREE, hairGeo, mat, "hair"));

  // collar where the hair enters the bamboo (horn ring with a lip)
  const collar = new THREE.LatheGeometry(
    v2(THREE, [
      [0.03, 0.238],
      [0.0365, 0.243],
      [0.037, 0.256],
      [0.0345, 0.262],
      [0.0345, 0.288],
      [0.0365, 0.293],
      [0.031, 0.298],
    ]),
    40,
  );
  group.add(mesh(THREE, collar, mat, "ferrule"));

  // bamboo handle: slight taper, three nodes (raised ring + groove) and a rounded end
  const handlePts = [[0.031, 0.296]];
  const nodes = [0.47, 0.66, 0.85];
  const rAt = (y) => 0.0305 - (y - 0.3) * 0.004;
  let y = 0.3;
  for (const yn of nodes) {
    for (; y < yn - 0.02; y += 0.04) handlePts.push([rAt(y), y]);
    const r = rAt(yn);
    handlePts.push([r, yn - 0.012], [r + 0.0035, yn - 0.004], [r + 0.0042, yn], [r + 0.001, yn + 0.004], [r - 0.0008, yn + 0.008], [r, yn + 0.016]);
    y = yn + 0.03;
  }
  for (; y < 0.965; y += 0.04) handlePts.push([rAt(y), y]);
  handlePts.push([rAt(0.97), 0.97], [0.025, 0.982], [0.019, 0.992], [0.008, 0.998], [0.0, 1.0]);
  group.add(mesh(THREE, new THREE.LatheGeometry(v2(THREE, handlePts), 40), mat, "handle"));

  // hanging loop: a small eyelet knob and a cord loop
  const loop = new GeoBag(THREE);
  loop.add(new THREE.CylinderGeometry(0.006, 0.008, 0.016, 10), { y: 1.004 });
  loop.add(new THREE.TorusGeometry(0.03, 0.0042, 8, 36), { y: 1.042 });
  group.add(mesh(THREE, loop.merge(), mat, "loop"));

  return {
    group,
    tip: new THREE.Vector3(0, 0, 0),
    axis: new THREE.Vector3(0, 1, 0),
    length: 1.07,
  };
}

/* ------------------------------------------------------------------------------------------
 * Pen
 * ---------------------------------------------------------------------------------------- */
const NIB = { len: 0.27, shoulder: 0.15, half: 0.022, slit: 0.0005, holeY: 0.092, holeR: 0.0052, t: 0.0022, R: 0.026 };

/**
 * Steel nib as two strips (left and right of the slit), each a grid across its width so the
 * bend stays smooth. In the plane: tip at y = 0, x across. w(y) = outline half-width,
 * e(y) = half-width of the cut (slit below the breather hole, the hole itself, 0 above it).
 */
function nibGeometry(THREE) {
  const { len, shoulder, half, slit, holeY, holeR, t } = NIB;
  const outline = new THREE.SplineCurve(
    [
      [0.0013, 0],
      [0.18, 0.08],
      [0.4, 0.24],
      [0.64, 0.45],
      [0.85, 0.67],
      [0.97, 0.85],
      [1, 1],
    ].map(([x, y], i) => new THREE.Vector2(i ? x * half : x, y * shoulder)),
  ).getPoints(80);
  const w = (y) => {
    if (y >= shoulder) return half;
    let i = 1;
    while (i < outline.length - 1 && outline[i].y < y) i++;
    const a = outline[i - 1], b = outline[i];
    return a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y || 1);
  };
  const e = (y) => {
    const d = y - holeY;
    if (Math.abs(d) <= holeR) return Math.max(Math.sqrt(holeR * holeR - d * d), d < 0 ? slit : 0);
    return y < holeY ? slit : 0;
  };
  // rows: even along the nib, denser through the breather hole so it stays round
  const ys = new Set();
  for (let j = 0; j <= 90; j++) ys.add(+((j / 90) * len).toFixed(5));
  for (let j = 0; j <= 24; j++) ys.add(+(holeY - holeR + (j / 24) * 2 * holeR).toFixed(5));
  const Y = [...ys].sort((a, b) => a - b);
  const cols = 7;

  // bend across the width onto a cylinder (radius R, axis above the nib): flat at the tip,
  // fully curved at the barrel; the tip also rises a little toward the holder axis
  const bend = ([x, y, z]) => {
    const k = smoothstep(0.0, shoulder * 1.05, y) / NIB.R;
    let nx = x, nz = z;
    if (k > 1e-3) {
      const R = 1 / k, th = x * k;
      nx = (R - z) * Math.sin(th);
      nz = R - (R - z) * Math.cos(th);
    }
    return [nx, y, nz + 0.008 * Math.max(0, 1 - y / shoulder) ** 2];
  };
  const bag = new GeoBag(THREE);
  const rows = Y.length;
  for (const side of [-1, 1]) {
    const flip = side < 0;
    const P = (j, i, z) => {
      const y = Y[j];
      const x0 = Math.min(e(y), w(y)), x1 = w(y);
      return bend([side * (x0 + ((x1 - x0) * i) / cols), y, z]);
    };
    // top and bottom faces: indexed grids → smooth normals across the curvature
    for (const [z, up] of [
      [t, true],
      [0, false],
    ]) {
      const pos = [];
      for (let j = 0; j < rows; j++) for (let i = 0; i <= cols; i++) pos.push(...P(j, i, z));
      const idx = [];
      for (let j = 0; j < rows - 1; j++) {
        for (let i = 0; i < cols; i++) {
          const a = j * (cols + 1) + i, b = a + 1, c = a + cols + 1, d = c + 1;
          if (up !== flip) idx.push(a, b, c, b, d, c);
          else idx.push(a, c, b, b, c, d);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      bag.add(g);
    }
    // edge walls (flat-shaded): outer outline, slit / hole sides, the tip end
    const wall = [];
    const quad = (a, b, c, d) => (flip ? wall.push(...a, ...c, ...b, ...b, ...c, ...d) : wall.push(...a, ...b, ...c, ...b, ...d, ...c));
    for (let j = 0; j < rows - 1; j++) {
      quad(P(j, cols, 0), P(j + 1, cols, 0), P(j, cols, t), P(j + 1, cols, t));
      if (e(Y[j]) > 0 || e(Y[j + 1]) > 0) quad(P(j, 0, 0), P(j, 0, t), P(j + 1, 0, 0), P(j + 1, 0, t));
    }
    quad(P(0, 0, 0), P(0, 0, t), P(0, cols, 0), P(0, cols, t));
    const wg = new THREE.BufferGeometry();
    wg.setAttribute("position", new THREE.Float32BufferAttribute(wall, 3));
    wg.computeVertexNormals();
    bag.add(wg);
  }
  return bag.merge();
}

export function buildPen(THREE) {
  const group = new THREE.Group();
  group.name = "pen";
  const mat = whiteMaterial(THREE);

  // the nib's barrel lies against the ferrule wall, so its axis sits R above the nib
  const axisZ = NIB.R; // pen axis height above the nib's lowest line
  const nib = mesh(THREE, nibGeometry(THREE), mat, "nib");
  group.add(nib);

  const ferrule = new THREE.LatheGeometry(
    v2(THREE, [
      [0.0, 0.25],
      [0.0236, 0.25],
      [0.0236, 0.175],
      [0.0262, 0.166],
      [0.0279, 0.17],
      [0.0279, 0.181],
      [0.0264, 0.187],
      [0.0266, 0.215],
      [0.0274, 0.25],
      [0.0284, 0.285],
      [0.0292, 0.312],
      [0.0288, 0.322],
    ]),
    48,
  );
  ferrule.translate(0, 0, axisZ);
  group.add(mesh(THREE, ferrule, mat, "ferrule"));

  const holder = new GeoBag(THREE);
  holder.add(
    new THREE.LatheGeometry(
      v2(THREE, [
        [0.0288, 0.32],
        [0.0302, 0.335],
        [0.0322, 0.375],
        [0.0338, 0.43],
        [0.0336, 0.475],
        [0.0312, 0.54],
        [0.0284, 0.62],
        [0.0252, 0.74],
        [0.0218, 0.86],
        [0.0192, 0.94],
        [0.0158, 0.975],
        [0.0098, 0.993],
        [0.0, 1.0],
      ]),
      40,
    ),
  );
  for (const yr of [0.346, 0.356, 0.366]) holder.add(new THREE.TorusGeometry(0.0306, 0.0013, 6, 40), { y: yr, rx: Math.PI / 2 });
  const holderGeo = holder.merge();
  holderGeo.translate(0, 0, axisZ);
  group.add(mesh(THREE, holderGeo, mat, "holder"));

  // put the tip at the origin, then turn the pen half a turn about its length so the nib's
  // convex face (slit + breather hole) looks toward +Z and the holder axis sits just behind it
  const tipZ = 0.008; // nib lift at y = 0
  group.children.forEach((m) => m.geometry.translate(0, 0, -tipZ).rotateY(Math.PI));
  const end = new THREE.Vector3(0, 1.0, -(axisZ - tipZ));
  return {
    group,
    tip: new THREE.Vector3(0, 0, 0),
    axis: end.clone().normalize(),
    length: end.length(),
  };
}
