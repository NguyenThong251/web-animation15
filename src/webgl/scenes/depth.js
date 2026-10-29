// Scene 3 · depth (style 2, full colour — the one chapter that breaks the duotone on purpose):
// a 2.5D photo of Khuê Văn Các. The photo is cover-fitted and panned vertically with the scene
// progress; a synthetic depth map displaces the lookup so far pixels shift more with the pointer
// (parallax); a pink point light follows the pointer like a torch over an ambient fill.
// Lighting is the physically based Phong path of the reference (ambient 1.8, point light 1 /
// decay 1.2, Lambert = albedo / π, no specular, no emissive).
import * as THREE from "three";
import { BaseScene } from "./base.js";
import { STYLE, IMAGES, PALETTE } from "../config.js";
import { loadImage, imageTexture, createSyntheticDepthTexture } from "../textures.js";

const VERT = /* glsl */ `
varying vec3 vPos;
void main() {
  vPos = position; // plane spans −1..1, ortho camera → this is the light-space position too
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uPhoto;
uniform sampler2D uDepth;
uniform vec2 uImageSize;
uniform vec2 uRes;
uniform float uScroll;
uniform vec2 uParallax;
uniform float uStrength;
uniform float uAmbient;
uniform vec3 uLightColor;
uniform vec3 uLightPos;
uniform float uLightIntensity;
uniform float uLightDecay;
uniform float uSaturation;
uniform float uWash;
uniform vec3 uPaper;
varying vec3 vPos;
void main() {
  // screen uv in TL space
  vec2 screenUV = vec2(gl_FragCoord.x / uRes.x, 1.0 - gl_FragCoord.y / uRes.y);
  float aspectS = uRes.x / max(uRes.y, 1.0);
  float aspectI = uImageSize.x / uImageSize.y;
  vec2 fit = aspectI > aspectS ? vec2(aspectS / aspectI, 1.0) : vec2(1.0, aspectI / aspectS); // cover
  vec2 base = (screenUV - 0.5) * fit + 0.5;
  vec2 st = vec2(base.x, screenUV.y * fit.y + (1.0 - fit.y) * uScroll); // pan top → bottom
  float d0 = texture2D(uDepth, vec2(st.x, 1.0 - st.y)).r;
  vec2 st2 = st + uParallax * (1.0 - d0) * uStrength; // far pixels travel further
  vec3 albedo = texture2D(uPhoto, vec2(st2.x, 1.0 - st2.y)).rgb;

  vec3 L = uLightPos - vPos;
  float dist = length(L);
  float ndl = max(dot(vec3(0.0, 0.0, 1.0), L / max(dist, 1e-4)), 0.0);
  float falloff = 1.0 / max(pow(dist, uLightDecay), 0.01);
  vec3 irradiance = vec3(uAmbient) + uLightColor * uLightIntensity * ndl * falloff;
  vec3 c = albedo * irradiance * (1.0 / 3.141592653589793);
  // Archival-print wash. The reference pans a pale marble relief under dark (#333) sticky copy;
  // a saturated garden photo would swallow that copy, so lift it toward paper first.
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(lum), c, uSaturation);
  c = mix(c, uPaper, uWash);
  gl_FragColor = vec4(c, 1.0);
}
`;

export class DepthScene extends BaseScene {
  constructor(engine) {
    // half-float target: the photo stays linear without 8-bit banding in the shadows
    super(engine, { id: "depth", style: STYLE.depth, halfFloat: true });
    this.parallax = new THREE.Vector2();
    this.lightPos = new THREE.Vector3(0, 0, 0.5);
    this.uniforms = {
      uPhoto: { value: null },
      uDepth: { value: null },
      uImageSize: { value: new THREE.Vector2(1, 1) },
      uRes: { value: new THREE.Vector2(1, 1) },
      uScroll: { value: 0 },
      uParallax: { value: this.parallax },
      uStrength: { value: 0.012 },
      uAmbient: { value: 1.8 },
      uLightColor: { value: new THREE.Color(PALETTE.primary) },
      uLightPos: { value: this.lightPos },
      uLightIntensity: { value: 1 },
      uLightDecay: { value: 1.2 },
      uSaturation: { value: 0.45 },
      uWash: { value: 0.52 },
      uPaper: { value: new THREE.Color("#f1ece8") },
    };
  }

  async load() {
    const img = await loadImage(IMAGES.depthPhoto);
    this.uniforms.uPhoto.value = imageTexture(img);
    this.uniforms.uImageSize.value.set(img.naturalWidth, img.naturalHeight);
    // let the browser breathe between the decode and the CPU depth pass
    await new Promise((r) => requestAnimationFrame(() => r()));
    this.uniforms.uDepth.value = createSyntheticDepthTexture(img);

    const material = new THREE.ShaderMaterial({
      name: "kv-depth-photo",
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: this.uniforms,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  onResize() {
    this.uniforms.uRes.value.set(this.rt.width, this.rt.height);
  }

  update({ dt, time, progress, pointer, reducedMotion }) {
    this.uniforms.uScroll.value = progress;
    // idle wobble + pointer; parallax eases with 1 − e^(−5dt), the light with 5·dt
    const u = reducedMotion ? 0 : pointer.nx + 0.2 * Math.sin(time);
    const v = reducedMotion ? 0 : pointer.ny + 0.2 * Math.cos(0.7 * time);
    const kp = 1 - Math.exp(-5 * dt);
    this.parallax.x += (-u - this.parallax.x) * kp;
    this.parallax.y += (-v - this.parallax.y) * kp;
    const kl = Math.min(1, 5 * dt);
    this.lightPos.x += (u - this.lightPos.x) * kl;
    this.lightPos.y += (v - this.lightPos.y) * kl;
    this.lightPos.z = 0.5;
  }
}
