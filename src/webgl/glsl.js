// Shared GLSL chunks (GLSL ES 3.00 via three's ShaderMaterial prefix: `texture2D`/`varying` are mapped).
// Conventions: "TL" = top-left origin, y down (the reference's WebGPU uv()/viewportCoordinate);
// gl_FragCoord / vUv are bottom-left in WebGL, so callers flip y where the comments say so.

// full-screen triangle / quad vertex shader: passes the bottom-left uv through
export const FULLSCREEN_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const MATH = /* glsl */ `
#ifndef KV_MATH
#define KV_MATH
#define KV_PI 3.141592653589793
vec2 kvRotate(vec2 p, float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c) * p;
}
float kvRemapClamp(float x, float a, float b, float c, float d) {
  return mix(c, d, clamp((x - a) / (b - a), 0.0, 1.0));
}
// cover-fit an image of size \`image\` into \`res\` (both px), st in 0..1 → image uv
vec2 kvCoverUv(vec2 st, vec2 res, vec2 image) {
  float rs = res.x / res.y;
  float ri = image.x / image.y;
  vec2 size;
  vec2 offset;
  if (rs > ri) {
    size = vec2(res.x, image.y * res.x / image.x);
    offset = vec2(0.0, (res.y - size.y) * 0.5) / res;
  } else {
    size = vec2(image.x * res.y / image.y, res.y);
    offset = vec2((res.x - size.x) * 0.5, 0.0) / res;
  }
  return (st * res - offset * res) / size;
}
#endif
`;

// Screen-space rotated dot grid (SPEC_WEBGL §8.2). Returns 0 inside a dot ("ink"), 1 outside.
// \`count\` cells per screen HEIGHT, radius = strength * maxR * 0.5 cell units (≥0.707 fills the cell).
export const HALFTONE = /* glsl */ `
#ifndef KV_HALFTONE
#define KV_HALFTONE
float kvDotScreen(vec2 frag, vec2 res, float count, float rotA, float strength, float maxR) {
  vec2 p = frag / res.yy * count;
  p = fract(kvRotate(p - 0.5, rotA) + 0.5);
  float l = length(p - 0.5);
  float s = strength * maxR * 0.5;
  float aa = max(fwidth(l), 1.0 / max(res.y, 1.0));
  return smoothstep(s - aa, s + aa, l);
}
// luminance (Rec.709) + brightness → dot size: dark merges into solid ink (0), white leaves no dots (1)
float kvHalftone(vec3 src, vec2 frag, vec2 res, float count, float rotA, float maxR, float bright, float contrast) {
  float lum = clamp(dot(src, vec3(0.2126, 0.7152, 0.0722)) + bright, 0.0, 1.0);
  return kvDotScreen(frag, res, count, rotA, clamp(pow(1.0 - lum, contrast), 0.0, 1.0), maxR);
}
#endif
`;

// Classic 3D Perlin noise (Stefan Gustavson, MIT), range ≈ [-1, 1] like MaterialX mx_noise_float.
export const PERLIN3 = /* glsl */ `
#ifndef KV_PERLIN3
#define KV_PERLIN3
vec4 kvPermute(vec4 x) { return mod(((x * 34.0) + 10.0) * x, 289.0); }
vec4 kvTaylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
vec3 kvFade(vec3 t) { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }
float kvPerlin(vec3 P) {
  vec3 Pi0 = floor(P);
  vec3 Pi1 = Pi0 + vec3(1.0);
  Pi0 = mod(Pi0, 289.0);
  Pi1 = mod(Pi1, 289.0);
  vec3 Pf0 = fract(P);
  vec3 Pf1 = Pf0 - vec3(1.0);
  vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
  vec4 iy = vec4(Pi0.yy, Pi1.yy);
  vec4 iz0 = Pi0.zzzz;
  vec4 iz1 = Pi1.zzzz;
  vec4 ixy = kvPermute(kvPermute(ix) + iy);
  vec4 ixy0 = kvPermute(ixy + iz0);
  vec4 ixy1 = kvPermute(ixy + iz1);
  vec4 gx0 = ixy0 * (1.0 / 7.0);
  vec4 gy0 = fract(floor(gx0) * (1.0 / 7.0)) - 0.5;
  gx0 = fract(gx0);
  vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
  vec4 sz0 = step(gz0, vec4(0.0));
  gx0 -= sz0 * (step(0.0, gx0) - 0.5);
  gy0 -= sz0 * (step(0.0, gy0) - 0.5);
  vec4 gx1 = ixy1 * (1.0 / 7.0);
  vec4 gy1 = fract(floor(gx1) * (1.0 / 7.0)) - 0.5;
  gx1 = fract(gx1);
  vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);
  vec4 sz1 = step(gz1, vec4(0.0));
  gx1 -= sz1 * (step(0.0, gx1) - 0.5);
  gy1 -= sz1 * (step(0.0, gy1) - 0.5);
  vec3 g000 = vec3(gx0.x, gy0.x, gz0.x);
  vec3 g100 = vec3(gx0.y, gy0.y, gz0.y);
  vec3 g010 = vec3(gx0.z, gy0.z, gz0.z);
  vec3 g110 = vec3(gx0.w, gy0.w, gz0.w);
  vec3 g001 = vec3(gx1.x, gy1.x, gz1.x);
  vec3 g101 = vec3(gx1.y, gy1.y, gz1.y);
  vec3 g011 = vec3(gx1.z, gy1.z, gz1.z);
  vec3 g111 = vec3(gx1.w, gy1.w, gz1.w);
  vec4 norm0 = kvTaylorInvSqrt(vec4(dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110)));
  g000 *= norm0.x; g010 *= norm0.y; g100 *= norm0.z; g110 *= norm0.w;
  vec4 norm1 = kvTaylorInvSqrt(vec4(dot(g001, g001), dot(g011, g011), dot(g101, g101), dot(g111, g111)));
  g001 *= norm1.x; g011 *= norm1.y; g101 *= norm1.z; g111 *= norm1.w;
  float n000 = dot(g000, Pf0);
  float n100 = dot(g100, vec3(Pf1.x, Pf0.yz));
  float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z));
  float n110 = dot(g110, vec3(Pf1.xy, Pf0.z));
  float n001 = dot(g001, vec3(Pf0.xy, Pf1.z));
  float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
  float n011 = dot(g011, vec3(Pf0.x, Pf1.yz));
  float n111 = dot(g111, Pf1);
  vec3 fade_xyz = kvFade(Pf0);
  vec4 n_z = mix(vec4(n000, n100, n010, n110), vec4(n001, n101, n011, n111), fade_xyz.z);
  vec2 n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y);
  float n_xyz = mix(n_yz.x, n_yz.y, fade_xyz.x);
  return 2.2 * n_xyz;
}
#endif
`;

