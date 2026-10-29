// The WebGL engine: one fixed canvas, six scenes each rendering into its own render target, the
// ink-splat simulation and ONE full-screen compositor (SPEC_WEBGL §1–§3, §8).
//
// Boot:   renderer → procedural textures → scenes load in parallel ('webgl:progress')
//         → renderer.compile per scene (everything visible, culling off) → one warm-up render per
//         scene per frame → 'webgl:compiled'.
// Reveal: 'reveal:start' → 4 s ink-blot + depth materialisation + hero crane-in → 'reveal:done'.
// Frame:  scroll → scene table → update the 1–2 active scenes → render their passes → composite.
import * as THREE from "three";
import { SceneScrollMap } from "./scroll-map.js";
import { Compositor } from "./compositor.js";
import { SplatSim } from "./splat.js";
import { createDotPatternTexture, createAdvectTexture, createRevealMaskTexture } from "./textures.js";
import { DPR_RANGE, MOBILE_MAX_WIDTH, SCENE_IDS, clamp } from "./config.js";
import { HeroScene } from "./scenes/hero.js";
import { SteleScene } from "./scenes/stele.js";
import { DepthScene } from "./scenes/depth.js";
import { PaperScene } from "./scenes/paper.js";
import { HandsScene } from "./scenes/hands.js";
import { InscriptionScene } from "./scenes/inscription.js";

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

export class Engine {
  constructor(app, container, models) {
    this.app = app;
    this.container = container;
    this.models = models;
    this.disposed = false;
    this.compiled = false;
    this.revealState = "idle"; // idle → pending → running → done
    this.time = 0;
    this.last = 0;
    this.running = false;
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.isTouch = matchMedia("(pointer: coarse)").matches; // phones / tablets (URL-bar resizes)
    this.lastInnerWidth = 0;
    this.reducedMotion = !!app.mq?.rm?.matches;
    this.transition = { from: SCENE_IDS[0], to: null, progress: 0 };
    this.cleanups = [];
  }

  /* ------------------------------------------------------------------ boot */

