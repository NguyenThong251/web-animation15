// Dev-only model viewer: /src/webgl/models/_preview.html?m=vanmieu|kvc|stele|brush|pen|tools|svg
//   &q=high|low  &view=<preset>  &ht=1 (duotone halftone like the site compositor)  &ui=0
//   &cam=x,y,z&target=x,y,z&light=x,y,z  (override the preset)
// White MeshStandardMaterial, one shadow-casting point light, no ambient light.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { buildVanMieu, buildSteleOnTurtle, buildBrush, buildPen, khueVanCacElevationSVG } from "./index.js";
import { buildKhueVanCacGeometry } from "./khue-van-cac.js";
import { whiteMaterial } from "./util.js";

const qs = new URLSearchParams(location.search);
const model = qs.get("m") || "kvc";
const quality = qs.get("q") || "high";
const ui = document.getElementById("ui");
if (qs.get("ui") === "0") ui.classList.add("off");
const vec = (s) => (s ? new THREE.Vector3(...s.split(",").map(Number)) : null);

// camera / light presets: [camera, target, light]
const VIEWS = {
  vanmieu: {
    drone: [[70, 80, 215], [0, 0, 40], [30, 70, 120]],
    gate: [[24, 9, 172], [0, 5, 140], [30, 30, 175]],
    approach: [[0, 14, 118], [0, 5, 22], [-25, 35, 60]],
    kvc: [[16, 6, 44], [0, 5, 22], [24, 26, 50]],
    well: [[34, 22, 34], [0, 0, -2], [10, 30, 30]],
    steles: [[-8, 5, 12], [-20, 1, -4], [0, 16, 12]],
    top: [[0, 340, 0.1], [0, 0, 0], [20, 90, 60]],
    back: [[50, 60, -190], [0, 0, -80], [40, 60, -150]],
  },
  kvc: {
    front: [[0, 4.6, 24], [0, 4.6, 0], [7, 14, 14]],
    corner: [[14, 6.5, 15], [0, 4.8, 0], [14, 15, 4]],
    low: [[9, 1.4, 11], [0, 5.6, 0], [10, 14, 10]],
    side: [[24, 4.6, 0], [0, 4.6, 0], [10, 14, 8]],
    roof: [[9, 13, 9], [0, 7, 0], [6, 18, 10]],
  },
  stele: {
    front: [[0, 1.45, 3.9], [0, 1.4, 0], [1.6, 3.2, 2.4]],
    "3q": [[2.4, 1.7, 3.1], [0, 1.2, 0], [2.2, 3.4, 1.4]],
    side: [[3.6, 1.3, 0.2], [0, 1.15, 0], [1.5, 3.2, 2.2]],
    crown: [[0, 2.02, 1.15], [0, 2.02, 0], [-0.9, 3.0, 1.2]],
    text: [[0.15, 1.3, 1.0], [0.15, 1.3, 0], [1.0, 2.2, 0.9]],
    turtle: [[1.3, 0.75, 2.1], [0, 0.35, 0.6], [1.6, 2.4, 2.0]],
    shell: [[-1.6, 1.4, -1.2], [0, 0.45, 0], [-1.2, 2.6, -0.4]],
  },
  tools: {
    side: [[0, 0, 2.7], [0, 0, 0], [0.5, 1.5, 1.8]],
    tips: [[0.05, 0.08, 0.55], [0, 0, 0], [0.4, 0.9, 1.0]],
  },
  brush: {
    side: [[1.25, 0.5, 0.6], [0, 0.5, 0], [1.2, 1.4, 1.2]],
    tip: [[0.28, 0.1, 0.2], [0, 0.11, 0], [0.5, 0.6, 0.7]],
    top: [[0.4, 1.15, 0.3], [0, 0.98, 0], [0.6, 1.6, 0.6]],
  },
  pen: {
    side: [[1.25, 0.5, 0.6], [0, 0.5, 0], [1.2, 1.4, 1.2]],
    nib: [[0.16, 0.06, 0.24], [0, 0.08, 0.01], [0.3, 0.5, 0.6]],
    under: [[0.1, 0.05, -0.22], [0, 0.08, 0.01], [0.3, 0.4, -0.5]],
  },
};
VIEWS.kvcAlone = VIEWS.kvc;

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x30343c);
const camera = new THREE.PerspectiveCamera(innerWidth < 768 ? 60 : 40, innerWidth / innerHeight, 0.05, 2000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const light = new THREE.PointLight(0xffffff, 1, 0, 1.5);
light.castShadow = true;
light.shadow.mapSize.set(2048, 2048);
light.shadow.bias = -5e-4;
light.shadow.normalBias = 0.02;
scene.add(light);

// ---------- halftone duotone pass (approximation of the site compositor) ----------
const halftone = qs.get("ht") === "1";
let rt, htScene, htCam, htMat;
if (halftone) {
  rt = new THREE.WebGLRenderTarget(1, 1, { samples: 4 });
  htCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  htMat = new THREE.ShaderMaterial({
    uniforms: { tScene: { value: rt.texture }, res: { value: new THREE.Vector2() } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }",
    fragmentShader: /* glsl */ `
      uniform sampler2D tScene; uniform vec2 res; varying vec2 vUv;
      vec2 rot2(vec2 p, float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c)*p; }
      float dotScreen(vec2 frag, float count, float rotA, float strength, float maxR){
        vec2 p = frag / res.yy * count;
        p = fract(rot2(p - 0.5, rotA) + 0.5);
        float l = length(p - 0.5);
        float s = strength * maxR * 0.5;
        float aa = max(fwidth(l), 1.0 / max(res.y, 1.0));
        return smoothstep(s - aa, s + aa, l);
      }
      void main(){
        vec4 src = texture2D(tScene, vUv);
        vec3 c = pow(max(src.rgb, 0.0), vec3(1.0/2.2));
        float lum = clamp(dot(c, vec3(.2126,.7152,.0722)) + 0.2, 0., 1.);
        float paper = dotScreen(gl_FragCoord.xy, 160., 0.25, 1. - lum, 1.45);
        vec3 pink = vec3(1.0, 0.612, 0.937), blue = vec3(0.357, 0.455, 0.922);
        vec3 model = mix(blue, pink, paper);
        vec3 bg = mix(pink, blue, dotScreen(gl_FragCoord.xy, 160., 0.25, 0.35, 1.45));
        gl_FragColor = vec4(mix(bg, model, src.a), 1.);
      }`,
  });
  htScene = new THREE.Scene();
  htScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), htMat));
  scene.background = null;
  renderer.setClearColor(0x000000, 0);
}

