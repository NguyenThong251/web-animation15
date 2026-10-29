// Sticky text (Khảo cứu): masked line reveals on the sticky copy, scroll parallax on the four archive
// tiles (each tile and the image inside it drift at their own speed) and, with a fine pointer,
// a layered pan that pushes tiles and images away from the cursor by different amounts.
import { revealLines, whenCompiled } from "./reveal.js";

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function init(app) {
  const section = document.querySelector("[data-sticky-text]");
  if (!section || section.dataset.ready) return;
  section.dataset.ready = "true";

  const { gsap, ScrollTrigger } = app;
  const title = section.querySelector("[data-motion-title]");
  const text = section.querySelector("[data-motion-text]");
  const tiles = [...section.querySelectorAll("[data-motion-parallax]")].map((tile) => ({
    tile,
    pan: tile.querySelector("[data-motion-tile-pan]"),
    imgParallax: tile.querySelector("[data-motion-image-parallax]"),
    imgPan: tile.querySelector("[data-motion-image-pan]"),
  }));
  const moving = tiles.flatMap((t) => [t.tile, t.pan, t.imgParallax, t.imgPan]);

  const setup = () => {
    const mm = gsap.matchMedia();

    // (a conditions object only fires when at least one query matches → isSm keeps phones covered)
    mm.add(
      { isSm: "(max-width: 767px)", isMd: "(min-width: 768px)", isRm: "(prefers-reduced-motion: reduce)" },
      ({ conditions: { isMd, isRm } }) => {
        if (isRm) {
          gsap.set(moving, { clearProps: "transform" });
          return;
        }
        const reveals = [title, text].map((el) =>
          revealLines(el, { start: "top 95%", yPercent: 110, duration: 0.9, ease: "power3.out" }),
        );

        const scrub = { trigger: section, start: "top bottom", end: "bottom top", scrub: true, invalidateOnRefresh: true };
        for (const t of tiles) {
          // b = factor × ½ viewport: the tile travels from +b to −b while the section crosses the screen
          const factor = parseFloat(isMd ? t.tile.dataset.motionParallax : t.tile.dataset.motionParallaxMobile) || 0;
          const b = () => factor * innerHeight * 0.5;
          gsap.fromTo(t.tile, { y: () => b() }, { y: () => -b(), ease: "none", scrollTrigger: { ...scrub } });

          // inner image: capped by the bleed of its oversized wrapper (24px each side)
          const max = parseFloat(t.imgParallax.dataset.motionImageParallax) || 0;
          const d = () => Math.max(0, Math.min((t.imgParallax.offsetHeight - t.tile.clientHeight) / 2, max));
          gsap.fromTo(t.imgParallax, { y: () => d() }, { y: () => -d(), ease: "none", scrollTrigger: { ...scrub } });
        }
        return () => reveals.forEach((r) => r.revert());
      },
    );

    // pointer pan — tiles and images move opposite to the cursor, by different amounts
    mm.add("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)", () => {
      const pans = tiles.flatMap((t) =>
        [
          [t.pan, parseFloat(t.pan.dataset.motionTilePan) || 0],
          [t.imgPan, parseFloat(t.imgPan.dataset.motionImagePan) || 0],
        ].map(([el, shift]) => ({
          shift,
          qx: gsap.quickTo(el, "x", { duration: 0.8, ease: "power3.out" }),
          qy: gsap.quickTo(el, "y", { duration: 0.8, ease: "power3.out" }),
        })),
      );
      const onMove = (e) => {
        if (!ScrollTrigger.isInViewport(section)) return;
        const nx = clamp((e.clientX / innerWidth) * 2 - 1, -1, 1);
        const ny = clamp((e.clientY / innerHeight) * 2 - 1, -1, 1);
        for (const p of pans) {
          p.qx(-nx * p.shift);
          p.qy(-ny * p.shift);
        }
      };
      const onLeave = () => {
        for (const p of pans) {
          p.qx(0);
          p.qy(0);
        }
      };
      addEventListener("pointermove", onMove, { passive: true });
      document.documentElement.addEventListener("pointerleave", onLeave);
      return () => {
        removeEventListener("pointermove", onMove);
        document.documentElement.removeEventListener("pointerleave", onLeave);
      };
    });

    ScrollTrigger.refresh();
  };

  // reveals must not fire under the loader, and SplitText needs the final font metrics
  whenCompiled(() => document.fonts.ready.then(setup));
}
