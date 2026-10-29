// Base class for one "chapter": its own THREE.Scene + camera + render target. The engine renders
// layer 0 into `rt`, layer 1 (titles) into the slot's text target when `needsTextPass`, and layer 2
// (sky) into the slot's background target when `needsBackgroundPass` (SPEC_WEBGL §2).
import * as THREE from "three";

export class BaseScene {
  constructor(engine, { id, style, fov = null, needsTextPass = false, needsBackgroundPass = false, needsDepthTexture = false, halfFloat = false }) {
    this.engine = engine;
    this.id = id;
    this.style = style;
    this.fov = fov; // { desktop, mobile } for perspective scenes
    this.needsTextPass = needsTextPass;
    this.needsBackgroundPass = needsBackgroundPass;
    this.scene = new THREE.Scene();
    this.scene.name = `scene-${id}`;
    this.camera = fov
      ? new THREE.PerspectiveCamera(fov.desktop, 1, 0.1, 1000)
      : new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.rt = new THREE.WebGLRenderTarget(1, 1, {
      type: halfFloat && engine.halfFloatTargets ? THREE.HalfFloatType : THREE.UnsignedByteType,
      depthBuffer: true,
      stencilBuffer: false,
      generateMipmaps: false,
      depthTexture: needsDepthTexture ? new THREE.DepthTexture(1, 1) : null,
    });
    this.rt.texture.name = `rt-${id}`;
    this.viewport = { width: 1, height: 1, isMobile: false };
  }

  // async content creation (models, textures, text layout); `track(promise)` reports progress
  async load() {}

  resize({ width, height, bufferWidth, bufferHeight, isMobile }) {
    this.viewport = { width, height, isMobile };
    this.rt.setSize(bufferWidth, bufferHeight);
    if (this.camera.isPerspectiveCamera) {
      this.camera.aspect = width / Math.max(1, height);
      this.camera.fov = isMobile ? this.fov.mobile : this.fov.desktop;
      this.camera.updateProjectionMatrix();
    }
    this.onResize?.();
  }

  // per-frame logic, only while this scene is one of the composited ones
  // frame = { dt, time, progress, state, pointer, reducedMotion, transition }
  update() {}

  dispose() {
    this.rt.dispose();
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        for (const v of Object.values(m)) if (v?.isTexture) v.dispose();
        m.dispose();
      }
    });
  }
}

// helpers shared by the 3D scenes ------------------------------------------------------------

// smoothstep-interpolated keyframe track [{ p, v }] (the hero roll, SPEC_WEBGL §5.1)
export function keyframes(track, p) {
  const t = Math.min(1, Math.max(0, p));
  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1];
    const b = track[i];
    if (t > b.p) continue;
    const k = (t - a.p) / Math.max(1e-6, b.p - a.p);
    return a.v + (b.v - a.v) * k * k * (3 - 2 * k);
  }
  return track[track.length - 1].v;
}

// frame-rate dependent damping used by the reference: lerp(target, k·dt)
export const damp = (k, dt) => Math.min(1, k * dt);

// every model mesh casts and receives shadows (the models API contract, enforced here in case a
// builder leaves a part out); the lit look relies on it because there is no ambient light
export function prepareShadowCasters(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
  });
}
