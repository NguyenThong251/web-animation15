// WebGL entry: init(app) mounts the engine in #webgl. Any failure — no WebGL2, a shader that does
// not compile, a model builder that throws — tears the engine down and emits 'webgl:error' so the
// shell can show its static fallback; the page itself keeps working.
import * as models from "./models/index.js";
import { Engine } from "./engine.js";

let engine = null;

export function init(app) {
  if (engine) return engine;
  const container = document.getElementById("webgl");

  const fail = (err) => {
    console.error("[webgl]", err);
    engine?.dispose();
    if (!app.state.webglFailed) {
      app.state.webglFailed = true;
      app.emit("webgl:error", err instanceof Error ? err : new Error(String(err)));
    }
  };

  if (!container) {
    fail(new Error("#webgl container missing"));
    return null;
  }

  try {
    engine = new Engine(app, container, models);
    engine.start().catch(fail);
  } catch (err) {
    fail(err);
  }
  if (import.meta.env.DEV) window.__kvEngine = engine;
  return engine;
}
