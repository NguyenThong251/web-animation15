// Poster deck — "KHU [Ê] VĂN" (SPEC_MOTION §4.7, sticky cards gallery).
//
// ≥768  The pink section is 1100svh: a 100svh sticky stage followed by three scroll
//       triggers (intro 100svh · sequence 100svh · carousel 800svh). Five ScrollTriggers
//       only write CSS custom properties / classes; every movement is CSS:
//         root      section entering (sT−vh → sT)        --root-progress = 1 − p
//         slice     intro div (sT → sT+vh)               --slice-progress = p
//         sequence  sequence div, "top center"           .-sequence-cards on the stage
//         carousel  carousel div (sT+2vh → sT+10vh)      poster index + --local-progress
//         parallax  whole section (sT−vh → sT+10vh)      --parallax-progress on the words
// <768  A 100svh carousel: pointer-drag track with snap, keyboard arrows and the
//       reference's sliding window of scaled dots. No dependencies beyond gsap.

const STEP = 0.2; // carousel progress per poster (the last poster holds for the remaining 1 − 0.2·(n−1))
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export function init(app) {
  const section = document.querySelector("[data-deck]");
  if (!section || section.dataset.deckReady === "true") return;
  section.dataset.deckReady = "true";

  const q = (sel) => section.querySelector(sel);
  const els = {
    section,
    stage: q("[data-deck-stage]"),
    words: q("[data-deck-words]"),
    viewport: q("[data-deck-viewport]"),
    track: q("[data-deck-track]"),
    cards: [...section.querySelectorAll("[data-deck-card]")],
    dots: q("[data-deck-dots]"),
    status: q("[data-deck-status]"),
    intro: q("[data-deck-intro]"),
    sequence: q("[data-deck-sequence]"),
    carousel: q("[data-deck-carousel]"),
  };
  if (!els.stage || els.cards.length < 2) return;

  watchDocumentHeight(app);

  const mm = app.gsap.matchMedia();
  mm.add(
    {
      isSm: "(max-width: 767px)",
      isMd: "(min-width: 768px)",
      isRm: "(prefers-reduced-motion: reduce)",
    },
    (ctx) => {
      const { isSm, isRm } = ctx.conditions;
      return isSm ? mountCarousel(app, els, { isRm }) : mountDeck(app, els, { isRm });
    },
  );
}

// The deck sits ~20 screens down the page: any section above that changes height after
// the last ScrollTrigger.refresh() (late images, WebGL fallbacks, fonts) would shift all
// five triggers. Refresh (debounced) whenever the document height actually changes.
function watchDocumentHeight(app) {
  let lastHeight = document.documentElement.scrollHeight;
  let timer = 0;
  const ro = new ResizeObserver(() => {
    const h = document.documentElement.scrollHeight;
    if (h === lastHeight) return;
    lastHeight = h;
    clearTimeout(timer);
    timer = setTimeout(() => app.ScrollTrigger.refresh(), 200);
  });
  ro.observe(document.body);
}

