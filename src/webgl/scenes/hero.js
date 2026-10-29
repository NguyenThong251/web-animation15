// Scene 1 · hero (style 0): a drone flight over a procedural Văn Miếu – Quốc Tử Giám.
// Authored camera: CatmullRom position + target curves scrubbed by the hero progress, the banking
// roll track 0 → −50.3° → +29.4° → −1.3° (smoothstep between keys), pointer parallax, and a
// crane-in (y −3 → 0) during the intro reveal. One point light with shadows and NO ambient light,
// so unlit faces fall to solid colour in the halftone. A sky dome with flowing vertical streaks is
// rendered in the background pass, the camera-anchored title "KHUÊ VĂN" in the text pass.
import * as THREE from "three";
import { BaseScene, keyframes, damp, prepareShadowCasters } from "./base.js";
import { CameraTitle } from "../text.js";
import { PERLIN3 } from "../glsl.js";
import { STYLE, FONTS, remap } from "../config.js";

// metres → scene units: puts the pavilion at ~2.3 units so the reference's light (50 / decay 1.5),
// shadow range (15), parallax (±0.8), crane (−3) and depth-reveal window read at the same scale
const WORLD_SCALE = 0.25;

const ROLL = [
  { p: 0, v: 0 },
  { p: 0.33, v: -50.314 },
  { p: 0.66, v: 29.3582 },
  { p: 1, v: -1.33592 },
];

const SKY_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// white sky; 44 thin meridian lines whose noise-gated segments turn grey (0.4) and flow upward
const SKY_FRAG = /* glsl */ `
uniform float uTime;
uniform float uScaleX;
uniform float uScaleY;
uniform float uStep;
uniform float uNoiseSpeed;
uniform float uSpeed;
uniform float uAmplitude;
varying vec2 vUv;
${PERLIN3}
float lineMask(vec2 uv) {
  float f = fract(uv.x * 44.0);
  float d = min(f, 1.0 - f) / 44.0;          // distance to the nearest line, in u
  float w = 0.0011;                          // half width ≈ 0.4°
  float aa = fwidth(uv.x) * 0.75;
  float band = smoothstep(0.05, 0.08, uv.y) * (1.0 - smoothstep(0.92, 0.95, uv.y));
  return (1.0 - smoothstep(w - aa, w + aa, d)) * band;
}
void main() {
  vec2 i = vUv * vec2(uScaleX, uScaleY);
  i -= vec2(0.0, uTime * uSpeed);
  float l = kvPerlin(vec3(i, uTime * uNoiseSpeed)) * uAmplitude * lineMask(vUv);
  gl_FragColor = vec4(mix(vec3(0.4), vec3(1.0), step(l, uStep)), 1.0);
}
`;

export class HeroScene extends BaseScene {
  constructor(engine, models) {
    super(engine, {
      id: "hero",
      style: STYLE.hero,
      fov: { desktop: 47.76, mobile: 72.76 },
      needsTextPass: true,
      needsBackgroundPass: true,
      needsDepthTexture: true,
    });
    this.models = models;
    this.camera.near = 0.1;
    this.camera.far = 1000;
    this.rig = new THREE.Object3D();
    this.rig.name = "hero-camera-rig";
    this.rig.add(this.camera);
    this.scene.add(this.rig);
    this.crane = { y: 0 }; // tweened by the intro reveal
    this.target = new THREE.Vector3();
    this._v = new THREE.Vector3();
    this._pos = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
  }

