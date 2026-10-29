// Fixed header + QuickMenu + scroll-spy.
//  * the header slides in 2.5 s after 'reveal:start' (CSS transitions on .is-active; the overflow mask
//    is only kept while something is moving so the open panel can hang below the bar)
//  * QuickMenu: gradient-ring trigger, rolling section label, clip-path panel (usePanelMotion numbers)
//  * click → Lenis scrolls 3 s power3.inOut to the anchor; scroll-spy writes app.state.activeNav

const NAV = [
  { id: "nen-mong", label: "Nền móng" },
  { id: "khao-cuu", label: "Khảo cứu" },
  { id: "kieu-chu", label: "Kiểu chữ" },
  { id: "bo-ky-tu", label: "Bộ ký tự" },
  { id: "tai-ve", label: "Tải về" },
];
const ANCHOR_PREFIX = "nav-anchor-";
const SPY_LOCK_MS = 3000;
// "Tải về" lands where the download pill is fully open: the pill width is clamp01((p − .42)/.5) of the
// closing scene, whose progress runs over the first (height − 1 screen) of the hands segment → p ≈ 0.935
const DOWNLOAD_LANDING = 0.935;

const pad = (n) => String(n).padStart(2, "0");
const indexOf = (id) => NAV.findIndex((n) => n.id === id);