/* ------------------------------------------------------------------------ */
/* Desktop: sticky deck                                                      */
/* ------------------------------------------------------------------------ */
function mountDeck(app, els, { isRm }) {
  const { ScrollTrigger } = app;
  const { section, stage, words, cards, intro, sequence, carousel } = els;
  const n = cards.length;
  // deck order for index 0: [0, 1, 2, …, −1] → active, next, far…, previous
  const ORDER = cards.map((_, i) => (i === n - 1 ? -1 : i));
  const setVar = (el, name, value) => el.style.setProperty(name, String(value));
  let index = -1;

  // rotate the order so poster `next` is active; CSS transitions (900 ms) do the move
  function setIndex(next) {
    if (next === index) return;
    index = next;
    cards.forEach((card, i) => {
      const order = ORDER[(i - index + n) % n];
      setVar(card, "--sequence-order", order);
      setVar(card, "--sequence-abs", Math.abs(order));
      card.classList.toggle("-active", order === 0);
      card.classList.toggle("-next", order === 1);
      card.classList.toggle("-far", order > 1);
      card.classList.toggle("-previous", order < 0);
    });
  }

  const setSequence = (on) => stage.classList.toggle("-sequence-cards", on);

  // carousel progress → poster index + the drift inside the current step
  const onCarousel = (st) => {
    const p = st.progress;
    const i = clamp(Math.floor(p / STEP), 0, n - 1);
    const span = i === n - 1 ? 1 - STEP * i : STEP;
    if (!isRm) setVar(stage, "--local-progress", clamp((p - STEP * i) / span, 0, 1));
    setIndex(i);
  };

  setIndex(0);

  if (isRm) {
    // reduced motion: no collage, no drift, no parallax — a still deck that still pages on scroll
    setSequence(true);
    setVar(stage, "--root-progress", 0);
    setVar(stage, "--slice-progress", 1);
    setVar(stage, "--local-progress", 0.5);
    setVar(words, "--parallax-progress", 1);
  } else {
    const root = (st) => setVar(stage, "--root-progress", 1 - st.progress);
    ScrollTrigger.create({
      trigger: section,
      start: "top bottom",
      end: "top top",
      invalidateOnRefresh: true,
      onUpdate: root,
      onRefresh: root,
    });

    const slice = (st) => setVar(stage, "--slice-progress", st.progress);
    ScrollTrigger.create({
      trigger: intro,
      start: "top bottom",
      end: "bottom bottom",
      invalidateOnRefresh: true,
      onUpdate: slice,
      onRefresh: slice,
    });

    // added on enter / enterBack, removed only when scrolling back above the start
    ScrollTrigger.create({
      trigger: sequence,
      start: "top center",
      end: "bottom top",
      invalidateOnRefresh: true,
      onEnter: () => setSequence(true),
      onEnterBack: () => setSequence(true),
      onLeaveBack: () => setSequence(false),
      onRefresh: (st) => setSequence(st.progress > 0),
    });

    const parallax = (st) => setVar(words, "--parallax-progress", st.progress);
    ScrollTrigger.create({
      trigger: section,
      start: "top bottom",
      end: "bottom bottom",
      invalidateOnRefresh: true,
      onUpdate: parallax,
      onRefresh: parallax,
    });
  }

  ScrollTrigger.create({
    trigger: carousel,
    start: "top bottom",
    end: "bottom bottom",
    invalidateOnRefresh: true,
    onUpdate: onCarousel,
    onRefresh: onCarousel,
  });

  // the matchMedia context kills the ScrollTriggers; undo what they wrote
  return () => {
    setSequence(false);
    ["--root-progress", "--slice-progress", "--local-progress"].forEach((p) => stage.style.removeProperty(p));
    words.style.removeProperty("--parallax-progress");
    cards.forEach((card) => {
      card.style.removeProperty("--sequence-order");
      card.style.removeProperty("--sequence-abs");
      card.classList.remove("-active", "-next", "-far", "-previous");
    });
  };
}