  async load({ quality }) {
    const { group, anchors, dispose } = this.models.buildVanMieu(THREE, { quality });
    prepareShadowCasters(group);
    // the Thiên Quang well reads as water: a darker, glossier surface (blue in the halftone) that
    // catches a specular glint of the key light instead of a flat lit plane
    const water = group.getObjectByName("water");
    if (water?.isMesh) {
      water.material = new THREE.MeshStandardMaterial({ color: 0x585858, roughness: 0.3, metalness: 0 });
      water.castShadow = false;
    }
    this.modelDispose = typeof dispose === "function" ? dispose : null;
    this.world = new THREE.Group();
    this.world.name = "van-mieu";
    this.world.scale.setScalar(WORLD_SCALE);
    this.world.add(group);
    this.scene.add(this.world);

    const A = (name, fallback = new THREE.Vector3()) =>
      (anchors?.[name] ? anchors[name].clone() : fallback.clone()).multiplyScalar(WORLD_SCALE);
    const K = A("khueVanCac");
    const KT = A("khueVanCacTop", K.clone().add(new THREE.Vector3(0, 9.25, 0)));
    const P = A("pond");
    const SL = A("steleLeft", P.clone().add(new THREE.Vector3(-4, 0, 0)));
    const H = Math.max(1, KT.y - K.y); // pavilion height in units (≈2.31)
    // waypoints were authored on the procedural layout in scene units; k keeps them proportional
    // if the pavilion is rebuilt at another size, side mirrors them if the left row moves to +x
    const k = H / 2.31;
    const side = SL.x <= P.x ? 1 : -1;
    const G = new THREE.Vector3(P.x, 0, P.z); // the well's centre at ground level
    const v = (base, x, y, z) => base.clone().add(new THREE.Vector3(x * k * side, y * k, z * k));
    // +Z = entrance. The flight: Khuê Văn Các seen from the Đại Trung courtyard, rise and bank past
    // its upper storey, cross the Thiên Quang well toward the left stele house, run along its steles,
    // then swing round to look back at the pavilion across the well.
    this.posCurve = new THREE.CatmullRomCurve3(
      [
        v(K, 0, 1.55, 4.4),
        v(K, 0.8, 2.5, 2.7),
        v(K, 2.5, 2.55, -0.2),
        v(G, 1.3, 2.1, 0.9),
        v(G, -2.3, 1.75, -2.3),
        v(G, -1.3, 2.05, -5.0),
        v(G, 0.3, 2.2, -5.9),
      ],
      false,
      "centripetal",
    );
    this.targetCurve = new THREE.CatmullRomCurve3(
      [
        v(K, 0, 1.95, -2.5),
        v(K, -0.2, 2.35, -2.3),
        v(G, -1.2, 1.85, -1.5),
        v(SL, 0.4, 1.35, -1.3),
        v(SL, 0.3, 1.2, 4.1),
        v(K, 0, 2.0, -1.9),
        v(K, 0, 1.95, 0),
      ],
      false,
      "centripetal",
    );
    this.H = H;

    // key light: point light, shadows, no ambient (SPEC_WEBGL §5.1)
    const light = new THREE.PointLight(0xffffff, 50, 0, 1.5);
    light.castShadow = true;
    light.shadow.mapSize.set(512, 512);
    light.shadow.normalBias = 0.012;
    light.shadow.bias = -5e-4;
    light.shadow.camera.near = 0.1;
    light.shadow.camera.far = 15;
    light.shadow.camera.updateProjectionMatrix();
    this.light = light;
    this.scene.add(light);

    // sky dome (layer 2 → background pass), centred on the camera so its meridians stay vertical
    this.skyUniforms = {
      uTime: { value: 0 },
      uScaleX: { value: 350 },
      uScaleY: { value: 10.8 },
      uStep: { value: 0.1 },
      uNoiseSpeed: { value: 0.5 },
      uSpeed: { value: 2 },
      uAmplitude: { value: 1.6 },
    };
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(25, 96, 48),
      new THREE.ShaderMaterial({
        name: "kv-sky",
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        uniforms: this.skyUniforms,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    );
    sky.layers.set(2);
    sky.frustumCulled = false;
    sky.renderOrder = -1;
    this.sky = sky;
    this.scene.add(sky);

    // camera-anchored title (layer 1 → text pass)
    this.title = new CameraTitle({
      text: "KHUÊ VĂN",
      font: FONTS.regular,
      color: "#666666",
      fontSizePx: 388,
      offsetYPx: 200,
      stagger: 0.055,
      softness: 6,
      reveal: true,
    });
    this.scene.add(this.title.anchor);
    await this.title.load();

    this.place(0, { nx: 0, ny: 0 }, 1, false);
    this.camera.position.set(0, 0, 0);
  }

  // camera rig, light and sky for progress p; k = parallax damping factor
  place(p, pointer, k, reducedMotion) {
    const pos = this.posCurve.getPointAt(p, this._pos);
    this.targetCurve.getPointAt(p, this.target);
    this.rig.position.copy(pos);
    // yaw the rig so its −Z faces the target: pointer offsets are then camera-relative
    this.rig.rotation.set(0, Math.atan2(-(this.target.x - pos.x), -(this.target.z - pos.z)), 0);
    this.rig.updateMatrixWorld(true);

    const cam = this.camera;
    const tx = reducedMotion ? 0 : 0.8 * pointer.nx;
    const tz = reducedMotion ? 0 : -0.2 * pointer.ny;
    cam.position.x += (tx - cam.position.x) * k;
    cam.position.z += (tz - cam.position.z) * k;
    cam.position.y = this.crane.y;
    cam.updateMatrixWorld(true);
    cam.lookAt(this.target);
    const roll = keyframes(ROLL, p) * (reducedMotion ? 0 : 1);
    cam.rotateZ(THREE.MathUtils.degToRad(roll));
    cam.updateMatrixWorld(true);

    // key light rides above, left of and slightly ahead of the camera: the faces turned toward
    // the viewer catch the light (pink) and the shadows fall away from it (blue)
    cam.getWorldPosition(this._v);
    this._fwd.subVectors(this.target, this._v).setY(0);
    if (this._fwd.lengthSq() < 1e-6) this._fwd.set(0, 0, -1);
    this._fwd.normalize();
    this._right.set(-this._fwd.z, 0, this._fwd.x);
    const lp = this.light.position.copy(this._v);
    lp.addScaledVector(this._right, -1.5 * this.H).addScaledVector(this._fwd, 0.9 * this.H);
    lp.y = Math.max(lp.y, 0) + 1.0 * this.H;
    this.sky.position.copy(this._v);
  }

  update({ dt, time, progress, pointer, reducedMotion }) {
    this.place(progress, pointer, damp(2, dt), reducedMotion);
    this.skyUniforms.uTime.value = time;
    this.title.update(this.camera, remap(progress, 0.2, 1, 0, 1.4), this.viewport, progress);
  }

  dispose() {
    this.title?.dispose();
    this.modelDispose?.();
    super.dispose();
  }
}
