// Incense smoke / dust motes drifting in the stele's light (SPEC_WEBGL §5.2 FloatingParticles):
// instanced camera-facing quads, positions animated entirely on the GPU with 3-octave noise drift,
// a triangular life cycle and a soft radial sprite, additively blended.
import * as THREE from "three";
import { SIMPLEX3 } from "./glsl.js";
import { mulberry32 } from "./textures.js";

const VERT = /* glsl */ `
uniform float uTime;
uniform float uSpeed;
uniform float uNoiseScale;
uniform float uNoiseIntensity;
uniform float uYDrift;
uniform float uLifeSpeed;
uniform float uSizeMultiplier;
uniform float uSpaceScale;
uniform vec3 uOrigin;
attribute vec3 aBase;
attribute float aSize;
attribute float aSpeed;
attribute float aLife;
varying vec2 vUv;
varying float vAlpha;
${SIMPLEX3}
// 3 octaves remapped to 0..1
float n3(vec3 p) {
  float v = kvSimplex(p) * 0.57 + kvSimplex(p * 2.03) * 0.29 + kvSimplex(p * 4.01) * 0.14;
  return v * 0.5 + 0.5;
}
void main() {
  vUv = uv;
  float o = uTime * uSpeed * aSpeed + aLife * 19.13;
  float life = fract(aLife + uTime * uLifeSpeed * aSpeed);
  float tri = 1.0 - abs(life * 2.0 - 1.0);
  vec3 m = aBase * uSpaceScale * uNoiseScale + vec3(o, o * 0.63, o * 0.39);
  vec3 off = (vec3(n3(m), n3(m + vec3(11.7, 3.1, 7.9)), n3(m + vec3(4.3, 13.2, 5.4))) - 0.5) * uNoiseIntensity;
  vec3 pos = aBase * uSpaceScale + off + vec3(0.0, sin(o * 1.6) * uYDrift, 0.0) + uOrigin * uSpaceScale;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  mv.xy += position.xy * aSize * uSizeMultiplier * tri; // billboard in view space
  gl_Position = projectionMatrix * mv;
  vAlpha = tri * (sin(o * 1.9) * 0.2 + 0.8);
}
`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uGradientPower;
uniform float uGradientTightness;
varying vec2 vUv;
varying float vAlpha;
void main() {
  vec2 d = vUv - 0.5;
  float r2 = dot(d, d);
  float soft = pow(max(1.0 - r2 * 4.0 * uGradientTightness, 0.0), uGradientPower);
  float a = uOpacity * vAlpha * soft;
  if (a <= 0.001) discard;
  gl_FragColor = vec4(uColor, a);
}
`;

export function createFloatingParticles({
  count = 700,
  bounds = [4, 3, 4],
  sizeRange = [0.01, 0.02],
  origin = [0.5, 1.8, 0.4],
  speed = 0.1,
  noiseScale = 0.44,
  noiseIntensity = 0.77,
  yDrift = 0.5,
  lifeSpeed = 0.15,
  sizeMultiplier = 2,
  spaceScale = 1,
  color = "#ffffff",
  opacity = 1,
  gradientPower = 2,
  gradientTightness = 1,
  seed = 1484,
} = {}) {
  const rand = mulberry32(seed);
  const quad = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index;
  geo.setAttribute("position", quad.getAttribute("position"));
  geo.setAttribute("uv", quad.getAttribute("uv"));
  const base = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const spd = new Float32Array(count);
  const life = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    base[i * 3] = (rand() - 0.5) * bounds[0];
    base[i * 3 + 1] = (rand() - 0.5) * bounds[1];
    base[i * 3 + 2] = (rand() - 0.5) * bounds[2];
    size[i] = sizeRange[0] + rand() * (sizeRange[1] - sizeRange[0]);
    spd[i] = 0.65 + 0.9 * rand();
    life[i] = rand();
  }
  geo.setAttribute("aBase", new THREE.InstancedBufferAttribute(base, 3));
  geo.setAttribute("aSize", new THREE.InstancedBufferAttribute(size, 1));
  geo.setAttribute("aSpeed", new THREE.InstancedBufferAttribute(spd, 1));
  geo.setAttribute("aLife", new THREE.InstancedBufferAttribute(life, 1));
  geo.instanceCount = count;

  const material = new THREE.ShaderMaterial({
    name: "kv-particles",
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uTime: { value: 0 },
      uSpeed: { value: speed },
      uNoiseScale: { value: noiseScale },
      uNoiseIntensity: { value: noiseIntensity },
      uYDrift: { value: yDrift },
      uLifeSpeed: { value: lifeSpeed },
      uSizeMultiplier: { value: sizeMultiplier },
      uSpaceScale: { value: spaceScale },
      uOrigin: { value: new THREE.Vector3(...origin) },
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uGradientPower: { value: gradientPower },
      uGradientTightness: { value: gradientTightness },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.name = "floating-particles";
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}