// Rounded 4-point star SDF and helpers (SPEC_WEBGL §8.5, ported 1:1 from the shipped TSL).
export const STAR = /* glsl */ `
#ifndef KV_STAR
#define KV_STAR
float kvRoundMerge(float a, float b, float r) {
  return -length(min(vec2(a - r, b - r), vec2(0.0))) + max(min(a, b), r);
}
float kvSdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, vec2(0.0))) + min(max(d.x, d.y), 0.0);
}
// Inigo Quilez, exact triangle SDF
float kvSdTriangle(vec2 p, vec2 p0, vec2 p1, vec2 p2) {
  vec2 e0 = p1 - p0, e1 = p2 - p1, e2 = p0 - p2;
  vec2 v0 = p - p0, v1 = p - p1, v2 = p - p2;
  vec2 pq0 = v0 - e0 * clamp(dot(v0, e0) / dot(e0, e0), 0.0, 1.0);
  vec2 pq1 = v1 - e1 * clamp(dot(v1, e1) / dot(e1, e1), 0.0, 1.0);
  vec2 pq2 = v2 - e2 * clamp(dot(v2, e2) / dot(e2, e2), 0.0, 1.0);
  float s = sign(e0.x * e2.y - e0.y * e2.x);
  vec2 d = min(min(vec2(dot(pq0, pq0), s * (v0.x * e0.y - v0.y * e0.x)),
                   vec2(dot(pq1, pq1), s * (v1.x * e1.y - v1.y * e1.x))),
                   vec2(dot(pq2, pq2), s * (v2.x * e2.y - v2.y * e2.x)));
  return -sqrt(d.x) * sign(d.y);
}
float kvSdStar4Rounded(vec2 p, float outerR, float innerR, float borderR) {
  float R = max(outerR, 0.01);
  float ir = clamp(innerR, 0.001, R - 0.001);
  float br = clamp(borderR, 0.0, min(ir * 0.65, (R - ir) * 0.65));
  float tip = max(R - br, ir + 0.001);
  float u = ir * 0.70710678118;
  float d = kvSdBox(p, vec2(u));
  d = kvRoundMerge(d, kvSdTriangle(p, vec2(0.0, tip), vec2(u, u), vec2(-u, u)) - br, br);
  d = kvRoundMerge(d, kvSdTriangle(p, vec2(tip, 0.0), vec2(u, -u), vec2(u, u)) - br, br);
  d = kvRoundMerge(d, kvSdTriangle(p, vec2(0.0, -tip), vec2(-u, -u), vec2(u, -u)) - br, br);
  d = kvRoundMerge(d, kvSdTriangle(p, vec2(-tip, 0.0), vec2(-u, u), vec2(-u, -u)) - br, br);
  return d;
}
#endif
`;

// 3D simplex noise (Ashima Arts / Ian McEwan, MIT) for the particle drift, range ≈ [-1, 1].
export const SIMPLEX3 = /* glsl */ `
#ifndef KV_SIMPLEX3
#define KV_SIMPLEX3
vec3 kvMod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 kvMod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 kvPermuteS(vec4 x) { return kvMod289(((x * 34.0) + 10.0) * x); }
vec4 kvTaylorInvSqrtS(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float kvSimplex(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = kvMod289(i);
  vec4 p = kvPermuteS(kvPermuteS(kvPermuteS(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = kvTaylorInvSqrtS(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
#endif
`;
