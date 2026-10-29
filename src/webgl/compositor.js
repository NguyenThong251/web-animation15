// The ONE full-screen compositor (SPEC_WEBGL §8): it reads the render targets of the one or two
// active scenes (+ their text / background passes and the hero's depth), applies the per-scene
// style (duotone halftone, vignettes, paper micro-dots…), the scene transition (horizontal push,
// vertical push, rounded 4-point-star iris), the mouse ink trail and the intro reveal, and writes
// the canvas. Everything is computed in the reference's top-left uv space ("TL", y down).
import * as THREE from "three";
import { FULLSCREEN_VERT, MATH, HALFTONE, STAR } from "./glsl.js";
import { HALFTONE as HT, PALETTE } from "./config.js";
import { createSolidTexture, createDepthPlaceholder } from "./textures.js";

const FRAG = /* glsl */ `
uniform sampler2D uScene1;
uniform sampler2D uText1;
uniform sampler2D uBg1;
uniform sampler2D uDepth1;
uniform sampler2D uScene2;
uniform sampler2D uText2;
uniform sampler2D uBg2;
uniform sampler2D uDepth2;
uniform sampler2D uSplat;
uniform sampler2D uDotPattern;
uniform sampler2D uRevealMask;

uniform int uStyle1;
uniform int uStyle2;
uniform int uTransitionStyle;
uniform float uTransition;
uniform float uFooterOffset;
uniform float uCompiled;
uniform vec2 uRes;

uniform float uDotCount;
uniform float uDotRotation;
uniform float uDotMaxRadius;
uniform float uDotBrightness;
uniform float uDotContrast;
uniform float uPatternDensity;
uniform float uPatternOpacity;

uniform vec3 uPrimary;
uniform vec3 uSecondary;
uniform vec3 uTransitionColor;

uniform float uRevealActive;
uniform float uRevealProgress;
uniform float uRevealDepthProgress;

varying vec2 vUv;

${MATH}
${HALFTONE}
${STAR}

// sample a render target with a TL uv (WebGL render targets are bottom-left)
vec4 texTL(sampler2D t, vec2 uv) { return texture2D(t, vec2(uv.x, 1.0 - uv.y)); }

float aspectRatio() { return uRes.x / max(uRes.y, 1.0); }

// radial vignette, centre (0.5, cy) in TL space → cy = 1 glows at the bottom centre
float vignetteQ(vec2 uv, float cy, float cmin, float smax) {
  return smoothstep(0.0, smax, clamp(length((uv - vec2(0.5, cy)) * vec2(aspectRatio(), 1.0)), cmin, 1.0));
}

float halftone(vec3 src, vec2 frag) {
  return kvHalftone(src, frag, uRes, uDotCount, uDotRotation, uDotMaxRadius, uDotBrightness, uDotContrast);
}

// paper: a 6×6 two-dot tile repeated uPatternDensity times per screen height
vec3 paper(vec3 a, vec3 b, vec2 frag) {
  float ink = 1.0 - texture2D(uDotPattern, frag / uRes.yy * uPatternDensity).r;
  return mix(a, b, ink * uPatternOpacity);
}

// intro: the hero materialises by depth (near first) behind a band of transition-colour dots
vec2 revealDepth(float depth, float alpha, vec2 frag) {
  float r = kvRemapClamp(depth, 0.92, 1.0, 0.0, 1.0);
  float n = kvRemapClamp(uRevealDepthProgress, 0.05, 1.0, 0.0, 1.0);
  float a = kvRemapClamp(uRevealDepthProgress, 0.0, 0.95, 0.0, 1.0);
  float edge = 0.04;
  float v = r + (1.0 - alpha);
  float inner = kvHalftone(vec3(smoothstep(n - edge, n + edge, v)), frag, uRes, 136.0, uDotRotation, 2.2, 0.0, 1.0);
  float outer = kvHalftone(vec3(smoothstep(a - edge, a + edge, v)), frag, uRes, 116.0, uDotRotation, 1.8, 0.0, 1.0);
  return vec2(inner, outer);
}

// text passes are rendered with normal blending onto transparent black → premultiplied colour
vec3 unpremultiply(vec4 c) { return c.rgb / max(c.a, 1e-4); }

// style 0 — hero: model and background are halftoned separately with inverted duotones
vec3 styleHero(vec2 u, vec2 a, vec3 Y, vec2 frag, sampler2D sc, sampler2D tx, sampler2D bg, sampler2D dp) {
  vec4 i = texTL(sc, u);
  vec4 l = texTL(tx, a);
  vec4 s = texTL(bg, a);
  float depth = texTL(dp, u).r;
  vec3 c = mix(s.rgb, unpremultiply(l), l.a) * (1.0 - vignetteQ(u, 1.0, 0.4, 1.15));
  float d = halftone(c, frag);
  float p = halftone(i.rgb, frag);
  vec3 f = mix(uPrimary, uSecondary, d); // background: dark → pink, light → blue
  vec3 m = mix(uSecondary, uPrimary, p); // model: dark → blue, light → pink
  vec2 h = revealDepth(depth, i.a, frag);
  vec3 g = mix(m, uTransitionColor, h.x);
  g = mix(g, f, h.y);
  return mix(g, uPrimary, Y.r * (1.0 - i.a) * (1.0 - l.a) * 10.0);
}

// style 1 — stele: vignette glow + title behind the lit stone, one duotone
vec3 styleStele(vec2 u, vec2 a, vec3 Y, vec2 frag, sampler2D sc, sampler2D tx) {
  vec4 i = texTL(sc, u);
  vec4 o = texTL(tx, a);
  vec3 src = mix(vec3(1.0 - vignetteQ(u, 1.0, 0.3, 0.85)) + o.rgb, i.rgb, i.a);
  float d = halftone(src, frag);
  return mix(mix(uSecondary, uPrimary, d), uPrimary, Y.r * (1.0 - i.a) * (1.0 - o.a) * 10.0);
}

// style 4 — hands: pink paper with blue micro-dots, white title behind the halftoned tools
vec3 styleHands(vec2 u, vec3 Y, vec2 frag, sampler2D sc, sampler2D tx) {
  vec4 n = texTL(sc, u);
  vec4 a = texTL(tx, u);
  vec3 bg = paper(uPrimary, uSecondary, frag);
  vec3 tool = mix(uSecondary, uPrimary, n.r);
  vec3 l = mix(bg + a.r, tool, n.a);
  return mix(l, uSecondary, Y.r * (1.0 - n.a) * (1.0 - a.a) * 5.0);
}

// styles 2 (depth photo), 3 (paper), 5 (closing wall): the scene as is, white where text is drawn
vec3 styleFlat(vec2 u, sampler2D sc, sampler2D tx) {
  return mix(texTL(sc, u).rgb, vec3(1.0), texTL(tx, u).a);
}

vec3 styleOf(int style, vec2 u, vec3 Y, vec2 frag, sampler2D sc, sampler2D tx, sampler2D bg, sampler2D dp) {
  vec2 a = u - Y.gb; // ink-refracted uv
  if (style == 0) return styleHero(u, a, Y, frag, sc, tx, bg, dp);
  if (style == 1) return styleStele(u, a, Y, frag, sc, tx);
  if (style == 4) return styleHands(u, Y, frag, sc, tx);
  return styleFlat(u, sc, tx);
}

vec3 slot1(vec2 u, vec3 Y, vec2 frag) { return styleOf(uStyle1, u, Y, frag, uScene1, uText1, uBg1, uDepth1); }
vec3 slot2(vec2 u, vec3 Y, vec2 frag) { return styleOf(uStyle2, u, Y, frag, uScene2, uText2, uBg2, uDepth2); }

// rounded 4-point star that zooms, rotates −112.5° and sharpens from blobby to crisp; 0 inside
float starMask(float v, vec2 uv) {
  float n = pow(v * 1.2, 0.6);
  float innerR = kvRemapClamp(n, 0.4, 1.0, 0.32, 0.30);
  float borderR = kvRemapClamp(n, 0.4, 1.0, 0.30, 0.01);
  float rot = kvRemapClamp(n, 0.0, 1.2, 0.0, -0.75 * KV_PI);
  float scale = 1000.0 * pow(0.18 / 1000.0, n);
  vec2 c = (uv * 2.0 - 1.0) * scale;
  vec2 d = vec2(c.x * aspectRatio(), c.y);
  float sd = kvSdStar4Rounded(kvRotate(d, rot), 1.0, innerR, borderR);
  float aa = max(fwidth(sd), 1.0 / max(uRes.y, 1.0));
  return smoothstep(0.0, aa, sd);
}

void main() {
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);

  // ink trail: R = ink, G = growth front; refraction offset from the ink gradient (TL derivative)
  vec4 sp = texture2D(uSplat, vUv);
  float splatDots = kvDotScreen(frag, uRes, 140.0, uDotRotation, 0.3, 1.45);
  vec2 grad = vec2(dFdx(sp.r), -dFdy(sp.r)) * uRes;
  vec3 Y = vec3((1.0 - splatDots) * sp.g, grad * -25e-5);

  float v = uTransition;
  vec3 ec;
  if (v < 0.005) {
    // a single scene: shift with the footer so the image scrolls up with the document
    ec = slot1(uv + vec2(0.0, uFooterOffset), Y, frag);
  } else if (uTransitionStyle == 0) {
    // horizontal parallax push: the edge sweeps right → left, contents travel at half speed
    vec3 s = slot1(uv + vec2(v * 0.5, 0.0), Y, frag);
    vec3 p = slot2(uv - vec2((1.0 - v) * 0.5, 0.0), Y, frag);
    ec = mix(s, p, step(1.0 - uv.x, v));
  } else if (uTransitionStyle == 1) {
    // vertical parallax push: the new scene rises from the bottom
    vec3 s = slot1(uv + vec2(0.0, v * 0.5), Y, frag);
    vec3 p = slot2(uv - vec2(0.0, (1.0 - v) * 0.5), Y, frag);
    ec = mix(s, p, step(1.0 - uv.y, v));
  } else {
    vec3 s = slot1(uv, Y, frag);
    vec3 p = slot2(uv, Y, frag);
    ec = mix(s, p, 1.0 - starMask(v, uv));
  }

  // before the scenes are compiled: blue paper with pink micro-dots (behind the DOM loader)
  ec = mix(paper(uSecondary, uPrimary, frag), ec, uCompiled);

  // intro reveal: an ink blot opens from its darkest point, edged by a dithered pink ring
  vec3 outc = ec;
  if (uRevealActive > 0.5) {
    vec2 muv = (kvCoverUv(uv, uRes, vec2(512.0)) - 0.5) + 0.5;
    float m = texture2D(uRevealMask, vec2(muv.x, 1.0 - muv.y)).r;
    float a = kvRemapClamp(uRevealProgress, 0.1, 1.0, 0.0, 1.0);
    float o = kvRemapClamp(uRevealProgress, 0.0, 0.9, 0.0, 1.0);
    float inner = kvHalftone(vec3(smoothstep(a - 0.16, a + 0.16, m)), frag, uRes, 136.0, uDotRotation, 2.2, 0.0, 1.0);
    float outer = kvHalftone(vec3(smoothstep(o - 0.16, o + 0.16, m)), frag, uRes, 136.0, uDotRotation, 1.8, 0.0, 1.0);
    outc = mix(outc, uTransitionColor, inner);
    outc = mix(outc, uSecondary, outer);
  }

  gl_FragColor = vec4(clamp(outc, 0.0, 1.0), 1.0);
  #include <colorspace_fragment>
}
`;

