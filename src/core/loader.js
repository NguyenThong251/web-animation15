// Loader / intro sequence.
//  1. a 12px pink stroke runs clockwise around the viewport from the top centre as WebGL loads
//  2. a 40-frame flip-book of Vietnamese letters (stacked diacritics) + four Hán characters, 100 ms/frame
//  3. a 320px hairline spinner
// Intro tween → wait for 'webgl:compiled' → exit (frame flies outward, glyph + spinner fade) and
// 'reveal:start'. Without WebGL the loader turns into a static fallback panel that fades as you scroll.

import { glyphFrames, frameFont, loadCycleFonts } from "./glyph-cycle.js";

// does a WebGL engine module exist at all? (main.js fakes 'compiled' when it does not)
const HAS_ENGINE = Object.keys(import.meta.glob("../webgl/index.js")).length > 0;

function webglSupported() {
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

function buildFrames(flip) {
  return glyphFrames().map((f, i) => {
    const span = document.createElement("span");
    span.className = "loader__frame";
    if (f.han) span.classList.add("han");
    if (f.stroke) span.classList.add("stroke-text");
    span.style.fontWeight = f.weight;
    span.style.fontStyle = f.italic ? "italic" : "normal";
    // frame i flashes for 100 ms every 4 s, starting 1.2 s + i × 100 ms in → a 40-frame loop
    span.style.animationDelay = `${(1.2 + 0.1 * i).toFixed(1)}s`;
    span.style.opacity = i === 0 ? "1" : "0"; // the frame shown during the initial delay
    span.textContent = f.text;
    flip.appendChild(span);
    return { ...f, span };
  });
}

// Re-centre every glyph on its ink box instead of its em box (stacked marks make the ink sit high).
function centreFrames(frames) {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return;
  const size = 100;
  for (const f of frames) {
    ctx.font = frameFont(f, size);
    const m = ctx.measureText(f.text);
    const fontAsc = m.fontBoundingBoxAscent ?? size * 0.8;
    const fontDesc = m.fontBoundingBoxDescent ?? size * 0.2;
    // line-height is 1em: the baseline sits half the (negative) leading below the content-area top
    const baseline = (size - (fontAsc + fontDesc)) / 2 + fontAsc;
    const inkCentre = baseline - (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
    const offsetEm = (size / 2 - inkCentre) / size;
    f.span.style.transform = `translateX(-50%) translateY(calc(-50% + ${offsetEm.toFixed(4)}em))`;
  }
}

export function init(app) {
  const root = document.querySelector("[data-loader]");
  if (!root || root.dataset.ready) return;
  root.dataset.ready = "true";

  const { gsap } = app;
  const progressEl = root.querySelector("[data-loader-progress]");
  const svg = progressEl.querySelector("svg");
  const path = svg.querySelector("path");
  const charEl = root.querySelector("[data-loader-char]");
  const flip = root.querySelector("[data-loader-flip]");
  const spinner = root.querySelector("[data-loader-spinner]");
  const fallback = root.querySelector("[data-loader-fallback]");
  const status = root.querySelector("[data-loader-status]");

  const frames = buildFrames(flip);

  // ---- border progress path: starts top-centre, clockwise round the viewport ----
  let progress = app.state.webglProgress || 0;
  const layoutPath = () => {
    const w = innerWidth;
    const h = innerHeight;
    path.setAttribute("d", `M ${w / 2} 0 H ${w} V ${h} H 0 V 0 Z`);
    path.style.setProperty("--loader-path-length", `${path.getTotalLength()}px`);
  };
  const setProgress = (p) => {
    progress = Math.max(progress, Math.min(1, Math.max(0, p || 0)));
    path.style.setProperty("--loader-progress", progress);
  };
  layoutPath();
  setProgress(progress);
  requestAnimationFrame(() => (path.dataset.progressReady = "true")); // enable the .5s easing after the first paint
  addEventListener("resize", layoutPath);

  // ---- state machine: intro → (compiled) → exit ----
  let introDone = false;
  let exiting = false;
  let finished = false;
  let failed = false;
  let introTl = null;
  let exitTl = null;
  let compiledSeen = !!app.state.compiled;

  const finish = () => {
    if (finished) return;
    finished = true;
    removeEventListener("resize", layoutPath);
    root.hidden = true;
    if (!HAS_ENGINE && !app.state.revealed) app.emit("reveal:done"); // nothing to reveal underneath
  };

  const exit = () => {
    if (!introDone || exiting || failed) return;
    if (!compiledSeen && !app.state.compiled) return;
    exiting = true;
    setProgress(1);
    status.textContent = "Đã tải xong.";
    app.state.revealing = true;
    app.emit("reveal:start");

    // safety net: an engine that never reports 'reveal:done' must not lock the page
    if (HAS_ENGINE) {
      setTimeout(() => {
        if (!app.state.revealed && !failed) app.emit("reveal:done");
      }, 8000);
    }

    exitTl = gsap
      .timeline({ delay: 0.5, onComplete: finish })
      .to(progressEl, { scale: 1.1, duration: 2, ease: "power2.inOut" })
      .to(charEl, { scale: 0.6, opacity: 0, duration: 0.6, ease: "power3.inOut" }, "<")
      .to(spinner, { scale: 1, opacity: 0, duration: 1, ease: "power3.inOut" }, "<");
  };

  // ---- WebGL unavailable: static panel, page still scrolls ----
  const showFallback = () => {
    if (failed) return;
    failed = true;
    introTl?.kill();
    exitTl?.kill();
    root.hidden = false;
    root.classList.add("is-fallback");
    document.documentElement.classList.add("webgl-failed");
    fallback.hidden = false;
    status.textContent = "Trải nghiệm tương tác không khả dụng trên trình duyệt này.";
    gsap.set([progressEl, charEl, spinner], { autoAlpha: 0 });

    if (!app.state.webglFailed) {
      app.state.webglFailed = true;
      app.emit("webgl:error", new Error("WebGL is not available"));
    }
    if (!app.state.revealing && !app.state.revealed) {
      app.state.revealing = true;
      app.emit("reveal:start");
    }
    if (!app.state.revealed) app.emit("reveal:done");

    // the panel lives behind the DOM (z 1) and fades over the first screen of scroll
    const fade = () => {
      const k = Math.min(1, Math.max(0, (app.state.scroll || scrollY) / (innerHeight * 0.6)));
      root.style.opacity = String(1 - k);
      root.style.visibility = k >= 1 ? "hidden" : "";
    };
    app.on("scroll", fade);
    addEventListener("scroll", fade, { passive: true });
    fade();
    requestAnimationFrame(() => app.ScrollTrigger.refresh());
  };

  app.on("webgl:progress", (p) => setProgress(p));
  app.on("webgl:compiled", () => {
    compiledSeen = true;
    setProgress(1);
    exit();
  });
  app.on("webgl:error", showFallback);

  if (app.state.webglFailed || !webglSupported()) {
    showFallback();
    return;
  }

  // ---- intro: wait (briefly) for the faces so the first frames are not drawn in a fallback font ----
  const rm = app.mq.rm.matches;
  if (rm) root.classList.add("is-static");
  const fontsReady = loadCycleFonts(1200);
  fontsReady.then(() => {
    centreFrames(frames);
    if (failed) return;
    introTl = gsap
      .timeline({
        onComplete: () => {
          introDone = true;
          exit();
        },
      })
      .fromTo(charEl, { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.8, ease: "power3.inOut" }, 0)
      .fromTo(spinner, { scale: 1.05, opacity: 0 }, { scale: 1, opacity: 1, duration: 1, ease: "power3.inOut" }, 0);
  });
  // a late font swap shifts the ink boxes: measure again once everything has settled
  document.fonts.ready.then(() => centreFrames(frames));
}
