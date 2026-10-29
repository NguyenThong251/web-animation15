// Scene 2 · stele (style 1): one doctoral stele on its stone turtle, close up. The camera path is
// scrubbed by the stele progress; the point light orbits on its own (8 s loop) so the carved
// columns catch moving rims of light; 700 additive incense/dust motes drift through it; the year
// the first steles were raised, "1484", rises behind the stone.
import * as THREE from "three";
import { BaseScene, damp, prepareShadowCasters } from "./base.js";
import { CameraTitle } from "../text.js";
import { createFloatingParticles } from "../particles.js";
import { STYLE, FONTS, STELE_TEXT, remap } from "../config.js";

const LIGHT_LOOP = 8; // seconds per orbit

export class SteleScene extends BaseScene {
  constructor(engine, models) {
    super(engine, {
      id: "stele",
      style: STYLE.stele,
      fov: { desktop: 23.99, mobile: 27.99 },
      needsTextPass: true,
    });
    this.models = models;
    this.camera.near = 0.1;
    this.camera.far = 200;
    this.rig = new THREE.Object3D();
    this.rig.add(this.camera);
    this.scene.add(this.rig);
    this.target = new THREE.Vector3();
    this._pos = new THREE.Vector3();
    this.lightTime = 0;
  }

  async load({ isMobile, quality }) {
    // the builder's default columns: the 1442 heading, then the stele's passage 賢材國家之元氣…
    const built = await this.models.buildSteleOnTurtle(THREE, { title: STELE_TEXT.title, quality });
    const { group, anchors, size } = built;
    prepareShadowCasters(group);
    this.modelDispose = typeof built.dispose === "function" ? built.dispose : null;
    this.scene.add(group);
    group.updateMatrixWorld(true);

    // frame everything from the turtle's feet to the crest
    const box = new THREE.Box3().setFromObject(group);
    const face = anchors?.face?.clone() ?? box.getCenter(new THREE.Vector3());
    const Ht = Math.max(0.5, (anchors?.top?.y ?? box.max.y) - (anchors?.base?.y ?? box.min.y));
    const centre = box.getCenter(new THREE.Vector3());
    // the inscribed face looks along +Z unless the anchors say otherwise
    const n = new THREE.Vector3(face.x - centre.x, 0, face.z - centre.z);
    if (n.lengthSq() < 1e-6) n.set(0, 0, 1);
    n.normalize();
    const right = new THREE.Vector3(n.z, 0, -n.x); // screen-right when looking at the face
    const up = new THREE.Vector3(0, 1, 0);
    const d = Ht * 3.1; // fov 24° frames ~1.3 × the height at this distance
    const at = (o, a, b, c) => o.clone().addScaledVector(n, a).addScaledVector(right, b).addScaledVector(up, c);
    this.size = { Ht, w: size?.w ?? box.max.x - box.min.x };

    // start low and to the left of the inscription, rise round to the right, end close on the columns
    this.posCurve = new THREE.CatmullRomCurve3(
      [
        at(centre, d * 0.95, -d * 0.36, -Ht * 0.12),
        at(centre, d * 1.0, -d * 0.05, Ht * 0.05),
        at(centre, d * 0.88, d * 0.42, Ht * 0.22),
        at(face, d * 0.62, d * 0.2, Ht * 0.28),
      ],
      false,
      "centripetal",
    );
    this.targetCurve = new THREE.CatmullRomCurve3(
      [
        at(centre, 0, 0, Ht * 0.08),
        at(centre, 0, 0, Ht * 0.1),
        at(centre, 0, 0, Ht * 0.05),
        at(face, 0, 0, Ht * 0.12),
      ],
      false,
      "centripetal",
    );

    // orbiting key light (SPEC_WEBGL §5.2): intensity 7, decay 1.7, 512² PCF shadows
    const light = new THREE.PointLight(0xffffff, 7, 0, 1.7);
    light.castShadow = true;
    light.shadow.mapSize.set(512, 512);
    light.shadow.normalBias = 0.012;
    light.shadow.bias = -5e-4;
    light.shadow.camera.near = 0.1;
    light.shadow.camera.far = Math.max(5, Ht * 3);
    light.shadow.camera.updateProjectionMatrix();
    this.light = light;
    this.orbit = {
      centre: at(centre, Ht * 0.1, 0, Ht * 0.18),
      radius: Ht * 0.62,
      n,
      right,
    };
    this.scene.add(light);
    this.placeLight(0);

    // incense smoke / dust in the light: the reference volume scaled to the stele's height
    const k = Ht / 2.4;
    const origin = at(centre, Ht * 0.15, 0, Ht * 0.1);
    this.particles = createFloatingParticles({
      count: isMobile ? 320 : 700,
      bounds: [4 * k, 3 * k, 4 * k],
      sizeRange: [0.01 * k, 0.02 * k],
      origin: [origin.x, origin.y, origin.z],
      noiseScale: 0.44 / k,
      noiseIntensity: 0.77 * k,
      yDrift: 0.5 * k,
    });
    this.scene.add(this.particles);

    this.title = new CameraTitle({
      text: "1484",
      font: FONTS.regular,
      color: "#aaaaaa",
      fontSizePx: 388,
      offsetYPx: 200,
      marginLeftPx: 600,
      marginRightPx: 600,
      stagger: 0.075,
      softness: 6,
      reveal: true,
    });
    this.scene.add(this.title.anchor);
    await this.title.load();
    this.place(0, { nx: 0, ny: 0 }, 1, false);
  }

  placeLight(t) {
    const o = this.orbit;
    const a = (t / LIGHT_LOOP) * Math.PI * 2;
    this.light.position
      .copy(o.centre)
      .addScaledVector(o.right, Math.cos(a) * o.radius)
      .addScaledVector(o.n, Math.sin(a) * o.radius * 0.9);
    this.light.position.y += Math.sin(a * 2) * o.radius * 0.18;
  }

  place(p, pointer, k, reducedMotion) {
    const pos = this.posCurve.getPointAt(p, this._pos);
    this.targetCurve.getPointAt(p, this.target);
    this.rig.position.copy(pos);
    this.rig.rotation.set(0, Math.atan2(-(this.target.x - pos.x), -(this.target.z - pos.z)), 0);
    this.rig.updateMatrixWorld(true);
    // subtle parallax: the reference nudges an animated camera toward (pointer × 0.8) by 2·dt,
    // which reads as a few percent of the framing — expressed here relative to the stele's height
    const s = reducedMotion ? 0 : 0.8 * this.size.Ht * 0.06;
    const cam = this.camera;
    cam.position.x += (pointer.nx * s - cam.position.x) * k;
    cam.position.y += (pointer.ny * s - cam.position.y) * k;
    cam.updateMatrixWorld(true);
    cam.lookAt(this.target);
    cam.updateMatrixWorld(true);
  }

  update({ dt, time, progress, pointer, reducedMotion }) {
    this.lightTime += dt; // the light loop only advances while the scene is on screen
    this.placeLight(this.lightTime);
    this.particles.material.uniforms.uTime.value = time;
    this.place(progress, pointer, damp(2, dt), reducedMotion);
    this.title.update(this.camera, remap(progress, 0.1, 1, 0, 1.2), this.viewport, progress);
  }

  dispose() {
    this.title?.dispose();
    this.modelDispose?.();
    super.dispose();
  }
}
