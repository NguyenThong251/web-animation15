// Engine constants. Numbers follow SPEC_WEBGL (§1, §3.2, §8.1, §10.5) so the motion language
// matches the reference; the content (Văn Miếu, stele, brush & nib, inscriptions) is ours.

export const SCENE_IDS = ["hero", "stele", "depth", "paper", "hands", "text"];

// compositor style per scene (SPEC_WEBGL §2 "Scene style ids")
export const STYLE = { hero: 0, stele: 1, depth: 2, paper: 3, hands: 4, text: 5 };

// transition shader per hand-off (0 horizontal push, 1 vertical push, 2 rounded 4-point-star iris)
export const TRANSITION_STYLE = { horizontal: 0, vertical: 1, star: 2 };

export const PALETTE = {
  primary: "#ff9cef", // hồng sen
  secondary: "#5b74eb", // xanh chàm
  transition: "#ff9cef",
  paper: "#edede9",
};

export const DPR_RANGE = [1, 1.3];
export const MOBILE_MAX_WIDTH = 767; // < 768 → mobile fovs / lighter particles

// duotone halftone of the 3D scenes: dots per viewport height / rotation (rad) / max radius / brightness / contrast
export const HALFTONE = { count: 160, rotation: 0.25, maxRadius: 1.45, brightness: 0.2, contrast: 1 };

// Scroll → scene table (SPEC_WEBGL §3.2). Every edge is [segmentId, "start"|"end", offset in viewport heights].
// `progress` = the window that drives that scene's 0..1 progress; `transition` = the window in which the
// compositor blends it into `next` with `style`.
export const SCENE_TABLE = [
  {
    id: "hero",
    progress: [["hero", "start", 0], ["hero", "end", 1]],
    next: "stele",
    transition: [["hero", "end", 0], ["stele", "start", 0]],
    style: TRANSITION_STYLE.horizontal,
  },
  {
    id: "stele",
    progress: [["stele", "start", -1], ["stele", "end", 1]],
    next: "depth",
    transition: [["stele", "end", 0], ["depth", "start", 0]],
    style: TRANSITION_STYLE.vertical,
  },
  {
    id: "depth",
    progress: [["depth", "start", 0], ["depth", "end", 0]],
    next: "paper",
    transition: [["depth", "end", 0], ["paper", "start", 0]],
    style: TRANSITION_STYLE.vertical,
  },
  {
    id: "paper",
    progress: [["paper", "start", 0], ["paper", "end", 0]],
    next: "hands",
    transition: [["paper", "end", -0.2], ["hands", "start", 0]],
    style: TRANSITION_STYLE.vertical,
  },
  {
    id: "hands",
    progress: [["hands", "start", 0], ["hands", "end", 0]],
    next: "text",
    transition: [["hands", "end", -3], ["text", "start", -1]],
    style: TRANSITION_STYLE.star,
  },
  {
    id: "text",
    progress: [["text", "start", -4], ["text", "end", -1]],
    next: null,
    transition: null,
    style: TRANSITION_STYLE.vertical,
  },
];

// below this local transition progress only the outgoing scene renders, above 1 − this only the incoming one
export const TRANSITION_EPSILON = 0.005;

// troika SDF resolution: the titles are drawn up to ~640 device px per em, 128 keeps serifs crisp
export const SDF_GLYPH_SIZE = 128;

// fonts used for WebGL text (static TTFs, resolved against document.baseURI → works under any subpath)
export const FONTS = {
  regular: "fonts/EBGaramond-Regular.ttf",
  italic: "fonts/EBGaramond-Italic.ttf",
  han: "fonts/NotoSerifTC-Han-400.ttf",
};

export const IMAGES = {
  depthPhoto: "images/khue-van-cac.webp",
};

// heading carved under the stele's crown: the 1442 stele's title 大寶三年壬戌科進士題名記 (facts B8);
// the columns use the builder's defaults (characters from src/data/han-chars.txt only)
export const STELE_TEXT = {
  title: "大寶三年壬戌科進士題名記",
};

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
// unclamped linear remap (the reference's remapRange: overshoot is intentional)
export const remap = (v, a, b, c, d) => c + ((v - a) / (b - a)) * (d - c);
