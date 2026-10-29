// Shared app object: the single contract between the DOM modules and the WebGL engine.
// Every module imports { app } from "../core/app.js" (or "./core/app.js").
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(ScrollTrigger, SplitText);

const listeners = new Map();
const mm = (q) => window.matchMedia(q);

export const app = {
  gsap,
  ScrollTrigger,
  SplitText,
  lenis: null, // set by core/lenis.js (Lenis instance, root scroller)

  mq: {
    sm: mm("(max-width: 767px)"),
    md: mm("(min-width: 768px)"),
    lg: mm("(min-width: 1024px)"),
    rm: mm("(prefers-reduced-motion: reduce)"),
    fine: mm("(hover: hover) and (pointer: fine)"),
  },

  state: {
    fontsReady: false,
    webglProgress: 0, // 0..1 asset + compile progress
    compiled: false, // WebGL scenes compiled and warmed up
    webglFailed: false,
    revealing: false, // intro reveal running (scroll locked)
    revealed: false, // intro reveal finished
    scroll: 0,
    limit: 0,
    velocity: 0,
    direction: 0,
    progress: 0,
    activeNav: null, // id of the nav anchor currently in view
  },

  // pointer in px, and normalised: nx/ny in -1..1 with y UP (matches the original's pointer11)
  pointer: { x: 0, y: 0, nx: 0, ny: 0, x01: 0.5, y01: 0.5, moved: false },

  // Tiny event bus. Events:
  //  'fonts:ready'                      document.fonts resolved
  //  'webgl:progress'  (p 0..1)         asset loading / compile progress
  //  'webgl:compiled'                   scenes compiled → loader may exit
  //  'webgl:error'     (err)            WebGL unavailable → static fallback
  //  'reveal:start'                     loader exit started → WebGL plays its 4 s intro reveal
  //  'reveal:done'                      intro finished → Lenis starts, header shows
  //  'scroll'  ({scroll,limit,velocity,direction,progress})   every Lenis scroll
  //  'resize'  ({w,h})
  //  'nav:change' (id)
  on(evt, fn) {
    if (!listeners.has(evt)) listeners.set(evt, new Set());
    listeners.get(evt).add(fn);
    return () => listeners.get(evt)?.delete(fn);
  },
  once(evt, fn) {
    const off = app.on(evt, (p) => {
      off();
      fn(p);
    });
    return off;
  },
  emit(evt, payload) {
    listeners.get(evt)?.forEach((fn) => {
      try {
        fn(payload);
      } catch (e) {
        console.error(`[app] ${evt} listener failed`, e);
      }
    });
  },
};

// dev builds, or any build opened with ?debug (lets automated checks drive Lenis)
if (import.meta.env.DEV || new URLSearchParams(location.search).has("debug")) window.__app = app;
