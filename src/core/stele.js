// Stele paragraphs: eyebrow, heading and body each rise line by line out of their masks as soon as
// their top enters the viewport. md+ only (phones get the text static), skipped under reduced motion,
// and held back until the WebGL scenes are compiled.
import { revealLines, whenCompiled } from "./reveal.js";

export function init(app) {
  const blocks = [...document.querySelectorAll("[data-paragraph]")];
  if (!blocks.length || blocks[0].dataset.ready) return;
  blocks.forEach((b) => (b.dataset.ready = "true"));

  const { gsap, ScrollTrigger } = app;
  const targets = blocks.flatMap((b) => [
    b.querySelector("[data-motion-eyebrow]"),
    b.querySelector("[data-motion-heading]"),
    b.querySelector("[data-motion-body]"),
  ]).filter(Boolean);

  whenCompiled(() =>
    document.fonts.ready.then(() => {
      const mm = gsap.matchMedia();
      mm.add("(min-width: 768px) and (prefers-reduced-motion: no-preference)", () => {
        const reveals = targets.map((el) =>
          revealLines(el, { trigger: el, start: "top bottom", yPercent: 100, duration: 0.8, ease: "power2.out" }),
        );
        return () => reveals.forEach((r) => r.revert());
      });
      ScrollTrigger.refresh();
    }),
  );
}
