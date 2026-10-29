// Footer: reports how far it has scrolled into view so the WebGL image (and the download pill) can
// move up with it — footerTextureOffset = progress × footerHeight / innerHeight — and fills the
// "Nguồn ảnh & giấy phép" dialog from src/data/credits.json.
import credits from "../data/credits.json";

// Vietnamese captions for each archive image (the Commons titles stay as the source reference)
const CAPTIONS = {
  "images/khue-van-cac.webp": "Khuê Văn Các, ảnh dọc",
  "images/khue-van-cac-wide.webp": "Khuê Văn Các, ảnh ngang",
  "images/khue-van-cac-wall.webp": "Khuê Văn Các, một góc nhìn khác",
  "images/tu-dien-1651-dep-long.webp": "Từ điển Việt – Bồ – La (1651), mục “đẹp lòng”",
  "images/tu-dien-1651-bao-gio.webp": "Từ điển Việt – Bồ – La (1651), một đoạn trích khác",
  "images/gieng-thien-quang.webp": "Sân thứ nhất của Văn Miếu",
  "images/cong-van-mieu.webp": "Một cổng của Văn Miếu",
  "images/gia-dinh-bao-1866.webp": "Gia Định báo",
  "images/kim-van-kieu-tan-truyen.webp": "Kim Vân Kiều tân truyện, bản in khắc gỗ",
  "images/bia-tien-si-35.webp": "Bia tiến sĩ số 35 (bản sao) tại Bảo tàng Lịch sử Việt Nam – TP. Hồ Chí Minh",
  "images/truyen-kieu-trang.webp": "Một trang Truyện Kiều chữ Nôm",
  "images/doan-truong-tan-thanh.webp": "Trang nhan đề Đoạn trường tân thanh",
};
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
// Commons author fields sometimes carry an interwiki prefix ("vi:…") or a trailing full stop
const cleanAuthor = (a) => String(a || "").replace(/^[a-z]{2,3}:/i, "").replace(/\.\s*$/, "").trim();

function fillCredits(list) {
  if (!list || list.dataset.filled) return;
  list.dataset.filled = "true";
  for (const c of credits) {
    const li = el("li", "credits__item");
    const thumb = el("img", "credits__thumb");
    thumb.src = c.file;
    thumb.alt = "";
    thumb.loading = "lazy";
    thumb.decoding = "async";
    const text = el("div", "credits__text");
    text.append(
      el("p", "t-body credits__name", CAPTIONS[c.file] || c.title),
      el("p", "t-small credits__meta", `Tác giả: ${cleanAuthor(c.author)} · Giấy phép: ${LICENCE_VI[c.license] || c.license}`),
    );
    const links = el("p", "t-small credits__links");
    const a = el("a", null, "Trang nguồn trên Wikimedia Commons");
    a.href = c.source;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.title = c.title;
    links.append(a);
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
