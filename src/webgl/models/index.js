// Procedural models for the WebGL scenes (contract: docs/BRIEF.md → "WebGL models API").
// Y up, metres. Every mesh uses a white MeshStandardMaterial (roughness 1, metalness 0) and
// casts + receives shadows, except: ground and water (receive only); the water is its own
// mesh named "water" with a smoother material so the engine can restyle it.
// THREE is passed in so the caller and the models share one three.js instance.
//
// buildVanMieu(THREE, { quality: "high" | "low" }) → { group, anchors, dispose }
//   origin = centre of the Thiên Quang well at ground level; entrance at +Z.
//   anchors (THREE.Vector3): gate (+140), daiTrungMon (+80), khueVanCac (+22, base),
//   khueVanCacTop (tip of the ridge ornaments, y ≈ 9.25), pond (water surface, y −0.55),
//   daiThanhMon (−30), steleLeft (−20, 0, −2), steleRight (+20, 0, −2), bounds (THREE.Box3 of
//   the walled precinct ≈ x ±36.5, y −1.2…14.9 (Thái Học hall), z −150.5…+148.5), plus extras:
//   truBieuLeft/Right, daiBaiDuong, thaiHocMon, thaiHoc. The lawn reaches x ±320, z ±420.
//   Named children: ground, water, well, khue-van-cac (positioned at z +22), van-mieu-mon, gates,
//   walls, paths, stele-houses, steles-left / steles-right (InstancedMesh × 41), halls,
//   trees-near-0..2 / trees-far-0..2 (InstancedMesh). ≈191k triangles high, ≈126k low.
//
// buildSteleOnTurtle(THREE, { lines, title, quality }) → Promise<{ group, anchors, size, dispose }>
//   one stele (1.0 × 1.6 × 0.2 m slab, carved face toward +Z) on a stone turtle (head +Z),
//   standing on the ground at the origin. anchors: face (centre of the inscribed face),
//   top (crown apex), base (origin), head (turtle's head), crown (centre of the dragon relief).
//   size: { w: slab width, h: total height from the ground, slab: { w, h, t, base } }.
//   lines: Hán strings, one per column, read right → left (default: the 1442 title column
//   followed by phrases from src/data/han-chars.txt); title: the heading carved in the
//   band under the crown (default 大寶三年壬戌科進士題名記).
//
// buildBrush(THREE) / buildPen(THREE) → { group, tip, axis, length }
//   tip at the origin, axis = unit vector from the tip toward the handle (≈ +Y), ≈1 m long.
//   Meshes: brush → hair, ferrule, handle, loop; pen → nib (convex face with the slit and
//   breather hole toward +Z), ferrule, holder.
//
// khueVanCacElevationSVG() → SVG string (viewBox 0 0 1440 950), black lines on white.
export { buildVanMieu, LAYOUT as VAN_MIEU_LAYOUT } from "./van-mieu.js";
export { buildSteleOnTurtle, defaultSteleLines, DEFAULT_TITLE as STELE_DEFAULT_TITLE } from "./stele.js";
export { buildBrush, buildPen } from "./tools.js";
export { khueVanCacElevationSVG } from "./elevation-svg.js";