/* ------------------------------------------------------------------------ */
/* Mobile: pointer-drag carousel                                             */
/* ------------------------------------------------------------------------ */
function mountCarousel(app, els, { isRm }) {
  const { gsap } = app;
  const { viewport, track, cards, dots, status } = els;
  const n = cards.length;
  const dotEls = dots ? [...dots.children] : [];
  const state = { x: 0, index: 0 };
  let pitch = 1; // distance between two slides = track width (slides are flex-basis 100%)
  let tween = null;
  let drag = null;

  const render = () => {
    track.style.transform = `translate3d(${state.x}px, 0, 0)`;
  };
  const minX = () => -(n - 1) * pitch;

  // window of dots: active centred (left shifts by 16px per step), scales 1 / .6 / .3 / 0
  function updateDots() {
    if (!dots) return;
    dots.style.setProperty("--dots-shift", -16 * state.index + 8 * (n - 1));
    dotEls.forEach((dot, i) => {
      const d = Math.abs(i - state.index);
      dot.style.setProperty("--dot-scale", d === 0 ? 1 : d === 1 ? 0.6 : d === 2 ? 0.3 : 0);
    });
  }

  function updateA11y(announce) {
    cards.forEach((card, i) => {
      card.setAttribute("aria-roledescription", "trang chiếu");
      card.setAttribute("aria-label", `${i + 1} / ${n}`);
      card.setAttribute("role", "group");
      if (i === state.index) card.removeAttribute("aria-hidden");
      else card.setAttribute("aria-hidden", "true");
    });
    if (announce && status) status.textContent = `Áp phích ${state.index + 1} / ${n}`;
  }

  function goTo(i, { instant = false } = {}) {
    const next = clamp(i, 0, n - 1);
    const changed = next !== state.index;
    state.index = next;
    tween?.kill();
    const target = -next * pitch;
    if (instant || isRm) {
      state.x = target;
      render();
    } else {
      tween = gsap.to(state, { x: target, duration: 0.6, ease: "power3.out", onUpdate: render });
    }
    updateDots();
    updateA11y(changed);
  }

  function measure() {
    pitch = track.getBoundingClientRect().width || 1;
    goTo(state.index, { instant: true });
  }

  /* --- pointer drag (touch-action: pan-y keeps vertical page scrolling native) --- */
  function onDown(e) {
    if (e.button !== 0 || drag) return;
    tween?.kill();
    drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, from: state.x, start: state.index, axis: null, samples: [{ x: e.clientX, t: e.timeStamp }] };
    if (e.pointerType === "mouse") e.preventDefault(); // no text selection / image drag
  }

  function onMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0;
    const dy = e.clientY - drag.y0;
    if (!drag.axis) {
      if (Math.hypot(dx, dy) < 6) return;
      drag.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (drag.axis === "y") {
        drag = null; // vertical intent: leave it to the page scroll
        return;
      }
      viewport.setPointerCapture?.(e.pointerId);
      viewport.classList.add("is-dragging");
    }
    let x = drag.from + dx;
    // rubber band beyond the first / last poster
    if (x > 0) x *= 0.35;
    else if (x < minX()) x = minX() + (x - minX()) * 0.35;
    state.x = x;
    render();
    drag.samples.push({ x: e.clientX, t: e.timeStamp });
    if (drag.samples.length > 8) drag.samples.shift();
  }

  function onUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    viewport.classList.remove("is-dragging");
    if (d.axis !== "x") return;
    // release velocity over the last ~100 ms (px/ms), projected 200 ms ahead
    const recent = d.samples.filter((s) => e.timeStamp - s.t <= 100);
    const first = recent[0] ?? d.samples[d.samples.length - 1];
    const v = (e.clientX - first.x) / Math.max(16, e.timeStamp - first.t);
    const projected = Math.round(-(state.x + v * 200) / pitch);
    goTo(clamp(projected, d.start - 1, d.start + 1));
  }

  function onCancel(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const wasDragging = drag.axis === "x";
    drag = null;
    viewport.classList.remove("is-dragging");
    if (wasDragging) goTo(state.index);
  }

  function onKey(e) {
    if (e.key === "ArrowRight") goTo(state.index + 1);
    else if (e.key === "ArrowLeft") goTo(state.index - 1);
    else if (e.key === "Home") goTo(0);
    else if (e.key === "End") goTo(n - 1);
    else return;
    e.preventDefault();
  }

  viewport.setAttribute("tabindex", "0");
  viewport.setAttribute("role", "region");
  viewport.setAttribute("aria-roledescription", "băng chuyền");
  viewport.setAttribute("aria-label", "Áp phích — vuốt ngang hoặc dùng phím mũi tên để xem");

  viewport.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onCancel);
  viewport.addEventListener("keydown", onKey);
  const ro = new ResizeObserver(measure);
  ro.observe(viewport);
  measure();

  return () => {
    ro.disconnect();
    tween?.kill();
    viewport.removeEventListener("pointerdown", onDown);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    viewport.removeEventListener("keydown", onKey);
    ["tabindex", "role", "aria-roledescription", "aria-label"].forEach((a) => viewport.removeAttribute(a));
    viewport.classList.remove("is-dragging");
    track.style.removeProperty("transform");
    cards.forEach((card) => ["aria-hidden", "aria-roledescription", "aria-label", "role"].forEach((a) => card.removeAttribute(a)));
    dots?.style.removeProperty("--dots-shift");
    dotEls.forEach((dot) => dot.style.removeProperty("--dot-scale"));
    if (status) status.textContent = "";
  };
}
