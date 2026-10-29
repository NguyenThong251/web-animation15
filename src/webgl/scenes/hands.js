// Scene 5 · hands (style 4): Hán-Nôm meets Quốc ngữ — a calligraphy brush (bút lông) reaches from
// the left toward a steel dip-pen nib (ngòi bút) from the right, tips almost touching, drifting
// apart by ±0.18 as you scroll. Both are drawn with the N·L halftone material (black/white dots,
// mapped to blue/pink by the compositor over pink paper), with a giant white "QUỐC NGỮ" behind.
import * as THREE from "three";
import { BaseScene, damp } from "./base.js";
import { CameraTitle } from "../text.js";
import { MATH, HALFTONE } from "../glsl.js";
import { STYLE, FONTS, remap } from "../config.js";

const NL_VERT = /* glsl */ `
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
void main() {
  vec4 p = vec4(position, 1.0);
  vec3 n = normal;
  #ifdef USE_INSTANCING
    p = instanceMatrix * p;
    n = mat3(instanceMatrix) * n;
  #endif
  vec4 wp = modelMatrix * p;
  vWorldPos = wp.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * n);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

// strength = remapClamp(dot(N, L − P), −1, 1, edgeEnd, edgeStart) — un-normalised on purpose, so the
// shading is distance-sensitive: faces toward the light get no dots (white), faces away merge to black.
// uTone darkens materials the model authored as dark (ink-soaked hair, lacquer, steel).
const NL_FRAG = /* glsl */ `
uniform vec3 uLightWorldPosition;
uniform vec2 uRes;
uniform float uDotCount;
uniform float uDotRotation;
uniform float uDotMaxRadius;
uniform float uEdgeStart;
uniform float uEdgeEnd;
uniform vec3 uColorStart;
uniform vec3 uColorEnd;
uniform float uTone;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
${MATH}
${HALFTONE}
void main() {
  vec3 s = uLightWorldPosition - vWorldPos;
  vec3 n = normalize(vWorldNormal) * (gl_FrontFacing ? 1.0 : -1.0);
  float u = kvRemapClamp(dot(n, s), -1.0, 1.0, uEdgeEnd, uEdgeStart) + uTone;
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  float c = kvDotScreen(frag, uRes, uDotCount, uDotRotation, u, uDotMaxRadius);
  gl_FragColor = vec4(mix(uColorStart, uColorEnd, c), 1.0);
}
`;

const PARALLAX = 0.15;

export class HandsScene extends BaseScene {
  constructor(engine, models) {
    super(engine, {
      id: "hands",
      style: STYLE.hands,
      fov: { desktop: 22.91, mobile: 45.91 },
      needsTextPass: true,
    });
    this.models = models;
    this.camera.near = 0.1;
    this.camera.far = 100;
    this.rig = new THREE.Object3D();
    this.rig.add(this.camera);
    this.scene.add(this.rig);
    this.target = new THREE.Vector3(0, 0, 0);
    this.idleTime = 0;
    this.shared = {
      uLightWorldPosition: { value: new THREE.Vector3() },
      uRes: { value: new THREE.Vector2(1, 1) },
      uDotCount: { value: 200 },
      uDotRotation: { value: 0.25 },
      uDotMaxRadius: { value: 2 },
      uEdgeStart: { value: -0.8 },
      uEdgeEnd: { value: 1.3 },
      uColorStart: { value: new THREE.Color(0x000000) },
      uColorEnd: { value: new THREE.Color(0xffffff) },
    };
  }

  // one halftone material per source material; its luminance becomes a tone offset
  halftoneMaterial(source, cache) {
    const key = source?.uuid ?? "default";
    if (cache.has(key)) return cache.get(key);
    const col = source?.color ?? new THREE.Color(1, 1, 1);
    const lum = 0.2126 * col.r + 0.7152 * col.g + 0.0722 * col.b; // linear
    const m = new THREE.ShaderMaterial({
      name: "kv-halftone-nl",
      vertexShader: NL_VERT,
      fragmentShader: NL_FRAG,
      uniforms: { ...this.shared, uTone: { value: (1 - Math.min(1, lum)) * 0.9 } },
      side: THREE.FrontSide,
    });
    cache.set(key, m);
    return m;
  }

  // rotate a tool so its tip→handle axis points along `dir`, then move its tip onto `tipAt`
  mount(tool, tipAt, dir, name) {
    // holder (scroll drift) → inner (sits on the tip; idle sway pivots there) → pivot (aligns) → model
    // tip / axis are expressed in the space the builder returned the group in
    const holder = new THREE.Group();
    holder.name = name;
    const inner = new THREE.Group();
    const pivot = new THREE.Group();
    pivot.add(tool.group);
    inner.add(pivot);
    const axis = (tool.axis?.clone() ?? new THREE.Vector3(0, 1, 0)).normalize();
    const tip = tool.tip?.clone() ?? new THREE.Vector3();
    const q = new THREE.Quaternion().setFromUnitVectors(axis, dir.clone().normalize());
    pivot.quaternion.copy(q);
    pivot.position.copy(tip.applyQuaternion(q).negate());
    inner.position.copy(tipAt);
    holder.add(inner);
    this.scene.add(holder);
    return { holder, inner, rest: tipAt.clone() };
  }

  async load() {
    const brush = this.models.buildBrush(THREE);
    const pen = this.models.buildPen(THREE);
    const cache = new Map();
    for (const tool of [brush, pen]) {
      tool.group.traverse((o) => {
        if (!o.isMesh) return;
        o.material = this.halftoneMaterial(Array.isArray(o.material) ? o.material[0] : o.material, cache);
        o.castShadow = o.receiveShadow = false; // the N·L shader ignores shadows
      });
    }
    // tips almost touching at the centre. Like the two arms of the fresco, both handles rise away
    // from the meeting point (a shallow V): the brush from the left, the nib holder from the right.
    this.brush = this.mount(brush, new THREE.Vector3(-0.018, -0.008, 0), new THREE.Vector3(-1, 0.13, 0.16), "brush");
    this.pen = this.mount(pen, new THREE.Vector3(0.018, 0.012, 0), new THREE.Vector3(1, 0.3, -0.14), "pen");

    // close top light, slightly behind: tops white, the faces toward us a halftone ramp, undersides
    // solid ink; |L − P| < 1 keeps the un-normalised N·(L − P) inside the dot ramp
    this.light = new THREE.PointLight(0xffffff, 1, 0, 2);
    this.light.position.set(-0.08, 0.72, -0.18);
    this.scene.add(this.light);

    // gentle drift past the meeting point, ~1 m away (pulled back on narrow screens in place())
    this.posCurve = new THREE.CatmullRomCurve3(
      [new THREE.Vector3(-0.09, -0.03, 1.12), new THREE.Vector3(0.0, 0.0, 1.05), new THREE.Vector3(0.08, 0.035, 0.98)],
      false,
      "centripetal",
    );
    this.targetCurve = new THREE.CatmullRomCurve3(
      [new THREE.Vector3(-0.015, 0.006, 0), new THREE.Vector3(0, 0.004, 0), new THREE.Vector3(0.015, 0.0, 0)],
      false,
      "centripetal",
    );

    this.title = new CameraTitle({
      text: "QUỐC NGỮ",
      font: FONTS.regular,
      color: "#ffffff",
      fontSizePx: 488,
      offsetYPx: 262,
      softness: 2,
      reveal: false,
    });
    this.scene.add(this.title.anchor);
    await this.title.load();
    this.place(0, { nx: 0, ny: 0 }, 1, 1, false);
  }

  onResize() {
    this.shared.uRes.value.set(this.rt.width, this.rt.height);
  }

  // t = paper→hands push progress while it runs (else 1): the camera starts 0.4 closer and eases out
  place(p, pointer, k, t, reducedMotion) {
    const pos = this.posCurve.getPointAt(p, this._pos);
    this.targetCurve.getPointAt(p, this.target);
    // portrait screens: back off so the tips (and their ±0.18 drift) stay inside the narrow frame
    const aspect = this.viewport.width / Math.max(1, this.viewport.height);
    const pull = aspect < 1 ? Math.min(1.45, 1 + (1 - aspect) * 0.9) : 1;
    pos.sub(this.target).multiplyScalar(pull).add(this.target);
    this.rig.position.copy(pos);
    this.rig.rotation.set(0, Math.atan2(-(this.target.x - pos.x), -(this.target.z - pos.z)), 0);
    this.rig.updateMatrixWorld(true);
    const cam = this.camera;
    // reference: target (px, py, −2(1 − t)) × 0.2 in a ~7-unit framing → scaled to our ~1 m framing
    const px = reducedMotion ? 0 : pointer.nx * 0.2 * PARALLAX;
    const py = reducedMotion ? 0 : pointer.ny * 0.2 * PARALLAX;
    const pz = -2 * (1 - t) * 0.2 * PARALLAX;
    cam.position.x += (px - cam.position.x) * k;
    cam.position.y += (py - cam.position.y) * k;
    cam.position.z += (pz - cam.position.z) * k;
    cam.updateMatrixWorld(true);
    cam.lookAt(this.target);
    cam.updateMatrixWorld(true);

    // brush and nib drift apart along x by 0.18 each over the section
    this.brush.holder.position.x = -0.18 * p;
    this.pen.holder.position.x = 0.18 * p;
  }

  update({ dt, progress, pointer, reducedMotion, transition }) {
    const intoHands = transition && transition.to === "hands" && transition.from === "paper";
    const t = intoHands ? transition.progress : 1;
    this.place(progress, pointer, damp(2, dt), t, reducedMotion);

    // idle: the tools breathe a little (≈19 s loop) like a hand holding them
    if (!reducedMotion) this.idleTime += dt;
    const w = (this.idleTime / 19.2) * Math.PI * 2;
    this.brush.inner.rotation.set(Math.sin(w * 2) * 0.012, 0, Math.sin(w) * 0.03);
    this.brush.inner.position.y = this.brush.rest.y + Math.sin(w * 3) * 0.006;
    this.pen.inner.rotation.set(Math.cos(w * 2) * 0.01, 0, Math.sin(w + 1.3) * 0.025);
    this.pen.inner.position.y = this.pen.rest.y + Math.cos(w * 3 + 0.4) * 0.006;

    this.light.updateMatrixWorld();
    this.light.getWorldPosition(this.shared.uLightWorldPosition.value);

    const s = intoHands ? 0.25 * t : 0.25 + 0.75 * progress;
    this.title.update(this.camera, remap(s, 0.1, 1, 0, 1.4), this.viewport);
  }

  dispose() {
    this.title?.dispose();
    super.dispose();
  }
}