  createRenderer() {
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      depth: true,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    });
    if (!gl) throw new Error("WebGL2 is not available");
    const renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: false, alpha: true });
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setClearColor(0x000000, 0);
    renderer.autoClear = true;
    this.renderer = renderer;
    // half-float colour targets need EXT_color_buffer_(half_)float; without it scenes fall back to 8 bit
    this.halfFloatTargets =
      renderer.extensions.has("EXT_color_buffer_float") || renderer.extensions.has("EXT_color_buffer_half_float");
    this.container.appendChild(canvas);

    const onLost = (e) => {
      e.preventDefault();
      this.stopLoop();
    };
    const onRestored = () => {
      this.splat?.resize(this.width, this.height, this.dpr);
      if (document.visibilityState === "visible") this.startLoop();
    };
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    this.cleanups.push(() => {
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
    });
  }

  async start() {
    const app = this.app;
    this.createRenderer();

    this.textures = {
      dotPattern: createDotPatternTexture(),
      advect: createAdvectTexture(),
      revealMask: createRevealMaskTexture(),
    };
    this.compositor = new Compositor(this.renderer, this.textures);
    this.splat = new SplatSim(this.renderer, this.textures.advect);
    this.splat.setEnabled(!this.reducedMotion);
    this.compositor.uniforms.uSplat.value = this.splat.texture;

    this.scrollMap = new SceneScrollMap();
    this.scenes = {
      hero: new HeroScene(this, this.models),
      stele: new SteleScene(this, this.models),
      depth: new DepthScene(this),
      paper: new PaperScene(this),
      hands: new HandsScene(this, this.models),
      text: new InscriptionScene(this, this.models),
    };

    this.resize();
    this.bindEvents();
    // the loader background (blue paper, pink micro-dots) renders while the scenes load
    this.startLoop();

    // ---- load every scene, reporting progress like the reference's asset manifest (0.99 × n/N)
    const isMobile = innerWidth <= MOBILE_MAX_WIDTH;
    const quality = isMobile || this.isTouch ? "low" : "high";
    const ids = Object.keys(this.scenes);
    let loaded = 0;
    this.setProgress(0);
    await Promise.all(
      ids.map(async (id) => {
        await this.scenes[id].load({ quality, isMobile });
        if (this.disposed) return;
        loaded += 1;
        this.setProgress(0.99 * (loaded / ids.length));
      }),
    );
    if (this.disposed) return;
    this.resize(true);

    // ---- compile every scene (+ compositor and splat) before anything is shown
    for (const id of ids) {
      await this.compileScene(this.scenes[id]);
      if (this.disposed) return;
    }
    this.renderer.compile(this.compositor.scene, this.compositor.camera);
    this.renderer.compile(this.splat.scene, this.splat.camera);

    // ---- warm-up: one real render of each scene, one per frame (shadow programs, texture uploads)
    for (const id of ids) {
      await nextFrame();
      if (this.disposed) return;
      this.renderPasses(this.scenes[id], 0);
    }
    await nextFrame();
    if (this.disposed) return;

    this.compiled = true;
    this.compositor.uniforms.uCompiled.value = 1;
    app.state.compiled = true;
    this.setProgress(1);
    app.emit("webgl:compiled");
    if (this.revealState === "pending") this.playReveal();
  }

  setProgress(p) {
    this.app.state.webglProgress = p;
    this.app.emit("webgl:progress", p);
  }

  async compileScene(s) {
    const restore = [];
    s.scene.traverse((o) => {
      restore.push([o, o.visible, o.frustumCulled]);
      o.visible = true;
      o.frustumCulled = false;
    });
    s.camera.layers.enableAll();
    try {
      // compileAsync only pays off (and only stays quiet) with KHR_parallel_shader_compile
      const r = this.renderer;
      if (r.extensions.has("KHR_parallel_shader_compile")) await r.compileAsync(s.scene, s.camera);
      else {
        r.compile(s.scene, s.camera);
        await nextFrame(); // keep the loader animating between scenes
      }
    } finally {
      s.camera.layers.set(0);
      for (const [o, v, f] of restore) {
        o.visible = v;
        o.frustumCulled = f;
      }
    }
  }

  /* ------------------------------------------------------------------ events */

  bindEvents() {
    const app = this.app;
    const on = (target, type, fn, opts) => {
      target.addEventListener(type, fn, opts);
      this.cleanups.push(() => target.removeEventListener(type, fn, opts));
    };
    const offs = [];

    // scroll: resolve on every Lenis scroll (DOM readers get fresh state) and every frame
    offs.push(app.on("scroll", () => this.resolveScroll()));
    on(window, "scroll", () => this.resolveScroll(), { passive: true });

    // layout → re-measure the segments (rAF-throttled)
    offs.push(app.on("resize", () => this.resize()));
    offs.push(app.on("fonts:ready", () => this.scheduleMeasure()));
    on(window, "load", () => this.scheduleMeasure());
    const refresh = () => this.scheduleMeasure();
    app.ScrollTrigger?.addEventListener?.("refresh", refresh);
    this.cleanups.push(() => app.ScrollTrigger?.removeEventListener?.("refresh", refresh));
    if ("ResizeObserver" in window) {
      const ro = new ResizeObserver(() => this.scheduleMeasure());
      const root = document.querySelector("[data-scene-scroll-root]");
      if (root) ro.observe(root);
      ro.observe(document.body);
      const cro = new ResizeObserver(() => this.resize());
      cro.observe(this.container);
      this.cleanups.push(() => {
        ro.disconnect();
        cro.disconnect();
      });
    }

    // reveal
    offs.push(app.on("reveal:start", () => this.requestReveal()));
    if (app.state.revealing && !app.state.revealed) this.requestReveal();

    // pause rendering while the tab is hidden
    on(document, "visibilitychange", () => {
      if (document.visibilityState === "hidden") this.stopLoop();
      else this.startLoop();
    });

    // reduced motion can change live
    const rm = app.mq?.rm;
    if (rm) {
      const onRm = () => {
        this.reducedMotion = rm.matches;
        this.splat.setEnabled(!this.reducedMotion);
      };
      rm.addEventListener("change", onRm);
      this.cleanups.push(() => rm.removeEventListener("change", onRm));
    }
    this.cleanups.push(() => offs.forEach((off) => off()));
  }

  scheduleMeasure() {
    if (this.measureQueued) return;
    this.measureQueued = true;
    requestAnimationFrame(() => {
      this.measureQueued = false;
      if (this.disposed) return;
      this.scrollMap.measure();
      this.resolveScroll();
    });
  }

  resize(force = false) {
    const w = Math.max(1, this.container.clientWidth || innerWidth);
    const h = Math.max(1, this.container.clientHeight || innerHeight);
    const dpr = clamp(window.devicePixelRatio || 1, DPR_RANGE[0], DPR_RANGE[1]);
    this.scrollMap.updateSceneHeight(this.isTouch, this.lastInnerWidth, innerWidth);
    this.lastInnerWidth = innerWidth;
    this.scheduleMeasure();
    if (!force && w === this.width && h === this.height && dpr === this.dpr) return;
    // touch: a height-only change (URL bar) keeps the targets, like the reference
    if (!force && this.isTouch && w === this.width && this.height) return;
    this.width = w;
    this.height = h;
    this.dpr = dpr;
    const r = this.renderer;
    r.setPixelRatio(dpr);
    r.setSize(w, h, false);
    const bw = Math.floor(w * dpr);
    const bh = Math.floor(h * dpr);
    this.compositor.resize(bw, bh);
    this.splat.resize(w, h, dpr);
    const info = { width: w, height: h, bufferWidth: bw, bufferHeight: bh, isMobile: w <= MOBILE_MAX_WIDTH };
    for (const s of Object.values(this.scenes)) s.resize(info);
  }

  /* ------------------------------------------------------------------ scroll */

  currentScroll() {
    const l = this.app.lenis;
    return l && typeof l.scroll === "number" ? l.scroll : window.scrollY;
  }

  resolveScroll() {
    if (!this.scrollMap.measured) this.scrollMap.measure();
    const res = this.scrollMap.resolve(this.currentScroll());
    const st = this.app.state;
    st.sceneProgress = res.sceneProgress;
    const t = this.transition;
    t.from = res.scene1;
    t.to = res.scene2;
    t.progress = res.progress;
    st.transition = t;
    return res;
  }

  /* ------------------------------------------------------------------ reveal */

  requestReveal() {
    if (this.revealState !== "idle") return;
    this.revealState = "pending";
    if (this.compiled) this.playReveal();
  }

  playReveal() {
    if (this.revealState === "running" || this.revealState === "done") return;
    this.revealState = "running";
    const { gsap } = this.app;
    const u = this.compositor.uniforms;
    const hero = this.scenes.hero;
    const k = this.reducedMotion ? 0.35 : 1; // reduced motion: same sequence, shorter, no crane
    u.uRevealActive.value = 1;
    this.revealTl = gsap
      .timeline({ onComplete: () => this.finishReveal() })
      .fromTo(u.uRevealDepthProgress, { value: 0 }, { value: 1, duration: 4 * k, ease: "power1.inOut" }, 0)
      .fromTo(u.uRevealProgress, { value: 0 }, { value: 1, duration: 3 * k, ease: "power2.inOut" }, 0.7 * k)
      .fromTo(hero.crane, { y: this.reducedMotion ? 0 : -3 }, { y: 0, duration: 4 * k, ease: "power3.inOut" }, 0);
  }

  finishReveal() {
    this.revealState = "done";
    const u = this.compositor.uniforms;
    u.uRevealProgress.value = 1;
    u.uRevealDepthProgress.value = 1;
    u.uRevealActive.value = 0; // mask fully open (values ≤ 0.9) → skip it from now on
    const st = this.app.state;
    st.revealing = false;
    st.revealed = true;
    this.app.emit("reveal:done");
  }

  /* ------------------------------------------------------------------ frame */

  startLoop() {
    if (this.running || this.disposed) return;
    this.running = true;
    this.last = performance.now() / 1000;
    this.renderer.setAnimationLoop(() => this.tick());
  }

  stopLoop() {
    this.running = false;
    this.renderer?.setAnimationLoop(null);
  }

  // render one scene's layer passes into its own target and the slot's text / background targets
  renderPasses(s, slot) {
    const r = this.renderer;
    const cam = s.camera;
    cam.layers.set(0);
    r.setRenderTarget(s.rt);
    r.render(s.scene, cam);
    if (s.needsTextPass) {
      cam.layers.set(1);
      r.setRenderTarget(this.compositor.textRT[slot]);
      r.render(s.scene, cam);
    }
    if (s.needsBackgroundPass) {
      cam.layers.set(2);
      r.setRenderTarget(this.compositor.bgRT[slot]);
      r.render(s.scene, cam);
    }
    cam.layers.set(0);
    r.setRenderTarget(null);
  }

  tick() {
    const now = performance.now() / 1000;
    const delta = Math.max(0, now - this.last);
    this.last = now;
    const dt = Math.min(delta, 1 / 30);
    this.time += Math.min(delta, 0.1);
    const u = this.compositor.uniforms;

    if (!this.compiled) {
      this.compositor.render();
      return;
    }

    const res = this.resolveScroll();
    const s1 = this.scenes[res.scene1];
    const s2 = res.scene2 ? this.scenes[res.scene2] : null;
    const frame = {
      dt,
      time: this.time,
      progress: 0,
      pointer: this.app.pointer,
      reducedMotion: this.reducedMotion,
      transition: this.transition,
      state: this.app.state,
    };
    frame.progress = res.sceneProgress[s1.id];
    s1.update(frame);
    if (s2) {
      frame.progress = res.sceneProgress[s2.id];
      s2.update(frame);
    }

    this.splat.step(now, this.app.pointer);

    this.renderPasses(s1, 0);
    if (s2) this.renderPasses(s2, 1);

    this.compositor.bind(0, s1);
    this.compositor.bind(1, s2);
    u.uSplat.value = this.splat.texture;
    u.uTransition.value = s2 ? res.progress : 0;
    u.uTransitionStyle.value = s2 ? res.style : 0;
    u.uFooterOffset.value = this.app.state.footerTextureOffset || 0;
    this.compositor.render();
  }

  /* ------------------------------------------------------------------ teardown */

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stopLoop();
    this.revealTl?.kill();
    this.cleanups.forEach((fn) => fn());
    this.cleanups = [];
    try {
      Object.values(this.scenes ?? {}).forEach((s) => s.dispose());
      this.compositor?.dispose();
      this.splat?.dispose();
      Object.values(this.textures ?? {}).forEach((t) => t.dispose());
      this.renderer?.dispose();
    } catch (e) {
      console.warn("[webgl] dispose", e);
    }
    this.renderer?.domElement.remove();
  }
}
