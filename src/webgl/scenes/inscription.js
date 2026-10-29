// Scene 6 · text (style 5): the closing inscription wall. A slowly rotating blue → pink linear
// gradient, the line drawing of Khuê Văn Các at +5 %, and five outline-only lines from the 1442
// stele text sliding in alternating directions with the scene progress (SPEC_WEBGL §5.6).
import * as THREE from "three";
import { BaseScene } from "./base.js";
import { createText } from "../text.js";
import { MATH } from "../glsl.js";
import { STYLE, FONTS, PALETTE } from "../config.js";
import { rasterizeSVG } from "../textures.js";

const GRAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const GRAD_FRAG = /* glsl */ `
uniform float uAngle;
uniform vec2 uRes;
uniform vec3 uFrom;
uniform vec3 uTo;
uniform sampler2D uOverlay;
uniform vec2 uOverlaySize;
varying vec2 vUv;
${MATH}
void main() {
  float n = sin(uAngle);
  float a = cos(uAngle);
  vec2 dir = vec2(n, a);
  float asp = uRes.x / max(uRes.y, 1.0);
  vec2 p = vec2(vUv.x * asp, vUv.y);
  vec2 c0 = vec2(asp * 0.5, 0.5);
  float halfLen = asp * abs(n) * 0.5 + abs(a) * 0.5;
  float g = clamp(((dot(p - c0, dir) + halfLen) / (halfLen * 2.0) - 0.1201) / 0.5916, 0.0, 1.0);
  vec3 grad = mix(uFrom, uTo, g);
  // the drawing is upright in vUv space (CanvasTexture flipY) → cover-fit with a TL st, sample bottom-left
  vec2 st = kvCoverUv(vec2(vUv.x, 1.0 - vUv.y), uRes, uOverlaySize);
  float line = 1.0 - texture2D(uOverlay, vec2(st.x, 1.0 - st.y)).r;
  gl_FragColor = vec4(grad + line * 0.05, 1.0);
}
`;

// 1440 × 850 design frame (cover-scaled); x(l) per line with l = text progress.
// Lines 0 and 3 sit in the reference's italic slots; the Hán line uses the regular Hán face there.
// Start offsets are measured from each line's laid-out width so the visible part reads well at 240 px.
const LINES = [
  { text: "HIỀN TÀI LÀ NGUYÊN KHÍ", font: FONTS.italic, y: 350, x: () => -720, speed: -800 },
  { text: "CỦA QUỐC GIA — VĂN MIẾU", font: FONTS.regular, y: 142, x: (w) => -60 - w, speed: -200 },
  { text: "QUỐC TỬ GIÁM", font: FONTS.regular, y: 142, x: () => 40, speed: 200 }, // the row reads "… VĂN MIẾU  QUỐC TỬ GIÁM", the halves sliding apart
  { text: "賢材國家之元氣", font: FONTS.han, y: -66, x: (w) => -w / 2 - 250, speed: 500, han: true },
  { text: "NGUYÊN KHÍ THỊNH THÌ THẾ NƯỚC MẠNH", font: FONTS.regular, y: -274, x: () => -720, speed: -800 },
];
const FONT_SIZE = 240;
// caps of a line are centred 142 design px under its y (the reference's MSDF layout); the Hán
// ideograph box is centred ≈ 0.38 em over the baseline instead of the Latin cap centre (0.325 em)
const capCentre = (y) => y - 142;

export class InscriptionScene extends BaseScene {
  constructor(engine, models) {
    super(engine, { id: "text", style: STYLE.text, needsTextPass: true });
    this.models = models;
    this.angle0 = (219 * Math.PI) / 180;
    this.uniforms = {
      uAngle: { value: this.angle0 },
      uRes: { value: new THREE.Vector2(1, 1) },
      uFrom: { value: new THREE.Color(PALETTE.secondary) },
      uTo: { value: new THREE.Color(PALETTE.primary) },
      uOverlay: { value: null },
      uOverlaySize: { value: new THREE.Vector2(1440, 950) },
    };
    this.typography = new THREE.Group();
    this.typography.name = "background-typography";
    this.typography.position.z = -0.5; // inside the ortho camera's 0..1 depth range
    this.scene.add(this.typography);
    this.lines = [];
    this.spin = 0;
  }

  async load() {
    const svg = this.models.khueVanCacElevationSVG();
    this.uniforms.uOverlay.value = await rasterizeSVG(svg, 1440, 950);
    const quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        name: "kv-closing-gradient",
        vertexShader: GRAD_VERT,
        fragmentShader: GRAD_FRAG,
        uniforms: this.uniforms,
        depthTest: false,
        depthWrite: false,
      }),
    );
    quad.frustumCulled = false;
    this.scene.add(quad);

    // outline-only lines: ≈ 1.1 design px (the reference's 0.035 MSDF units at 240 px), softness 0.5
    this.lines = LINES.map((def) => {
      const mesh = createText({ text: def.text, font: def.font, color: "#ffffff", outline: 1.1 / FONT_SIZE });
      mesh.scale.setScalar(FONT_SIZE);
      this.typography.add(mesh);
      return { def, mesh, x0: 0 };
    });
    await Promise.all(this.lines.map((l) => l.mesh.syncAsync()));
    for (const l of this.lines) {
      l.mesh.setupReveal({ enabled: false, softness: 0.5 });
      const b = l.mesh.textRenderInfo.blockBounds;
      const w = (b[2] - b[0]) * FONT_SIZE;
      l.x0 = l.def.x(w);
      const centreEm = l.def.han ? 0.38 : 0.325;
      l.mesh.position.y = capCentre(l.def.y) - centreEm * FONT_SIZE;
    }
    this.update({ dt: 0, time: 0, progress: 0, reducedMotion: false });
  }

  onResize() {
    const { width: W, height: H } = this.viewport;
    this.uniforms.uRes.value.set(this.rt.width, this.rt.height);
    // design px → ortho units (SPEC_WEBGL §5.6): cover-scale a 1440 × 850 frame
    const sy = (2 * Math.max(W / 1440, H / 850)) / Math.max(1, H);
    const sx = (H / Math.max(1, W)) * sy;
    this.typography.scale.set(sx, sy, 1);
  }

  update({ dt, progress, reducedMotion }) {
    // gradient angle turns at 0.2 rad/s from 219° (held still under reduced motion)
    if (!reducedMotion) this.spin += dt * 0.2;
    this.uniforms.uAngle.value = this.angle0 + this.spin;
    const l = progress;
    for (const line of this.lines) line.mesh.position.x = line.x0 + line.def.speed * l;
  }
}

