// "Cuộn xuống" sticker: trails the cursor from the viewport centre (large screens with a fine pointer).
// Shown only near the top of the page (≤ 100px), once the pointer has moved, and from 3 s after the
// reveal starts; the sticker wipes in/out with its three coloured layers (CSS).

export function init(app) {
  const root = document.querySelector("[data-scroll-follower]");
  if (!root || root.dataset.ready) return;
  root.dataset.ready = "true";

  const { gsap } = app;
  const sticker = root.querySelector("[data-sticker]");

  let revealAt = Infinity;
  const markReveal = () => {
    if (revealAt === Infinity) revealAt = performance.now();
  };
  app.on("reveal:start", markReveal);
  if (app.state.revealing || app.state.revealed) markReveal();

  gsap.set(root, { rotation: 45 });

  const mm = gsap.matchMedia();
  mm.add("(min-width: 1024px) and (hover: hover) and (pointer: fine)", () => {
    const qx = gsap.quickTo(root, "x", { duration: 0.5, ease: "power3.out" });
    const qy = gsap.quickTo(root, "y", { duration: 0.5, ease: "power3.out" });
    let active = false;

    const tick = () => {
      const p = app.pointer;
      // pointer nx/ny are −1..1 with y up → offset from the viewport centre in px
      qx(p.nx * innerWidth * 0.5);
      qy(-p.ny * innerHeight * 0.5);
      const scroll = app.lenis ? app.lenis.scroll : scrollY;
      const on = scroll <= 100 && p.moved && performance.now() - revealAt >= 3000;
      if (on !== active) {
        active = on;
        sticker.classList.toggle("is-active", on);
      }
    };
    gsap.ticker.add(tick);
    return () => {
      gsap.ticker.remove(tick);
      sticker.classList.remove("is-active");
    };
  });
}
