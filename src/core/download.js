// Download pill: a fixed dashed frame at the viewport centre that unfolds horizontally from the
// middle while the closing scene plays — width = clamp01((sceneProgress.text − 0.42) / 0.5) —
// and rides up with the footer (y = −footerTextureOffset × innerHeight). Clickable only while the
// scroll-spy says we are in "Tải về".

const clamp01 = (v) => Math.min(1, Math.max(0, v));

export function init(app) {
  const root = document.querySelector("[data-download]");
  if (!root || root.dataset.ready) return;
  root.dataset.ready = "true";

  const { gsap, ScrollTrigger } = app;
  const shift = root.querySelector("[data-download-shift]");
  const clip = root.querySelector("[data-download-clip]");
  const link = root.querySelector("[data-download-link]");

  const setLeft = gsap.quickSetter(clip, "left", "%");
  const setWidth = gsap.quickSetter(clip, "width", "%");
  const setY = gsap.quickSetter(shift, "y", "px");

  // Fallback progress (no WebGL engine, or it failed): the same mapping the engine uses for the
  // closing scene — 0 at the top of the hands segment, 1 one screen before its end.
  const hands = document.querySelector('[data-scene-scroll-segment="hands"]');
  let handsTop = 0;
  let handsRange = 1;
  const measure = () => {
    if (!hands) return;
    handsTop = hands.getBoundingClientRect().top + scrollY;
    handsRange = Math.max(1, hands.offsetHeight - innerHeight);
  };
  measure();
  ScrollTrigger.addEventListener("refresh", measure);
  app.on("resize", measure);
  app.on("fonts:ready", measure);

  const textProgress = () => {
    const sp = app.state.sceneProgress;
    if (!app.state.webglFailed && sp && Number.isFinite(sp.text)) return sp.text;
    const scroll = app.lenis ? app.lenis.scroll : scrollY;
    return clamp01((scroll - handsTop) / handsRange);
  };

  let active = false;
  const setActive = (on) => {
    active = on;
    root.classList.toggle("is-active", on);
    link.setAttribute("aria-disabled", on ? "false" : "true");
    link.setAttribute("tabindex", on ? "0" : "-1");
  };
  setActive(app.state.activeNav === "tai-ve");
  app.on("nav:change", (id) => setActive(id === "tai-ve"));

  // block activation while inactive (it is visually closed or on its way out)
  link.addEventListener("click", (e) => {
    if (!active) e.preventDefault();
  });

  let lastL = -1;
  let lastY = NaN;
  gsap.ticker.add(() => {
    const l = clamp01((textProgress() - 0.42) / 0.5);
    const y = -(app.state.footerTextureOffset || 0) * innerHeight;
    if (l !== lastL) {
      lastL = l;
      setLeft(50 * (1 - l));
      setWidth(100 * l);
      // fully folded → out of the a11y tree and the tab order
      root.classList.toggle("is-folded", l <= 0);
    }
    if (y !== lastY) {
      lastY = y;
      setY(y);
    }
  });
}
