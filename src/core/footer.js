// Footer: reports how far it has scrolled into view so the WebGL image (and the download pill) can
// move up with it — footerTextureOffset = progress × footerHeight / innerHeight — and fills the
// "Nguồn ảnh & giấy phép" dialog from src/data/credits.json.
import credits from "../data/credits.json";

// Each entry carries its own Vietnamese caption, credit line and provenance; the Commons file page
// stays the reference for every image. Thumbnails are 112 px crops (images/thumbs/) so opening the
// dialog never decodes the full-size scans.
const LICENCE_VI = {
  CC0: "CC0 1.0 — hiến tặng vào phạm vi công cộng",
  "Public domain": "Phạm vi công cộng",
};

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const extLink = (text, href, title) => {
  const a = el("a", null, text);
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  if (title) a.title = title;
  a.append(el("span", "sr-only", " (mở trong thẻ mới)"));
  return a;
};

function fillCredits(list) {
  if (!list || list.dataset.filled) return;
  list.dataset.filled = "true";
  for (const c of credits) {
    const li = el("li", "credits__item");
    const thumb = el("img", "credits__thumb");
    thumb.src = c.thumb || c.file;
    thumb.alt = "";
    thumb.width = 112;
    thumb.height = 112;
    thumb.loading = "lazy";
    thumb.decoding = "async";
    const licence = LICENCE_VI[c.license] || c.license;
    const text = el("div", "credits__text");
    text.append(
      el("p", "t-body credits__name", c.caption || c.title),
      el("p", "t-small credits__meta", `${c.credit} · Giấy phép: ${licence}${c.licenseNote ? ` (${c.licenseNote})` : ""}`),
    );
    if (c.origin) text.append(el("p", "t-small credits__meta", c.origin));
    const links = el("p", "t-small credits__links");
    links.append(extLink("Trang nguồn trên Wikimedia Commons", c.source, c.title));
    if (c.via?.href) links.append(extLink(c.via.label, c.via.href));
    text.append(links);
    li.append(thumb, text);
    list.append(li);
  }
}

export function init(app) {
  const footer = document.querySelector("[data-footer]");
  if (!footer || footer.dataset.ready) return;
  footer.dataset.ready = "true";

  const { ScrollTrigger } = app;

  // ---------------------------------------------------------------- footer → WebGL coupling
  let progress = 0;
  let height = footer.offsetHeight;
  const write = () => {
    app.state.footerTextureOffset = (progress * height) / Math.max(1, innerHeight);
  };
  app.state.footerTextureOffset = 0;
  ScrollTrigger.create({
    trigger: footer,
    start: "top bottom",
    end: "bottom bottom",
    onUpdate: (self) => {
      progress = self.progress;
      write();
    },
    onRefresh: (self) => {
      height = footer.offsetHeight;
      progress = self.progress;
      write();
    },
  });
  new ResizeObserver(() => {
    height = footer.offsetHeight;
    write();
  }).observe(footer);

  // ---------------------------------------------------------------- credits dialog
  const dialog = footer.querySelector("[data-credits]");
  const openBtn = footer.querySelector("[data-credits-open]");
  const closeBtn = dialog?.querySelector("[data-credits-close]");
  if (!dialog || !openBtn) return;

  let lenisWasRunning = false;
  openBtn.addEventListener("click", () => {
    fillCredits(dialog.querySelector("[data-credits-list]"));
    lenisWasRunning = !!app.lenis && !app.lenis.isStopped;
    app.lenis?.stop();
    dialog.showModal();
    dialog.classList.add("is-open");
    closeBtn?.focus();
  });
  closeBtn?.addEventListener("click", () => dialog.close());
  // a click on the ::backdrop lands on the <dialog> element itself
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => {
    dialog.classList.remove("is-open");
    if (lenisWasRunning) app.lenis?.start();
    openBtn.focus({ preventScroll: true });
  });
}
