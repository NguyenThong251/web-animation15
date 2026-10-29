// Shared helpers for the procedural models: deterministic random numbers, geometry
// placement + merging, and CPU image processing (blur, height map → normal map).
// THREE is always passed in by the caller so every object comes from one instance.
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Small, fast, seedable PRNG (mulberry32) → () => float in [0, 1). */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * Apply a transform to a geometry in place and return it.
 * t = { x, y, z, rx, ry, rz, s | sx, sy, sz }  (radians, Euler order XYZ)
 */
export function place(THREE, geo, t = {}) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(t.rx || 0, t.ry || 0, t.rz || 0, t.order || "XYZ"));
  const s = t.s ?? 1;
  m.compose(new THREE.Vector3(t.x || 0, t.y || 0, t.z || 0), q, new THREE.Vector3(t.sx ?? s, t.sy ?? s, t.sz ?? s));
  geo.applyMatrix4(m);
  return geo;
}

/** Normalise a geometry for merging: non-indexed, exactly position/normal/uv. */
function normaliseForMerge(THREE, geo) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) {
    g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  }
  for (const name of Object.keys(g.attributes)) {
    if (name !== "position" && name !== "normal" && name !== "uv") g.deleteAttribute(name);
  }
  g.morphAttributes = {};
  g.clearGroups();
  return g;
}

/**
 * Collects geometries (each with an optional transform) and merges them into one
 * BufferGeometry. Merged inputs are disposed.
 */
export class GeoBag {
  constructor(THREE) {
    this.THREE = THREE;
    this.list = [];
  }
  add(geo, t) {
    if (t) place(this.THREE, geo, t);
    this.list.push(geo);
    return geo;
  }
  /** axis-aligned box from min/max corners (handy for walls and slabs) */
  boxMinMax(x0, y0, z0, x1, y1, z1) {
    const g = new this.THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
    return this.add(g, { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 });
  }
  /** box by size, sitting on y (bottom face at y) */
  boxOn(w, h, d, x, y, z, ry = 0) {
    const g = new this.THREE.BoxGeometry(w, h, d);
    return this.add(g, { x, y: y + h / 2, z, ry });
  }
  merge() {
    const THREE = this.THREE;
    const parts = this.list.map((g) => normaliseForMerge(THREE, g));
    this.list = [];
    if (!parts.length) return new THREE.BufferGeometry();
    const merged = mergeGeometries(parts, false);
    parts.forEach((g) => g.dispose());
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    return merged;
  }
}

/** The house material from the contract: white, rough, non-metallic. */
export function whiteMaterial(THREE, extra = {}) {
  return new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, ...extra });
}

/** Mesh with the contract's shadow flags and a readable name. */
export function mesh(THREE, geo, mat, name, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.name = name;
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

/** Deterministic 3D value noise (smooth, ~[-1, 1]) used to roughen stone and foliage. */
export function makeNoise3(seed = 7) {
  const r = rng(seed);
  const perm = new Uint8Array(512);
  const vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    perm[i] = i;
    vals[i] = r() * 2 - 1;
  }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const h = (x, y, z) => vals[perm[perm[perm[x & 255] + (y & 255)] + (z & 255)]];
  const f = (t) => t * t * (3 - 2 * t);
  return (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = f(x - xi), yf = f(y - yi), zf = f(z - zi);
    const x00 = lerp(h(xi, yi, zi), h(xi + 1, yi, zi), xf);
    const x10 = lerp(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), xf);
    const x01 = lerp(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), xf);
    const x11 = lerp(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), xf);
    return lerp(lerp(x00, x10, yf), lerp(x01, x11, yf), zf);
  };
}

/**
 * Displace every vertex by a smooth vector-noise field of its position.
 * Because the offset depends only on the position, vertices duplicated along hard
 * edges move together and the surface never cracks.
 */
export function roughen(THREE, geo, amp, freq, seed = 3) {
  const nx = makeNoise3(seed), ny = makeNoise3(seed + 11), nz = makeNoise3(seed + 23);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) * freq, y = p.getY(i) * freq, z = p.getZ(i) * freq;
    p.setXYZ(i, p.getX(i) + nx(x, y, z) * amp, p.getY(i) + ny(x, y, z) * amp, p.getZ(i) + nz(x, y, z) * amp);
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/* ------------------------------------------------------------------------------------------
 * CPU image processing for the carved-stone normal maps
 * ---------------------------------------------------------------------------------------- */

