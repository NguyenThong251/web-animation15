// Procedural textures (nothing is downloaded except the depth photo):
//  · dot pattern   7×7 paper micro-dot tile (two ink pixels on an oblique stagger)
//  · advect        128² tileable flow-noise vector field for the ink splat
//  · reveal mask   512² blurry ink blot for the intro reveal
//  · depth map     synthetic depth for the 2.5D photo, preprocessed like the reference (§5.3)
//  · line drawing  the pavilion elevation SVG rasterised for the closing wall
import * as THREE from "three";

/* ---------------------------------------------------------------- helpers */

// deterministic PRNG so every visitor gets the same blot / flow field
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (t) => t * t * (3 - 2 * t);

// Periodic value noise on an integer lattice of `period` cells (tiles seamlessly over 0..1).
function makePeriodicNoise(period, rand) {
  const lattice = new Float32Array(period * period);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rand();
  return (u, v) => {
    const x = u * period;
    const y = v * period;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = smooth(x - x0);
    const fy = smooth(y - y0);
    const ix0 = ((x0 % period) + period) % period;
    const iy0 = ((y0 % period) + period) % period;
    const ix1 = (ix0 + 1) % period;
    const iy1 = (iy0 + 1) % period;
    const a = lattice[iy0 * period + ix0];
    const b = lattice[iy0 * period + ix1];
    const c = lattice[iy1 * period + ix0];
    const d = lattice[iy1 * period + ix1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

// separable box blur of a single-channel float image, O(n) sliding window, edges clamped
export function boxBlur(src, w, h, r, out = new Float32Array(src.length)) {
  if (r < 1) {
    out.set(src);
    return out;
  }
  const tmp = new Float32Array(src.length);
  const norm = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[row + Math.min(w - 1, Math.max(0, k))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc * norm;
      acc += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += tmp[Math.min(h - 1, Math.max(0, k)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc * norm;
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

/* ---------------------------------------------------------------- dot pattern */

// Our own micro-dot screen for the "paper" backgrounds: a 7×7 white tile with two ink pixels at
// (1,1) and (4,5). The second dot sits (3,4) texels off the first, so the dots fall on an oblique
// lattice (nearest neighbours (−3,3) and (3,4)) instead of a square quincunx. `repeat` (tiles per
// screen height) keeps a texel ≈ 1.25 px at 900 px tall, so the dots stay ≈ 5–6 px apart.
export const DOT_PATTERN = {
  size: 7,
  dots: [
    [1, 1],
    [4, 5],
  ],
  repeat: 103,
};

export function createDotPatternTexture() {
  const { size, dots } = DOT_PATTERN;
  const data = new Uint8Array(size * size * 4).fill(255);
  for (const [x, y] of dots) {
    const i = (y * size + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = 0;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/* ---------------------------------------------------------------- advect field */

// 128² tileable flow field: R/G = a smooth 2D vector (centred on 0.5), B = 0. Two octaves of periodic
// value noise per axis, with the second component offset so the flow curls instead of pulsing.
export function createAdvectTexture(size = 128) {
  const rand = mulberry32(1442);
  const nx1 = makePeriodicNoise(4, rand);
  const nx2 = makePeriodicNoise(8, rand);
  const ny1 = makePeriodicNoise(4, rand);
  const ny2 = makePeriodicNoise(8, rand);
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const fx = (nx1(u, v) * 0.7 + nx2(u, v) * 0.3) * 2 - 1;
      const fy = (ny1(u, v) * 0.7 + ny2(u, v) * 0.3) * 2 - 1;
      // normalise-ish and keep a minimum drift so the ink always creeps
      const len = Math.hypot(fx, fy) || 1;
      const mag = 0.45 + 0.55 * Math.min(1, len * 1.6);
      const i = (y * size + x) * 4;
      data[i] = Math.round((0.5 + 0.5 * (fx / len) * mag) * 255);
      data[i + 1] = Math.round((0.5 + 0.5 * (fy / len) * mag) * 255);
      data[i + 2] = 0;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/* ---------------------------------------------------------------- reveal mask */

// 512² greyscale ink blot: darkest slightly left of and above the centre, ragged lobes, soft light
// edges. Values stay in [0.12, 0.9] so the intro reveal (thresholds up to 1 ± 0.16) fully opens.
export function createRevealMaskTexture(size = 512) {
  const rand = mulberry32(1070);
  const lobes = makePeriodicNoise(9, rand); // angular raggedness (periodic in θ)
  const grain = makePeriodicNoise(16, rand);
  const field = new Float32Array(size * size);
  const cx = 0.46;
  const cy = 0.44; // top-left space: above centre
  // a few satellite blots that merge into the main one as the threshold rises
  const blots = [
    { x: cx, y: cy, r: 0.21, w: 1 },
    { x: 0.62, y: 0.36, r: 0.1, w: 0.55 },
    { x: 0.33, y: 0.58, r: 0.12, w: 0.6 },
    { x: 0.57, y: 0.62, r: 0.08, w: 0.45 },
  ];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      let ink = 0;
      for (const b of blots) {
        const dx = u - b.x;
        const dy = v - b.y;
        const theta = (Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI);
        const ragged = 1 + 0.38 * (lobes(theta, b.r * 3.1) - 0.5) + 0.18 * (lobes(theta * 2 % 1, 0.7) - 0.5);
        const d = Math.hypot(dx, dy) / (b.r * ragged);
        ink = Math.max(ink, b.w * Math.exp(-d * d * 0.9));
      }
      const g = grain(u, v) - 0.5;
      // 0.12 at the core → 0.9 at the rim
      field[y * size + x] = Math.min(0.9, Math.max(0.12, 0.9 - 0.8 * ink + 0.05 * g));
    }
  }
  const blurred = boxBlur(boxBlur(field, size, size, 6), size, size, 4);
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < blurred.length; i++) {
    const c = Math.round(Math.min(0.9, Math.max(0.12, blurred[i])) * 255);
    // DataTexture rows run bottom → top: write row y of the top-left field into row size-1-y
    const y = Math.floor(i / size);
    const x = i % size;
    const o = ((size - 1 - y) * size + x) * 4;
    data[o] = data[o + 1] = data[o + 2] = c;
    data[o + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/* ---------------------------------------------------------------- 1×1 placeholders */

export function createSolidTexture(r, g, b, a) {
  const tex = new THREE.DataTexture(new Uint8Array([r, g, b, a]), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export function createDepthPlaceholder() {
  // depth 1.0 everywhere (= "far / nothing drawn") without needing a depth attachment
  return createSolidTexture(255, 255, 255, 255);
}

/* ---------------------------------------------------------------- images */

export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image failed to load: ${url}`));
    img.src = new URL(url, document.baseURI).href;
  });
}

export function imageTexture(img) {
  const tex = new THREE.Texture(img);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/* ---------------------------------------------------------------- synthetic depth */

// The reference ships a measured depth map; ours is derived from the photo itself:
//   raw = vertical gradient (ground near, sky far) + centre weighting (the pavilion stands forward)
//       + warm/red lacquer boost − foliage/sky pull-back + a little local-contrast relief,
// heavily blurred and quantised to 8 bits like a real depth PNG, then the reference preprocessing:
//   box blur 1.3 % of the width → clamp to the 8-bit value ± 1.5/255 → box blur r = 2 → HalfFloat.
// White (1) = near. Rows are written bottom-up so it samples with the same v as the flipY photo.
export function createSyntheticDepthTexture(img, maxWidth = 1024) {
  const w = Math.min(maxWidth, img.naturalWidth || img.width);
  const h = Math.max(1, Math.round((w * (img.naturalHeight || img.height)) / (img.naturalWidth || img.width)));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  const n = w * h;

  const lum = new Float32Array(n);
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = px[i * 4] / 255;
    const g = px[i * 4 + 1] / 255;
    const b = px[i * 4 + 2] / 255;
    lum[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  const lumWide = boxBlur(lum, w, h, Math.max(2, Math.round(w * 0.03)));
  const lumNear = boxBlur(lum, w, h, Math.max(1, Math.round(w * 0.006)));

  for (let y = 0; y < h; y++) {
    const v = y / (h - 1); // 0 top → 1 bottom
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const u = x / (w - 1);
      const r = px[i * 4] / 255;
      const g = px[i * 4 + 1] / 255;
      const b = px[i * 4 + 2] / 255;
      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      const sat = mx > 0 ? (mx - mn) / mx : 0;
      const vertical = 0.22 + 0.62 * smooth(Math.min(1, Math.max(0, (v - 0.05) / 0.95)));
      const du = (u - 0.46) / 0.34;
      const dv = (v - 0.48) / 0.42;
      const centre = Math.exp(-(du * du + dv * dv));
      const red = Math.min(1, Math.max(0, (r - Math.max(g, b)) * 2.4));
      const green = Math.min(1, Math.max(0, (g - Math.max(r, b)) * 3.0));
      const sky = smooth(Math.min(1, Math.max(0, (lum[i] - 0.72) / 0.2))) * (1 - smooth(Math.min(1, sat / 0.25)));
      const relief = (lumNear[i] - lumWide[i]) * 0.5;
      raw[i] = Math.min(1, Math.max(0, vertical + 0.26 * centre + 0.12 * red - 0.08 * green - 0.55 * sky + relief));
    }
  }

  // smooth regions like a monocular depth estimate would, then quantise to 8 bits
  const base = boxBlur(boxBlur(raw, w, h, Math.round(w * 0.012)), w, h, Math.round(w * 0.006));
  for (let i = 0; i < n; i++) base[i] = Math.round(base[i] * 255) / 255;

  // reference preprocessing (SPEC_WEBGL §5.3)
  const pass1 = boxBlur(base, w, h, Math.max(1, Math.round(w * 0.013)));
  const lim = 1.5 / 255;
  for (let i = 0; i < n; i++) pass1[i] = Math.min(base[i] + lim, Math.max(base[i] - lim, pass1[i]));
  const depth = boxBlur(pass1, w, h, 2);

  const data = new Uint16Array(n);
  for (let y = 0; y < h; y++) {
    const dst = (h - 1 - y) * w;
    const src = y * w;
    for (let x = 0; x < w; x++) data[dst + x] = THREE.DataUtils.toHalfFloat(depth[src + x]);
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RedFormat, THREE.HalfFloatType);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/* ---------------------------------------------------------------- SVG raster */

// Rasterise an SVG string (black strokes on white) into a canvas texture of the given size.
export function rasterizeSVG(svg, width, height) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.NoColorSpace; // used as a mask (.r), not as colour
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.magFilter = THREE.LinearFilter;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.needsUpdate = true;
      resolve(tex);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("line drawing SVG failed to rasterise"));
    };
    img.src = url;
  });
}
