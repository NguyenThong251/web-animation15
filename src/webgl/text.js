// WebGL typography with troika-three-text (runtime SDF from our TTFs → full Vietnamese diacritics
// and Hán). Two behaviours from the reference's MSDF system (SPEC_WEBGL §6) are added on top of
// troika's material:
//  · per-glyph masked rise reveal: glyph k (gl_InstanceID = k-th rendered glyph) starts
//    k·stagger later, rises one full text-band height with a normalised expo.out, and fragments
//    outside the original band are discarded (a mask wipe from below);
//  · edge softness: troika's anti-aliasing width multiplied (6 → the soft-edged 3D titles).
// CameraTitle anchors a title to a moving camera at distance 5 with px-based sizing (§6.2).
import * as THREE from "three";
import { Text } from "troika-three-text";
import { SDF_GLYPH_SIZE, clamp } from "./config.js";

export const fontURL = (path) => new URL(path, document.baseURI).href;

// EB Garamond: baseline sits 0.945 em under the reference's MSDF layout origin (font-agnostic
// placement of the original atlas: base 71 / lineHeight 100 / size 64), cap height 0.65 em.
export const BASELINE_EM = 0.945;

export class KVText extends Text {
  constructor() {
    super();
    this.sdfGlyphSize = SDF_GLYPH_SIZE;
    this.kv = {
      uKvReveal: { value: 1 },
      uKvRevealOn: { value: 0 },
      uKvGlyphCount: { value: 1 },
      uKvStagger: { value: 0.055 },
      uKvMaskTop: { value: 0 },
      uKvMaskBottom: { value: 0 },
      uKvSoftness: { value: 1 },
      uKvOuterStroke: { value: 0 },
    };
  }

  // troika calls this to wrap our base material; we extend its upgraded shaders once more
  createDerivedMaterial(baseMaterial) {
    const derived = super.createDerivedMaterial(baseMaterial);
    Object.assign(derived.uniforms, this.kv);
    derived.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.kv);
      shader.vertexShader = patchVertex(shader.vertexShader);
      shader.fragmentShader = patchFragment(shader.fragmentShader);
    };
    // our shader edits are identical for every KVText → one extra program variant
    const baseKey = derived.customProgramCacheKey;
    derived.customProgramCacheKey = function () {
      return `${baseKey.call(this)}|kv-text-v1`;
    };
    return derived;
  }

  // promise wrapper around troika's async layout
  syncAsync() {
    return new Promise((resolve) => this.sync(() => resolve(this)));
  }

  // configure the reveal once the layout exists
  setupReveal({ enabled, stagger = 0.055, softness = 1 }) {
    const info = this.textRenderInfo;
    const u = this.kv;
    u.uKvRevealOn.value = enabled ? 1 : 0;
    u.uKvStagger.value = stagger;
    u.uKvSoftness.value = softness;
    if (info) {
      const vb = info.visibleBounds;
      u.uKvMaskTop.value = vb[3];
      u.uKvMaskBottom.value = vb[1];
      u.uKvGlyphCount.value = Math.max(1, info.glyphBounds.length / 4);
    }
  }

  set revealProgress(p) {
    this.kv.uKvReveal.value = p;
  }
}

const VERT_DEFS = /* glsl */ `
uniform float uKvReveal;
uniform float uKvRevealOn;
uniform float uKvGlyphCount;
uniform float uKvStagger;
uniform float uKvMaskTop;
uniform float uKvMaskBottom;
varying float vKvY;
`;

function patchVertex(src) {
  const key = (src.match(/troika_position_(\w+)/) || [])[1];
  const pos = key ? `troika_position_${key}` : "position";
  // runs after troika's main(): glyph placed, gl_Position computed → offset it along local y
  const outro = /* glsl */ `
  float kvIdx = float(gl_InstanceID);
  float kvWin = max(1e-4, 1.0 - (uKvGlyphCount - 1.0) * uKvStagger);
  float kvT = clamp((uKvReveal - kvIdx * uKvStagger) / kvWin, 0.0, 1.0);
  float kvMin = pow(2.0, -10.0);
  float kvEase = 1.0 - (pow(2.0, -10.0 * kvT) - kvMin) / (1.0 - kvMin); // normalised expo.out
  float kvShift = -(uKvMaskTop - uKvMaskBottom) * (1.0 - kvEase) * uKvRevealOn;
  vKvY = ${pos}.y + kvShift;
  gl_Position += projectionMatrix * modelViewMatrix * vec4(0.0, kvShift, 0.0, 0.0);
`;
  const end = src.lastIndexOf("}");
  return VERT_DEFS + src.slice(0, end) + outro + "\n}\n";
}

const FRAG_DEFS = /* glsl */ `
uniform float uKvRevealOn;
uniform float uKvMaskTop;
uniform float uKvMaskBottom;
uniform float uKvSoftness;
uniform float uKvOuterStroke;
varying float vKvY;
`;

// Outline-only text is drawn as an OUTER band (distance 0 → +width): troika's inner stroke would
// also trace the overlapping contours inside Hán glyphs (their SDF sees every path segment), while
// from outside the glyph the nearest segment is always on the true silhouette.
const OUTER_STROKE = /* glsl */ `
  if (uKvOuterStroke > 0.0) {
    float kvInside = troikaGetEdgeAlpha(fragDistance, uTroikaEdgeOffset, max(aaDist * uKvSoftness, uTroikaBlurRadius));
    gl_FragColor = vec4(gl_FragColor.rgb, edgeAlpha * (1.0 - kvInside)); // rgb = the text colour
  }
`;

