// Boot order (mirrors the reference site's _app):
//   styles → pointer/resize → core modules (loader, lenis, header…) → WebGL engine
//   → fonts ready → section modules → compiled → loader exit → reveal → Lenis start.
// Modules are discovered by glob and loaded one by one, so a module that fails to load or
// init only takes itself down: every src/core/*.js and src/sections/*.js exporting
// `init(app)` is called once.
import { app } from "./core/app.js";

// every stylesheet in src/styles is applied in filename order (00-base.css first)
import.meta.glob("./styles/*.css", { eager: true });

const coreModules = import.meta.glob(["./core/*.js", "!./core/app.js"]);
const sectionModules = import.meta.glob("./sections/*.js");
const webglEntry = import.meta.glob("./webgl/index.js");

function trackPointer() {
  const p = app.pointer;
  const set = (x, y) => {
    p.x = x;
    p.y = y;
    p.x01 = x / innerWidth;
    p.y01 = 1 - y / innerHeight;
    p.nx = p.x01 * 2 - 1;
    p.ny = p.y01 * 2 - 1;
    p.moved = true;
  };
  addEventListener("pointermove", (e) => set(e.clientX, e.clientY), { passive: true });
  addEventListener("pointerdown", (e) => set(e.clientX, e.clientY), { passive: true });
}

function trackResize() {
  let w = innerWidth;
  let h = innerHeight;
  addEventListener("resize", () => {
    if (innerWidth === w && innerHeight === h) return;
    w = innerWidth;
    h = innerHeight;
    app.emit("resize", { w, h });
  });
}

async function initAll(mods, label) {
  const entries = Object.entries(mods).sort(([a], [b]) => a.localeCompare(b));
  const loaded = await Promise.allSettled(entries.map(([, load]) => load()));
  loaded.forEach((res, i) => {
    const path = entries[i][0];
    if (res.status === "rejected") return console.error(`[boot] ${label} ${path} failed to load`, res.reason);
    if (typeof res.value.init !== "function") return;
    try {
      res.value.init(app);
    } catch (e) {
      console.error(`[boot] ${label} ${path} init failed`, e);
    }
  });
}

function bootWebGL() {
  const load = Object.values(webglEntry)[0];
  const fail = (e) => {
    console.error("[boot] webgl failed", e);
    app.state.webglFailed = true;
    app.emit("webgl:error", e);
  };
  if (!load) {
    // no engine (yet): behave as if compiled so the page stays usable
    app.state.webglProgress = 1;
    app.state.compiled = true;
    app.emit("webgl:progress", 1);
    app.emit("webgl:compiled");
    return;
  }
  load()
    .then((m) => m.init(app))
    .catch(fail);
}

history.scrollRestoration = "manual";
scrollTo(0, 0);
trackPointer();
trackResize();

await initAll(coreModules, "core");
bootWebGL();

await document.fonts.ready;
app.state.fontsReady = true;
document.documentElement.classList.add("fonts-ready");
await initAll(sectionModules, "section");
app.emit("fonts:ready");
app.ScrollTrigger.refresh();