export function init(app) {
  const header = document.querySelector("[data-header]");
  if (!header || header.dataset.ready) return;
  header.dataset.ready = "true";

  const { gsap, ScrollTrigger } = app;
  const rm = () => app.mq.rm.matches;
  const headerHeight = () => header.offsetHeight || 0;

  // ------------------------------------------------------------------ reveal
  let revealTimer = 0;
  const activate = () => {
    if (header.classList.contains("is-active")) return;
    header.classList.add("is-active", "is-masked");
    // the brand wipe (1 s + 300 ms delay) is the last transition to finish
    setTimeout(() => header.classList.remove("is-masked"), rm() ? 50 : 1400);
  };
  const scheduleReveal = () => {
    if (revealTimer) return;
    revealTimer = setTimeout(activate, 2500);
  };
  app.on("reveal:start", scheduleReveal);
  if (app.state.revealing || app.state.revealed) scheduleReveal();

  // ------------------------------------------------------------------ quick menu
  const menu = header.querySelector("[data-quick-menu]");
  const trigger = menu.querySelector("[data-qm-trigger]");
  const label = menu.querySelector("[data-qm-label]");
  const indexEl = menu.querySelector("[data-qm-index]");
  const roll = menu.querySelector("[data-qm-roll]");
  const panel = menu.querySelector("[data-qm-panel]");
  const headTitle = menu.querySelector("[data-qm-head-title]");
  const closeBtn = menu.querySelector("[data-qm-close]");
  const motionItems = [...panel.querySelectorAll("[data-motion-item]")];
  const links = [...panel.querySelectorAll("[data-qm-item]")];

  let open = false;
  let panelTl = null;
  gsap.set(panel, { clipPath: "inset(0% 0% 100% 0%)", visibility: "hidden" });
  gsap.set(motionItems, { opacity: 0, y: -16 });

  const visibleItems = () => motionItems.filter((el) => el.offsetParent !== null);

  function openPanel({ focusCurrent = false } = {}) {
    if (open) return;
    open = true;
    menu.classList.add("is-open");
    trigger.setAttribute("aria-expanded", "true");
    trigger.setAttribute("aria-label", "Đóng menu điều hướng nhanh");
    panel.removeAttribute("inert");
    panel.setAttribute("aria-hidden", "false");
    links.forEach((a) => a.setAttribute("tabindex", "0"));
    closeBtn.setAttribute("tabindex", "0");

    panelTl?.kill();
    // on md+ the panel covers the trigger, so its label fades out underneath
    const hideLabel = app.mq.md.matches;
    if (rm()) {
      gsap.set(panel, { visibility: "visible", clipPath: "inset(0% 0% 0% 0%)" });
      gsap.set(motionItems, { opacity: 1, y: 0 });
      if (hideLabel) gsap.set(label, { opacity: 0 });
    } else {
      panelTl = gsap.timeline().timeScale(1.2);
      panelTl
        .set(panel, { visibility: "visible" }, 0)
        .to(panel, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.7, ease: "expo.out" }, 0)
        .to(visibleItems(), { opacity: 1, y: 0, duration: 0.5, ease: "power3.out", stagger: 0.055 }, 0.12);
      if (hideLabel) panelTl.to(label, { opacity: 0, duration: 0.1, ease: "power2.out" }, 0);
    }

    if (focusCurrent) {
      const current = links[Math.max(0, indexOf(app.state.activeNav))];
      requestAnimationFrame(() => current?.focus({ preventScroll: true }));
    }
  }

  function closePanel({ focusTrigger = false } = {}) {
    if (!open) return;
    open = false;
    menu.classList.remove("is-open");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-label", "Mở menu điều hướng nhanh");
    panel.setAttribute("aria-hidden", "true");
    panel.setAttribute("inert", "");
    links.forEach((a) => a.setAttribute("tabindex", "-1"));
    closeBtn.setAttribute("tabindex", "-1");

    panelTl?.kill();
    if (rm()) {
      gsap.set(motionItems, { opacity: 0, y: -16 });
      gsap.set(panel, { clipPath: "inset(0% 0% 100% 0%)", visibility: "hidden" });
      gsap.set(label, { opacity: 1 });
    } else {
      panelTl = gsap.timeline().timeScale(1.2);
      panelTl
        .to(motionItems, { opacity: 0, y: -16, duration: 0.3, ease: "power2.out", stagger: { amount: 0.1, from: "end" } }, 0)
        .to(panel, { clipPath: "inset(0% 0% 100% 0%)", duration: 0.5, ease: "expo.out" }, 0.08)
        .set(panel, { visibility: "hidden" })
        .to(label, { opacity: 1, duration: 0.35 }, 0.2);
    }
    if (focusTrigger) trigger.focus({ preventScroll: true });
  }

  trigger.addEventListener("click", (e) => {
    if (open) closePanel();
    else openPanel({ focusCurrent: e.detail === 0 }); // detail 0 → activated from the keyboard
  });
  trigger.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) openPanel({ focusCurrent: true });
      else links[Math.max(0, indexOf(app.state.activeNav))]?.focus({ preventScroll: true });
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      closePanel({ focusTrigger: true });
    }
  });
  closeBtn.addEventListener("click", () => closePanel({ focusTrigger: true }));

  panel.addEventListener("keydown", (e) => {
    const i = links.indexOf(document.activeElement);
    const focusAt = (n) => links[(n + links.length) % links.length].focus({ preventScroll: true });
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        focusAt(i < 0 ? 0 : i + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        focusAt(i < 0 ? links.length - 1 : i - 1);
        break;
      case "Home":
        e.preventDefault();
        focusAt(0);
        break;
      case "End":
        e.preventDefault();
        focusAt(links.length - 1);
        break;
      case "Escape":
        e.preventDefault();
        closePanel({ focusTrigger: true });
        break;
    }
  });
  // focus leaving the menu (Tab past the last item, click elsewhere) closes it
  menu.addEventListener("focusout", (e) => {
    if (open && e.relatedTarget && !menu.contains(e.relatedTarget)) closePanel();
  });
  document.addEventListener("pointerdown", (e) => {
    if (open && !menu.contains(e.target)) closePanel();
  });

  // ------------------------------------------------------------------ label roll
  const rollItems = [...roll.children];
  let front = 0;
  const setRollText = (el, text) => {
    const inner = el.querySelector("[data-label]");
    inner.dataset.label = text;
    inner.textContent = text;
  };
  gsap.set(rollItems[1], { yPercent: 100 });

  function rollTo(text, dir) {
    const out = rollItems[front];
    const inn = rollItems[1 - front];
    setRollText(inn, text);
    if (rm()) {
      gsap.set(out, { yPercent: -100 * dir, overwrite: true });
      gsap.set(inn, { yPercent: 0, overwrite: true });
    } else {
      gsap.fromTo(out, { yPercent: 0 }, { yPercent: -100 * dir, duration: 0.2, ease: "power2.out", overwrite: true });
      gsap.fromTo(inn, { yPercent: 100 * dir }, { yPercent: 0, duration: 0.2, ease: "power2.out", overwrite: true });
    }
    out.setAttribute("aria-hidden", "true");
    inn.removeAttribute("aria-hidden");
    front = 1 - front;
  }

  // ------------------------------------------------------------------ scroll-spy
  let anchors = [];
  let spyLockedUntil = 0;

  function setActive(id) {
    if (!id || id === app.state.activeNav) return;
    const prev = indexOf(app.state.activeNav);
    const next = indexOf(id);
    const item = NAV[next];
    if (!item) return;
    if (prev >= 0) rollTo(item.label, next > prev ? 1 : -1);
    else setRollText(rollItems[front], item.label);
    indexEl.textContent = pad(next + 1);
    headTitle.textContent = item.label;
    links.forEach((a) => {
      const on = a.dataset.qmItem === id;
      a.classList.toggle("is-current", on);
      if (on) a.setAttribute("aria-current", "location");
      else a.removeAttribute("aria-current");
    });
    app.state.activeNav = id;
    app.emit("nav:change", id);
  }

  function measure() {
    anchors = [...document.querySelectorAll(`[id^="${ANCHOR_PREFIX}"]`)]
      .map((el) => ({ id: el.id.slice(ANCHOR_PREFIX.length), el, top: el.getBoundingClientRect().top + scrollY }))
      .filter((a) => indexOf(a.id) >= 0)
      .sort((a, b) => a.top - b.top);
    spy();
  }

  function spy() {
    if (performance.now() < spyLockedUntil || !anchors.length) return;
    const y = (app.lenis ? app.lenis.scroll : scrollY) + headerHeight() + 1;
    let active = anchors[0].id;
    for (const a of anchors) if (a.top <= y) active = a.id;
    setActive(active);
  }

  let measureQueued = false;
  const queueMeasure = () => {
    if (measureQueued) return;
    measureQueued = true;
    requestAnimationFrame(() => {
      measureQueued = false;
      measure();
    });
  };

  app.on("scroll", spy);
  app.on("resize", queueMeasure);
  app.on("fonts:ready", queueMeasure);
  ScrollTrigger.addEventListener("refresh", queueMeasure);
  new ResizeObserver(queueMeasure).observe(document.body);
  measure();

  // ------------------------------------------------------------------ navigation
  function scrollToNav(id) {
    const target = document.getElementById(ANCHOR_PREFIX + id);
    if (!target) return;
    const top = target.getBoundingClientRect().top + scrollY;
    const y =
      id === "tai-ve"
        ? top + Math.max(0, target.offsetHeight - innerHeight) * DOWNLOAD_LANDING
        : Math.max(0, top - headerHeight());

    spyLockedUntil = performance.now() + SPY_LOCK_MS;
    setActive(id);

    const lenis = app.lenis;
    if (lenis) {
      lenis.resize();
      lenis.scrollTo(y, {
        force: true,
        duration: 3,
        easing: gsap.parseEase("power3.inOut"),
        onComplete: () => {
          spyLockedUntil = 0;
          spy();
        },
      });
    } else {
      window.scrollTo(0, y);
    }

    // move the reading position for assistive tech without a native jump
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  }

  links.forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation(); // keep Lenis' own anchor handler from re-targeting the scroll
      closePanel();
      scrollToNav(a.dataset.qmItem);
    }),
  );
}
