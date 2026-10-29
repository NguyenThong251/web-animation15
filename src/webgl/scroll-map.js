// Scroll → scene mapping (SPEC_WEBGL §3). The DOM owns the scroll length: every
// [data-scene-scroll-segment] is measured as { start: top, end: max(top, top + height − vh) }
// ("its bottom reaches the bottom of the viewport"), and the table in config.js turns those edges
// into per-scene progress windows and transition windows, all in scroll pixels.
import { SCENE_IDS, SCENE_TABLE, TRANSITION_EPSILON, clamp01 } from "./config.js";

export class SceneScrollMap {
  constructor() {
    this.segments = {}; // id → { start, end }
    this.progressRanges = {}; // id → [from, to] px
    this.transitions = []; // [{ from, to, start, end, style }]
    this.sceneHeight = innerHeight;
    this.measured = false;
    this.result = {
      sceneProgress: Object.fromEntries(SCENE_IDS.map((id) => [id, 0])),
      scene1: SCENE_IDS[0],
      scene2: null,
      progress: 0,
      style: 0,
    };
  }

  // sceneHeight follows innerHeight, except on touch devices where a height-only change (URL bar
  // collapsing) keeps the previous value so the ranges do not jump mid-scroll (SPEC_WEBGL §1).
  updateSceneHeight(isTouch, lastWidth, width) {
    const h = innerHeight;
    if (isTouch && lastWidth === width && this.measured) return;
    this.sceneHeight = h;
  }

  measure() {
    const root = document.querySelector("[data-scene-scroll-root]");
    const vh = this.sceneHeight || innerHeight;
    const scrollY = window.scrollY;
    const segs = {};
    let cursor = 0;
    for (const id of SCENE_IDS) {
      const el = root?.querySelector(`[data-scene-scroll-segment="${id}"]`) ?? null;
      if (el) {
        const r = el.getBoundingClientRect();
        const start = scrollY + r.top;
        segs[id] = { start, end: Math.max(start, start + r.height - vh) };
        cursor = segs[id].end;
      } else {
        // a missing segment collapses onto the previous edge so the table stays monotonic
        segs[id] = { start: cursor, end: cursor };
      }
    }
    this.segments = segs;

    const edge = ([id, which, off]) => (which === "start" ? segs[id].start : segs[id].end) + off * vh;
    this.progressRanges = {};
    this.transitions = [];
    for (const row of SCENE_TABLE) {
      this.progressRanges[row.id] = [edge(row.progress[0]), edge(row.progress[1])];
      if (row.next && row.transition) {
        this.transitions.push({
          from: row.id,
          to: row.next,
          start: edge(row.transition[0]),
          end: edge(row.transition[1]),
          style: row.style,
        });
      }
    }
    this.measured = true;
  }

  // Resolve the scroll position into progress per scene + the one or two scenes to composite.
  resolve(scroll) {
    const out = this.result;
    for (const id of SCENE_IDS) {
      const [a, b] = this.progressRanges[id] ?? [0, 1];
      out.sceneProgress[id] = clamp01((scroll - a) / Math.max(1, b - a));
    }

    out.scene1 = SCENE_IDS[0];
    out.scene2 = null;
    out.progress = 0;
    out.style = 0;

    // inside a transition window: both scenes (or just one near the ends)
    for (const t of this.transitions) {
      if (scroll < t.start || scroll > t.end || t.end <= t.start) continue;
      const n = (scroll - t.start) / (t.end - t.start);
      if (n >= 1 - TRANSITION_EPSILON) out.scene1 = t.to;
      else if (n <= TRANSITION_EPSILON) out.scene1 = t.from;
      else {
        out.scene1 = t.from;
        out.scene2 = t.to;
        out.progress = n;
        out.style = t.style;
      }
      return out;
    }

    // outside every window: the last scene whose transition has completed
    for (const t of this.transitions) if (scroll > t.end) out.scene1 = t.to;
    return out;
  }
}