export class Compositor {
  constructor(renderer, { dotPattern, revealMask }) {
    this.renderer = renderer;
    // shared text / background passes for slot 1 and 2 (SPEC_WEBGL §2)
    const rtOpts = { depthBuffer: true, stencilBuffer: false, generateMipmaps: false };
    this.textRT = [new THREE.WebGLRenderTarget(1, 1, rtOpts), new THREE.WebGLRenderTarget(1, 1, rtOpts)];
    this.bgRT = [new THREE.WebGLRenderTarget(1, 1, rtOpts), new THREE.WebGLRenderTarget(1, 1, rtOpts)];

    // placeholders: an opaque black scene, transparent text/background, "far" depth
    this.blank = {
      scene: createSolidTexture(0, 0, 0, 255),
      empty: createSolidTexture(0, 0, 0, 0),
      depth: createDepthPlaceholder(),
    };

    const color = (hex) => new THREE.Color(hex);
    this.uniforms = {
      uScene1: { value: this.blank.scene },
      uText1: { value: this.blank.empty },
      uBg1: { value: this.blank.empty },
      uDepth1: { value: this.blank.depth },
      uScene2: { value: this.blank.scene },
      uText2: { value: this.blank.empty },
      uBg2: { value: this.blank.empty },
      uDepth2: { value: this.blank.depth },
      uSplat: { value: this.blank.scene },
      uDotPattern: { value: dotPattern },
      uRevealMask: { value: revealMask },
      uStyle1: { value: 0 },
      uStyle2: { value: 0 },
      uTransitionStyle: { value: 0 },
      uTransition: { value: 0 },
      uFooterOffset: { value: 0 },
      uCompiled: { value: 0 },
      uRes: { value: new THREE.Vector2(1, 1) },
      uDotCount: { value: HT.count },
      uDotRotation: { value: HT.rotation },
      uDotMaxRadius: { value: HT.maxRadius },
      uDotBrightness: { value: HT.brightness },
      uDotContrast: { value: HT.contrast },
      uPatternDensity: { value: 120 },
      uPatternOpacity: { value: 1 },
      uPrimary: { value: color(PALETTE.primary) },
      uSecondary: { value: color(PALETTE.secondary) },
      uTransitionColor: { value: color(PALETTE.transition) },
      uRevealActive: { value: 1 },
      uRevealProgress: { value: -1 },
      uRevealDepthProgress: { value: -1 },
    };

    this.material = new THREE.ShaderMaterial({
      name: "kv-compositor",
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: FRAG,
      uniforms: this.uniforms,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  resize(bufferWidth, bufferHeight) {
    for (const rt of [...this.textRT, ...this.bgRT]) rt.setSize(bufferWidth, bufferHeight);
    this.uniforms.uRes.value.set(bufferWidth, bufferHeight);
  }

  // bind one scene's targets to slot 0/1 (slot 1 = second scene of a transition)
  bind(slot, scene) {
    const u = this.uniforms;
    const k = slot === 0 ? "1" : "2";
    u[`uScene${k}`].value = scene ? scene.rt.texture : this.blank.scene;
    u[`uText${k}`].value = scene?.needsTextPass ? this.textRT[slot].texture : this.blank.empty;
    u[`uBg${k}`].value = scene?.needsBackgroundPass ? this.bgRT[slot].texture : this.blank.empty;
    u[`uDepth${k}`].value = scene?.rt.depthTexture ?? this.blank.depth;
    u[`uStyle${k}`].value = scene ? scene.style : 0;
  }

  render() {
    const r = this.renderer;
    r.setRenderTarget(null);
    r.render(this.scene, this.camera);
  }

  dispose() {
    for (const rt of [...this.textRT, ...this.bgRT]) rt.dispose();
    Object.values(this.blank).forEach((t) => t.dispose());
    this.material.dispose();
    this.quad.geometry.dispose();
  }
}
