// Custom scrollbar for the Lenis root scroller: a 12px track with a pink pill thumb
// (thumbH = trackH × viewport / document height, y = progress × free track), draggable.
// Hidden on touch devices by CSS; invisible when nothing overflows.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function init(app) {
  const root = document.querySelector("[data-scrollbar]");
  if (!root || root.dataset.ready) return;
  root.dataset.ready = "true";

  const { gsap } = app;
  const thumb = root.querySelector("[data-scrollbar-thumb]");
  const setY = gsap.quickSetter(thumb, "y", "px");

  let trackH = 0;
  let thumbH = 0;
  let lastLimit = -1;
  let lastDocH = -1;

  const limit = () => (app.lenis ? app.lenis.limit : document.documentElement.scrollHeight - innerHeight);
  const progress = () => {
    const l = limit();
    const s = app.lenis ? app.lenis.scroll : scrollY;
    return l > 0 ? clamp(s / l, 0, 1) : 0;
  };

  const place = () => setY(progress() * (trackH - thumbH));

  const layout = () => {
    const docH = document.documentElement.scrollHeight;
    trackH = root.clientHeight || innerHeight;
    const overflow = docH > innerHeight + 1;
    root.classList.toggle("is-visible", overflow);
    thumbH = overflow ? (trackH * innerHeight) / docH : 0;
    thumb.style.height = `${thumbH}px`;
    lastDocH = docH;
    lastLimit = limit();
    place();
  };

  // the document keeps growing while sections mount → re-layout whenever Lenis' limit changes
  gsap.ticker.add(() => {
    if (limit() !== lastLimit || document.documentElement.scrollHeight !== lastDocH) layout();
  });
  app.on("scroll", place);
  app.on("resize", layout);
  layout();

  // ---- drag: pointerdown on the thumb, track the pointer on the window ----
  let dragging = false;
  let startPointer = 0;
  let startThumb = 0;

  thumb.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || !app.lenis || app.lenis.isStopped) return;
    e.preventDefault();
    dragging = true;
    startPointer = e.clientY;
    startThumb = progress() * (trackH - thumbH);
    root.classList.add("is-dragging");
    document.documentElement.classList.add("is-scrollbar-dragging");
  });
  addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const free = Math.max(1, trackH - thumbH);
    const y = clamp(startThumb + (e.clientY - startPointer), 0, free);
    app.lenis.scrollTo((y / free) * limit(), { duration: 1, easing: gsap.parseEase("power2.out") });
  });
  const stop = () => {
    if (!dragging) return;
    dragging = false;
    root.classList.remove("is-dragging");
    document.documentElement.classList.remove("is-scrollbar-dragging");
  };
  addEventListener("pointerup", stop);
  addEventListener("pointercancel", stop);
}
