// Mouse "ink" splat (SPEC_WEBGL §7): a ping-pong half-float RG simulation. Each step advects the
// previous ink one texel along a tiled flow field, dilates it (4-neighbour max → the ink bleeds),
// stamps a capsule brush between the last and current pointer positions and decays it by 1.5 %.
// R = ink amount, G = growth front (ink added this step) — the compositor refracts the image with
// the gradient of R and stamps dots along G.
import * as THREE from "three";
import { FULLSCREEN_VERT } from "./glsl.js";

const SPLAT_FRAG = /* glsl */ `
uniform sampler2D uSrc;
uniform sampler2D uAdvect;
uniform vec2 uRes;
uniform vec2 uPos;
uniform vec2 uLast;
uniform float uRadius;
varying vec2 vUv;
void main() {
  vec2 e = vUv;
  vec2 t = 1.0 / uRes;
  vec2 r = texture2D(uAdvect, fract(e * 3.0)).xy * 2.0 - 1.0;
  vec2 i = e + r * t;
  float c = max(max(texture2D(uSrc, i + vec2(-t.x, 0.0)).r, texture2D(uSrc, i + vec2(t.x, 0.0)).r),
                max(texture2D(uSrc, i + vec2(0.0, t.y)).r, texture2D(uSrc, i + vec2(0.0, -t.y)).r));
  float u = texture2D(uSrc, i).r;
  // capsule brush: distance from this texel to the segment last → pos (pointer01 space, y up)
  vec2 h = e - uLast;
  vec2 p = uPos - uLast;
  float f = dot(p, p);
  float A = f < 1e-6 ? length(h) : length(h - p * clamp(dot(h, p) / f, 0.0, 1.0));
  float b = pow(clamp(1.0 - A / max(uRadius, 1e-6), 0.0, 1.0), 3.0) * step(1e-6, uRadius);
  c = clamp((c + b) * 0.985, 0.0, 1.0);
  gl_FragColor = vec4(c, c - u, 0.0, 1.0);
}
`;

const CLEAR_FRAG = /* glsl */ `
void main() { gl_FragColor = vec4(0.0); }
`;

const INTERACTIVE = "a, button, input, select, textarea, label, summary, [role='button'], [role='slider'], [tabindex]:not([tabindex='-1'])";

export class SplatSim {
  constructor(renderer, advectTexture) {
    this.renderer = renderer;
    // RG16F must be colour-renderable (EXT_color_buffer_float or _half_float); without it the
    // 8-bit fallback could not decay (0.985 × small values rounds back up) → no trail at all.
    this.supported =
      renderer.extensions.has("EXT_color_buffer_float") || renderer.extensions.has("EXT_color_buffer_half_float");
    this.enabled = this.supported;
    const opts = {
      type: THREE.HalfFloatType,
      format: THREE.RGFormat,
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      generateMipmaps: false,
    };
    this.read = new THREE.WebGLRenderTarget(1, 1, opts);
    this.write = new THREE.WebGLRenderTarget(1, 1, opts);

    this.material = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: SPLAT_FRAG,
      uniforms: {
        uSrc: { value: null },
        uAdvect: { value: advectTexture },
        uRes: { value: new THREE.Vector2(1, 1) },
        uPos: { value: new THREE.Vector2(0.5, 0.5) },
        uLast: { value: new THREE.Vector2(0.5, 0.5) },
        uRadius: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.clearMaterial = new THREE.ShaderMaterial({ vertexShader: FULLSCREEN_VERT, fragmentShader: CLEAR_FRAG });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.pos = new THREE.Vector2(0.5, 0.5);
    this.last = new THREE.Vector2(0.5, 0.5);
    this.vel = 0;
    this.targetVel = 0;
    this.lastMoveTime = 0;
    this.lastStep = -1;
    this.hovered = false;
    this.dirty = true; // RTs need clearing

    this.onOver = (e) => {
      this.hovered = !!(e.target instanceof Element && e.target.closest(INTERACTIVE));
    };
    document.addEventListener("pointerover", this.onOver, { passive: true });
  }

  get texture() {
    return this.read.texture;
  }

  // 256 × 256/aspect texels (× dpr) → square texels; cleared on every resize
  resize(width, height, dpr) {
    const aspect = width / Math.max(1, height);
    const w = Math.max(2, Math.floor(256 * dpr));
    const h = Math.max(2, Math.floor((256 / aspect) * dpr));
    this.read.setSize(w, h);
    this.write.setSize(w, h);
    this.material.uniforms.uRes.value.set(w, h);
    this.dirty = true;
  }

  clear() {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    this.quad.material = this.clearMaterial;
    for (const rt of [this.read, this.write]) {
      r.setRenderTarget(rt);
      r.render(this.scene, this.camera);
    }
    this.quad.material = this.material;
    r.setRenderTarget(prev);
    this.dirty = false;
  }

  // now in seconds; pointer01 = {x01, y01} with y up
  step(now, pointer) {
    if (!this.enabled) return;
    if (this.dirty) this.clear();
    if (this.lastStep >= 0 && now - this.lastStep < 0.015) return; // ≥ 15 ms between steps
    this.lastStep = now;

    this.pos.set(pointer.x01, pointer.y01);
    let dist = this.pos.distanceTo(this.last);
    if (dist > 0) this.lastMoveTime = now;
    // no streak after idling, while over interactive UI, or across a pointer jump
    if (now - this.lastMoveTime > 0.15 || this.hovered || dist > 0.3) {
      this.last.copy(this.pos);
      this.targetVel = 0;
      dist = 0;
    }
    this.targetVel = Math.min(1, Math.max(0, (this.targetVel + 6 * dist) * 0.88));
    const eased = 1 - Math.pow(1 - this.targetVel, 4);
    this.vel += (eased - this.vel) * 0.1;
    const x = Math.min(1, Math.max(0, (this.vel - 0.1) / 0.9));
    const radius = 0.05 * x * x * (3 - 2 * x);

    const u = this.material.uniforms;
    u.uSrc.value = this.read.texture;
    u.uPos.value.copy(this.pos);
    u.uLast.value.copy(this.last);
    u.uRadius.value = radius;

    const r = this.renderer;
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.write);
    r.render(this.scene, this.camera);
    r.setRenderTarget(prev);
    [this.read, this.write] = [this.write, this.read];
    this.last.copy(this.pos);
  }

  setEnabled(on) {
    const next = on && this.supported;
    if (next !== this.enabled) {
      this.enabled = next;
      this.dirty = true;
      if (!next) this.clear();
    }
  }

  dispose() {
    document.removeEventListener("pointerover", this.onOver);
    this.read.dispose();
    this.write.dispose();
    this.material.dispose();
    this.clearMaterial.dispose();
    this.quad.geometry.dispose();
  }
}
