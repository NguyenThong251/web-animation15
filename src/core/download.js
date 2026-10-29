// Download pill: a fixed dashed frame at the viewport centre that unfolds horizontally from the
// middle while the closing scene plays — width = clamp01((sceneProgress.text − 0.42) / 0.5) —
// and rides up with the footer (y = −footerTextureOffset × innerHeight, capped so the frame never
// slides under the fixed header on short/narrow screens). Pointer clicks only reach it while the
// scroll-spy says we are in "Tải về"; for the keyboard it is always in the tab order, and focusing
// it while it is folded scrolls to the "Tải về" landing so it opens under the focus ring.

const clamp01 = (v) => Math.min(1, Math.max(0, v));

export function init(app) {
  const root = document.querySelector("[data-download]");
  if (!root || root.dataset.ready) return;
  root.dataset.ready = "true";

  const { gsap, ScrollTrigger } = app;
  const shift = root.querySelector("[data-download-shift]");
  const clip = root.querySelector("[data-download-clip]");
  const link = root.querySelector("[data-download-link]");
  const header = document.querySelector("[data-header]");

  const setLeft = gsap.quickSetter(clip, "left", "%");
  const setWidth = gsap.quickSetter(clip, "width", "%");
  const setY = gsap.quickSetter(shift, "y", "px");

  // Fallback progress (no WebGL engine, or it failed): the same mapping the engine uses for the
  // closing scene — 0 at the top of the hands segment, 1 one screen before its end.
  const hands = document.querySelector('[data-scene-scroll-segment="hands"]');
  let handsTop = 0;
  let handsRange = 1;
  // how far the frame may ride up: from its resting (centred) top to just below the header
  let maxRise = Infinity;
  let lastL = -1;
  let lastY = NaN;
  let appliedY = 0;
  const measure = () => {
    if (hands) {
      handsTop = hands.getBoundingClientRect().top + scrollY;
      handsRange = Math.max(1, hands.offsetHeight - innerHeight);
    }
    const restTop = clip.getBoundingClientRect().top - appliedY;
    maxRise = Math.max(0, restTop - ((header?.offsetHeight || 0) + 16));
    lastY = NaN; // re-apply the (possibly re-capped) offset on the next tick
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

  // pointer activation only while the pill is the active section (it is closed or on its way out
  // otherwise); the link itself stays a normal, always-focusable link
  const setActive = (on) => root.classList.toggle("is-active", on);
  setActive(app.state.activeNav === "tai-ve");
  app.on("nav:change", (id) => setActive(id === "tai-ve"));

  // keyboard: Tab reaches the link in DOM order (after the glyph set). If the pill is not open yet,
  // bring the visitor to where it is — the same landing as the "Tải về" menu item.
  link.addEventListener("focus", () => {
    if (lastL >= 1) return;
    if (!link.matches(":focus-visible")) return; // a pointer can only press it when it is open anyway
    app.emit("nav:goto", { id: "tai-ve", focus: false });
  });

  gsap.ticker.add(() => {
    const l = clamp01((textProgress() - 0.42) / 0.5);
    const y = -Math.min((app.state.footerTextureOffset || 0) * innerHeight, maxRise);
    if (l !== lastL) {
      lastL = l;
      setLeft(50 * (1 - l));
      setWidth(100 * l);
      root.classList.toggle("is-folded", l <= 0);
    }
    if (y !== lastY) {
      lastY = appliedY = y;
      setY(y);
    }
  });
}
