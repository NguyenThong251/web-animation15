// Shared SplitText line reveal (the reference's `revealLines` helper):
// split into masked lines, then rise each line out of its mask with a stagger whose total
// length grows with the line count (0.075 s per line). No-op under reduced motion.
//
//   import { revealLines } from "../core/reveal.js";
//   const r = revealLines(el, { start: "top 90%", yPercent: 110, duration: 0.9, ease: "power3.out" });
//   r.revert();
import { app } from "./app.js";

const noop = { split: null, revert() {} };

export function revealLines(
  el,
  { trigger = el, start = "top bottom", yPercent = 100, duration = 0.8, ease = "power2.out", once = true } = {},
) {
  if (!el || app.mq.rm.matches) return noop;
  const { gsap, SplitText } = app;

  const split = SplitText.create(el, {
    type: "lines",
    mask: "lines", // each line wrapped in a .line-mask (overflow: clip) — see 00-base.css
    linesClass: "line",
    autoSplit: true, // re-split on resize / font swap; the returned timeline is rebuilt and kept in sync
    onSplit: (self) =>
      gsap
        .timeline({
          scrollTrigger: {
            trigger,
            start,
            end: "bottom top",
            toggleActions: once ? "play none none none" : "play reverse play reverse",
          },
        })
        .from(self.lines, { yPercent, duration, ease, stagger: { amount: 0.075 * self.lines.length } }),
  });

  return {
    split,
    revert() {
      split.revert();
    },
  };
}

// Run `fn` once the WebGL scenes are compiled (or WebGL failed / is absent) — section reveals
// must not fire underneath the loader.
export function whenCompiled(fn) {
  if (app.state.compiled || app.state.webglFailed) {
    fn();
    return () => {};
  }
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    offA();
    offB();
    fn();
  };
  const offA = app.on("webgl:compiled", run);
  const offB = app.on("webgl:error", run);
  return () => {
    done = true;
    offA();
    offB();
  };
}