function patchFragment(src) {
  // the anchors below are troika-three-text 0.52's FRAGMENT_TRANSFORM; flag it if an upgrade moves them
  if (import.meta.env.DEV && !(src.includes("gl_FragColor.a *= edgeAlpha;") && src.includes("max(aaDist, uTroikaBlurRadius)"))) {
    console.warn("[webgl] troika fragment shader changed: text softness / outline patch not applied");
  }
  let out = src.replace(/max\(aaDist, uTroikaBlurRadius\)/g, "max(aaDist * uKvSoftness, uTroikaBlurRadius)");
  // coverage grows by the outer stroke width; the band itself is written right after troika's alpha
  out = out.replace(
    "troikaGetEdgeAlpha(fragDistance, uTroikaEdgeOffset, max(aaDist * uKvSoftness",
    "troikaGetEdgeAlpha(fragDistance, uTroikaEdgeOffset + uKvOuterStroke, max(aaDist * uKvSoftness",
  );
  out = out.replace("gl_FragColor.a *= edgeAlpha;", "gl_FragColor.a *= edgeAlpha;\n" + OUTER_STROKE);
  const at = out.lastIndexOf("void main()");
  const brace = out.indexOf("{", at);
  const intro = /* glsl */ `
  if (uKvRevealOn > 0.5 && (vKvY > uKvMaskTop || vKvY < uKvMaskBottom)) discard;
`;
  out = out.slice(0, brace + 1) + intro + out.slice(brace + 1);
  return FRAG_DEFS + out;
}

// Create a single-line troika text on layer 1 (the text pass), unlit, depth-free.
// outline > 0 (in em) draws only an outer outline of that width, in the text colour.
export function createText({ text, font, color = "#ffffff", outline = 0 }) {
  const t = new KVText();
  t.text = text;
  t.font = fontURL(font);
  t.fontSize = 1;
  t.anchorX = "left";
  t.anchorY = "top-baseline";
  t.whiteSpace = "nowrap";
  t.color = color;
  t.material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  if (outline > 0) t.kv.uKvOuterStroke.value = outline;
  t.layers.set(1);
  t.frustumCulled = false;
  return t;
}

// A title glued to a camera, sized in CSS px against a 1440 px design width (SPEC_WEBGL §6.2):
// at t = 0 the text is left-aligned (after marginLeft), at t = 1 right-aligned (before marginRight);
// the text is wider than the screen, so increasing t slides it leftwards like a marquee.
export class CameraTitle {
  constructor({ text, font, color, fontSizePx, offsetYPx = 0, marginLeftPx = 0, marginRightPx = 0, stagger = 0.055, softness = 6, reveal = true }) {
    this.cfg = { fontSizePx, offsetYPx, marginLeftPx, marginRightPx, stagger, softness, reveal, distance: 5 };
    this.anchor = new THREE.Group();
    this.anchor.name = "camera-title-anchor";
    this.mesh = createText({ text, font, color });
    this.anchor.add(this.mesh);
    this._pos = new THREE.Vector3();
    this._quat = new THREE.Quaternion();
  }

  async load() {
    await this.mesh.syncAsync();
    this.mesh.setupReveal({ enabled: this.cfg.reveal, stagger: this.cfg.stagger, softness: this.cfg.softness });
  }

  // camera: the scene camera (world matrix up to date); t: marquee position; viewport: CSS px
  update(camera, t, viewport, revealProgress = 1) {
    camera.getWorldPosition(this._pos);
    camera.getWorldQuaternion(this._quat);
    this.anchor.position.copy(this._pos);
    this.anchor.quaternion.copy(this._quat);

    const c = this.cfg;
    const info = this.mesh.textRenderInfo;
    const layoutW = info ? info.blockBounds[2] - info.blockBounds[0] : 0;
    const a = clamp(viewport.width / 1440, 0.45, 2);
    const fs = c.fontSizePx * a;
    const ml = c.marginLeftPx * a;
    const mr = c.marginRightPx * a;
    const oy = c.offsetYPx * a;
    const h = 2 * Math.tan((camera.fov * Math.PI) / 360) * c.distance; // world height of the plane
    const wW = h * (viewport.width / Math.max(1, viewport.height));
    const pxToWorld = h / Math.max(1, viewport.height);
    const scale = fs * pxToWorld; // fontSize 1 → 1 em = fs px
    const textW = layoutW * scale;
    const left = -wW / 2 + ml * pxToWorld;
    const right = wW / 2 - mr * pxToWorld - textW;
    // baseline placed where the reference's MSDF layout puts it (cap band ≈ centred below offsetY)
    const baseline = (oy - BASELINE_EM * fs) * pxToWorld;
    this.mesh.position.set(left + (right - left) * t, baseline, -c.distance);
    this.mesh.scale.setScalar(scale);
    if (c.reveal) this.mesh.revealProgress = revealProgress;
  }

  dispose() {
    this.mesh.dispose();
  }
}