/** Read a canvas' red channel as a Float32Array height field in [0, 1]. */
export function canvasToHeight(canvas) {
  const { width: w, height: h } = canvas;
  const data = canvas.getContext("2d").getImageData(0, 0, w, h).data;
  const out = new Float32Array(w * h);
  for (let i = 0, j = 0; i < out.length; i++, j += 4) out[i] = data[j] / 255;
  return out;
}

/** One separable box-blur pass pair (horizontal then vertical). wrapX makes it tile around u. */
export function boxBlur(src, w, h, r, wrapX = false) {
  if (r < 1) return src;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const inv = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[row + (wrapX ? (k + w) % w : clamp(k, 0, w - 1))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc * inv;
      const xa = x + r + 1, xr = x - r;
      acc += src[row + (wrapX ? xa % w : Math.min(xa, w - 1))];
      acc -= src[row + (wrapX ? (xr + w) % w : Math.max(xr, 0))];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += tmp[clamp(k, 0, h - 1) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc * inv;
      acc += tmp[Math.min(y + r + 1, h - 1) * w + x];
      acc -= tmp[Math.max(y - r, 0) * w + x];
    }
  }
  return out;
}

/** Two box passes ≈ a gaussian blur. */
export function softBlur(src, w, h, r, wrapX = false) {
  return boxBlur(boxBlur(src, w, h, r, wrapX), w, h, r, wrapX);
}

/**
 * Sobel normals from a height field (canvas row 0 = top). Output rows are flipped so
 * the DataTexture's v axis points up (v = 1 is the top of the canvas), which is the
 * tangent-space convention three.js normal maps expect.
 * strength = how many "height units per pixel" tilt the normal by 45°.
 */
export function heightToNormalRGBA(hgt, w, h, strength, wrapX = false) {
  const out = new Uint8Array(w * h * 4);
  const at = (x, y) => {
    x = wrapX ? (x + w) % w : clamp(x, 0, w - 1);
    y = clamp(y, 0, h - 1);
    return hgt[y * w + x];
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Sobel gradients in canvas space (+x right, +y down)
      const tl = at(x - 1, y - 1), t = at(x, y - 1), tr = at(x + 1, y - 1);
      const l = at(x - 1, y), r = at(x + 1, y);
      const bl = at(x - 1, y + 1), b = at(x, y + 1), br = at(x + 1, y + 1);
      const dx = (tr + 2 * r + br - tl - 2 * l - bl) / 8;
      const dy = (bl + 2 * b + br - tl - 2 * t - tr) / 8;
      // tangent space: +u = +x, +v = -y (canvas y points down)
      let nx = -dx * strength, ny = dy * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      const o = ((h - 1 - y) * w + x) * 4;
      out[o] = Math.round((nx * 0.5 + 0.5) * 255);
      out[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      out[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      out[o + 3] = 255;
    }
  }
  return out;
}

/** Grey albedo (cavity darkening) from height: grooves darker than the surrounding surface. */
export function cavityRGBA(hgt, w, h, { radius = 6, gain = 2.2, floor = 0.62, wrapX = false } = {}) {
  const wide = softBlur(hgt, w, h, radius, wrapX);
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const c = clamp(1 + (hgt[i] - wide[i]) * gain, floor, 1);
      const v = Math.round(c * 255);
      const o = ((h - 1 - y) * w + x) * 4;
      out[o] = out[o + 1] = out[o + 2] = v;
      out[o + 3] = 255;
    }
  }
  return out;
}

export function dataTexture(THREE, rgba, w, h, colorSpace) {
  const tex = new THREE.DataTexture(rgba, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.colorSpace = colorSpace ?? THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/** 2D canvas, preferring OffscreenCanvas-free DOM canvas (font loading works on both). */
export function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/** Dispose every geometry / material / texture under an Object3D. */
export function disposeTree(root) {
  const seen = new Set();
  root.traverse((o) => {
    if (o.geometry && !seen.has(o.geometry)) {
      seen.add(o.geometry);
      o.geometry.dispose();
    }
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (seen.has(m)) continue;
      seen.add(m);
      for (const v of Object.values(m)) if (v && v.isTexture && !seen.has(v)) (seen.add(v), v.dispose());
      m.dispose();
    }
  });
}
