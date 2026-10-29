// Root smooth scroller. Lenis owns the window scroll; it stays stopped while the loader and the
// intro reveal run, and every scroll it produces is mirrored into app.state + the 'scroll' event
// (the single source of truth for scroll-driven WebGL and DOM modules).
import Lenis from "lenis";

let started = false;

export function init(app) {
  if (app.lenis) return;

  history.scrollRestoration = "manual";
  window.scrollTo(0, 0);

  const lenis = new Lenis({ anchors: true, lerp: 0.1, syncTouch: false, autoRaf: true });
  app.lenis = lenis;
  lenis.stop();

  const mirror = (l) => {
    const s = app.state;
    s.scroll = l.scroll;
    s.limit = l.limit;
    s.velocity = l.velocity;
    s.direction = l.direction;
    s.progress = l.progress;
    app.emit("scroll", {
      scroll: l.scroll,
      limit: l.limit,
      velocity: l.velocity,
      direction: l.direction,
      progress: l.progress,
    });
  };

  lenis.on("scroll", app.ScrollTrigger.update);
  lenis.on("scroll", mirror);

  // seed the state so readers have sane values before the first scroll
  app.state.limit = lenis.limit;

  const start = () => {
    if (started) return;
    started = true;
    lenis.resize();
    lenis.start();
    app.state.limit = lenis.limit;
  };

  app.on("reveal:done", () => {
    app.state.revealing = false;
    app.state.revealed = true;
    start();
  });
  app.on("webgl:error", start);
  if (app.state.webglFailed || app.state.revealed) start();

  // A refresh (e.g. gsap.matchMedia rebuilding triggers when the window crosses 768px) parks the
  // window at 0 while it measures; Lenis would adopt that 0 as its target. Remember where the reader
  // was — as a fraction of the page, since breakpoint swaps change section heights — and go back.
  let savedProgress = null;
  app.ScrollTrigger.addEventListener("refreshInit", () => {
    if (savedProgress === null && started && lenis.limit > 0) savedProgress = lenis.targetScroll / lenis.limit;
  });
  // layout changes (sections mounting, fonts swapping) → keep Lenis' limit in sync
  app.ScrollTrigger.addEventListener("refresh", () => {
    lenis.resize();
    app.state.limit = lenis.limit;
    if (savedProgress === null) return;
    const y = Math.round(savedProgress * lenis.limit);
    savedProgress = null;
    if (Math.abs(lenis.scroll - y) > 1) lenis.scrollTo(y, { immediate: true, force: true });
  });
  app.on("resize", () => lenis.resize());
}
