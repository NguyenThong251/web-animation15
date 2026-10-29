// WebGL entry: init(app) mounts the engine in #webgl. Any failure — no WebGL2, a shader that does
// not compile, a model builder that throws — tears the engine down and emits 'webgl:error' so the
// shell can show its static fallback; the page itself keeps working.
//
// Context loss (GPU reset, backgrounded mobile tab, WEBGL_lose_context): the lost engine is torn
// down at once — every GL call is a silent no-op while the context is lost, so nothing logs — and a
// fresh engine is booted on a NEW canvas when the old context reports 'webglcontextrestored' (or,
// if that never arrives, a few seconds after the page is visible again). Rebuilding from scratch is
// the robust option: programs, shadow maps, render targets and uploads are all recreated. A page
// that keeps losing its context (3 losses within a minute) gets the static fallback instead.
import * as models from "./models/index.js";
import { Engine } from "./engine.js";

const RETRY_AFTER_MS = 3000; // visible page, no 'webglcontextrestored' yet → boot anyway
const MAX_LOSSES = 3;
const LOSS_WINDOW_MS = 60000;

let engine = null;
let losses = [];

export function init(app) {
  if (engine) return engine;
  return boot(app);
}

function boot(app) {
  const container = document.getElementById("webgl");

  const fail = (err) => {
    console.error("[webgl]", err);
    giveUp(app, err);
  };

  if (!container) {
    fail(new Error("#webgl container missing"));
    return null;
  }

  try {
    const e = new Engine(app, container, models, { onContextLost: (lost) => recover(app, lost) });
    engine = e;
    if (import.meta.env.DEV) window.__kvEngine = e;
    e.start().catch((err) => {
      // a boot cut short by a context loss is not a failure: the recovery owns it now
      if (e.contextLost || e.disposed) return;
      fail(err);
    });
  } catch (err) {
    fail(err);
  }
  return engine;
}

function giveUp(app, err) {
  engine?.dispose();
  if (!app.state.webglFailed) {
    app.state.webglFailed = true;
    app.emit("webgl:error", err instanceof Error ? err : new Error(String(err)));
  }
}

function recover(app, lost) {
  const canvas = lost.renderer?.domElement;
  const now = performance.now();
  losses = losses.filter((t) => now - t < LOSS_WINDOW_MS);
  losses.push(now);

  // tear down while the context is lost: the GL deletes are no-ops, the JS side is released
  if (engine === lost) engine = null;
  lost.dispose();
  if (import.meta.env.DEV && window.__kvEngine === lost) window.__kvEngine = null;

  if (losses.length >= MAX_LOSSES) {
    console.warn(`[webgl] context lost ${losses.length}× within a minute: static fallback`);
    giveUp(app, new Error("WebGL context lost repeatedly"));
    return;
  }

  let done = false;
  const lostAt = performance.now();
  let visibleAt = document.visibilityState === "visible" ? lostAt : 0;
  const rebuild = () => {
    if (done) return;
    done = true;
    cleanup();
    if (!engine && !app.state.webglFailed) boot(app);
  };
  // keep the old context restorable even if the loss was noticed before its event was dispatched
  const onLost = (e) => e.preventDefault();
  const onVisibility = () => {
    if (document.visibilityState === "visible" && !visibleAt) visibleAt = performance.now();
  };
  const timer = setInterval(() => {
    if (visibleAt && performance.now() - Math.max(lostAt, visibleAt) > RETRY_AFTER_MS) rebuild();
  }, 500);
  const cleanup = () => {
    clearInterval(timer);
    canvas?.removeEventListener("webglcontextlost", onLost);
    canvas?.removeEventListener("webglcontextrestored", rebuild);
    document.removeEventListener("visibilitychange", onVisibility);
  };
  canvas?.addEventListener("webglcontextlost", onLost);
  canvas?.addEventListener("webglcontextrestored", rebuild);
  document.addEventListener("visibilitychange", onVisibility);
}