function frame(view) {
  const set = VIEWS[model === "kvc" ? "kvc" : model]?.[view] || Object.values(VIEWS[model] || VIEWS.kvc)[0];
  const cam = vec(qs.get("cam")) || new THREE.Vector3(...set[0]);
  const target = vec(qs.get("target")) || new THREE.Vector3(...set[1]);
  const lp = vec(qs.get("light")) || new THREE.Vector3(...set[2]);
  camera.position.copy(cam);
  controls.target.copy(target);
  light.position.copy(lp);
  // intensity so the irradiance at the target is ~2.6 whatever the distance (decay 1.5)
  const d = lp.distanceTo(target);
  light.intensity = 2.6 * Math.pow(d, 1.5);
  light.shadow.camera.near = Math.max(0.01, d * 0.01);
  light.shadow.camera.far = d * 8;
  light.shadow.camera.updateProjectionMatrix();
  controls.update();
}

async function build() {
  const t0 = performance.now();
  let root;
  if (model === "vanmieu") {
    root = buildVanMieu(THREE, { quality }).group;
  } else if (model === "kvc") {
    root = new THREE.Group();
    const m = new THREE.Mesh(buildKhueVanCacGeometry(THREE, { quality }), whiteMaterial(THREE));
    root.add(m);
    const g = new THREE.Mesh(new THREE.PlaneGeometry(80, 80).rotateX(-Math.PI / 2), whiteMaterial(THREE));
    g.receiveShadow = true;
    root.add(g);
    m.castShadow = m.receiveShadow = true;
  } else if (model === "stele") {
    const s = await buildSteleOnTurtle(THREE, { quality });
    root = s.group;
    const g = new THREE.Mesh(new THREE.PlaneGeometry(30, 30).rotateX(-Math.PI / 2), whiteMaterial(THREE));
    g.receiveShadow = true;
    root.add(g);
    window.__stele = s;
  } else if (model === "brush" || model === "pen" || model === "tools") {
    root = new THREE.Group();
    const b = buildBrush(THREE), p = buildPen(THREE);
    if (model !== "pen") root.add(b.group);
    if (model !== "brush") root.add(p.group);
    if (model === "tools") {
      // tips almost touching, handles apart (as in the hands chapter)
      b.group.quaternion.setFromUnitVectors(b.axis, new THREE.Vector3(-1, 0.18, 0).normalize());
      p.group.quaternion.setFromUnitVectors(p.axis, new THREE.Vector3(1, 0.1, 0).normalize());
      b.group.position.set(-0.03, 0, 0);
      p.group.position.set(0.03, 0, 0);
    }
    root.traverse((o) => o.isMesh && (o.castShadow = o.receiveShadow = true));
    window.__tools = { brush: b, pen: p };
  } else if (model === "svg") {
    const host = document.getElementById("svg");
    host.innerHTML = khueVanCacElevationSVG();
    host.style.display = "block";
    renderer.domElement.style.display = "none";
    ui.textContent = `svg ${host.innerHTML.length} chars`;
    window.__preview = { ready: true, model };
    return;
  }
  scene.add(root);
  const buildMs = performance.now() - t0;
  frame(qs.get("view"));
  render();
  let tris = 0;
  root.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    const n = (g.index ? g.index.count : g.attributes.position.count) / 3;
    tris += n * (o.isInstancedMesh ? o.count : 1);
  });
  const info = { model, quality, triangles: Math.round(tris), drawCalls: renderer.info.render.calls, buildMs: Math.round(buildMs) };
  ui.textContent = Object.entries(info)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  window.__preview = { ready: true, ...info, setView: (v) => (frame(v), render()) };
}

function render() {
  if (halftone) {
    rt.setSize(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio());
    htMat.uniforms.res.value.set(rt.width, rt.height);
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(htScene, htCam);
  } else {
    renderer.render(scene, camera);
  }
}

addEventListener("resize", () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => {
  controls.update();
  render();
});

build().catch((e) => {
  ui.textContent = "lỗi: " + e.message;
  console.error(e);
  window.__preview = { ready: true, error: String(e) };
});
