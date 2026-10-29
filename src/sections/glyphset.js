// Bộ ký tự (glyphset): glyph groups from src/data/glyphs.json + a Hán group, weight picker
// (custom listbox ≥1024 / native select below), the metric inspector (≥1024) and the glyph
// sheet with swipe navigation (<1024). Motion follows the reference: SplitText line reveals on
// every [data-motion-text] and a 0.4 s staggered pop-up of the title letters, gated on WebGL compile.
import glyphData from "../data/glyphs.json";

// shell owns src/core/reveal.js; glob so a missing file never breaks this module
const revealModule = Object.values(import.meta.glob("../core/reveal.js"))[0];

/* ------------------------------------------------------------------ data */

const METRICS = glyphData.metrics; // font units (1000/em): ascender 704, capHeight 650, xHeight 400, baseline 0, descender −285

const GROUP_ORDER = [
  "Bảng chữ cái",
  "Nguyên âm mang dấu thanh",
  "Chữ hoa",
  "Chữ thường",
  "Chữ số",
  "Dấu câu",
  "Ký hiệu & tiền tệ",
  "Mũi tên & toán",
];

// Hán characters carved on the Văn Miếu steles and in the names around them, with their Hán-Việt reading.
const HAN_READINGS = {
  文: "văn", 廟: "miếu", 國: "quốc", 子: "tử", 監: "giám", 奎: "khuê", 閣: "các", 進: "tiến",
  士: "sĩ", 題: "đề", 名: "danh", 碑: "bi", 記: "ký", 賢: "hiền", 元: "nguyên", 氣: "khí",
  字: "tự", 漢: "hán", 喃: "nam", 越: "việt", 南: "nam", 金: "kim", 雲: "vân", 翹: "kiều",
};
const HAN_NOTES = { 字: "; nghĩa là “chữ”", 喃: "; trong “chữ Nôm” đọc là “nôm”" };

const GROUPS = [
  ...GROUP_ORDER.map((name) => {
    const cat = glyphData.categories.find((c) => c.name === name);
    return { name, han: false, glyphs: cat ? cat.glyphs : [] };
  }),
  { name: "Chữ Hán trên bia", han: true, glyphs: Object.keys(HAN_READINGS) },
];

// EB Garamond Italic (variable) has no superior figures ¹ ² ³ — like the reference, each style
// only lists the glyphs it really has (checked by comparing serif vs monospace fallback widths).
const ITALIC_MISSING = new Set(["¹", "²", "³"]);

// Height (font units) of the tallest stacked Vietnamese mark — Ẵ (breve + tilde) in every style.
// Measured once by rasterising ẰẮẲẴẶẦẤẨẪẬỀẾỂỄỆỒỐỔỖỘ at 1000 px on a canvas and scanning for the top
// ink row (canvas measureText bounding boxes are quantised to ~16 units, too coarse for a guide).
const STACK_HEIGHT = {
  "400-normal": 966,
  "500-normal": 977,
  "600-normal": 987,
  "700-normal": 998,
  "800-normal": 1005,
  "400-italic": 974,
  "700-italic": 1000,
};

// Inspector square (reference: 1460 units, top guide at the top edge, descender at the bottom edge).
// Our top guide is the stacked-mark height of the heaviest style, so the frame never rescales.
const VIEW = 1460;
const FRAME_TOP = Math.max(...Object.values(STACK_HEIGHT)); // 1005
const FRAME_BOTTOM = METRICS.descender; // −285
const UNIT = VIEW / (FRAME_TOP - FRAME_BOTTOM); // svg units per font unit (≈1.1318)
const FONT_SIZE = METRICS.unitsPerEm * UNIT; // ≈1131.8 → the glyph's em in svg units
const BASELINE_Y = FRAME_TOP * UNIT; // ≈1137.4
const MAX_ADVANCE = VIEW * 0.96; // glyphs wider than this are scaled down to fit the square
const topPct = (v) => ((FRAME_TOP - v) / (FRAME_TOP - FRAME_BOTTOM)) * 100;

const METRIC_ROWS = [
  { key: "stack", label: "Vùng dấu", accent: true },
  { key: "ascender", label: "Đường đỉnh" },
  { key: "capHeight", label: "Chữ hoa" },
  { key: "xHeight", label: "Chiều cao x" },
  { key: "baseline", label: "Đường chân" },
  { key: "descender", label: "Đường đáy" },
];
const metricValue = (key, weightId) => (key === "stack" ? STACK_HEIGHT[weightId] : METRICS[key]);
const formatUnits = (v) => (v < 0 ? `−${Math.abs(v)}` : String(v));

/* ------------------------------------------------------------- naming */

const TONES = { "̀": "dấu huyền", "́": "dấu sắc", "̉": "dấu hỏi", "̃": "dấu ngã", "̣": "dấu nặng" };
// Vietnamese vowel modifiers and the vowels they may sit on
const MODS = { "̆": ["trăng", "a"], "̂": ["mũ", "aeo"], "̛": ["móc", "ou"] };

// "ặ" → "a trăng, dấu nặng"; "Ơ" → "O móc"; non-Vietnamese letters → null
function vietnameseName(ch) {
  if (ch === "đ") return "đê";
  if (ch === "Đ") return "Đê";
  const nfd = ch.normalize("NFD");
  const base = nfd[0];
  if (nfd.length < 2 || !"aeiouyAEIOUY".includes(base)) return null;
  let mod = "";
  let tone = "";
  for (const mark of nfd.slice(1)) {
    if (MODS[mark] && MODS[mark][1].includes(base.toLowerCase())) mod = MODS[mark][0];
    else if (TONES[mark]) tone = TONES[mark];
    else return null;
  }
  return [base + (mod ? ` ${mod}` : ""), tone].filter(Boolean).join(", ");
}

function glyphInfo(ch, han) {
  const code = `U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`;
  const desc = han ? `âm Hán Việt “${HAN_READINGS[ch]}”${HAN_NOTES[ch] || ""}` : vietnameseName(ch);
  return { code, desc };
}

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const svgNS = "http://www.w3.org/2000/svg";

// cell edges of a grid of n cells in `cols` columns (last row may be short), in cell units
function gridPath(n, cols) {
  const rows = Math.ceil(n / cols);
  const last = n - (rows - 1) * cols;
  let d = "";
  for (let r = 0; r <= rows; r++) d += `M0 ${r}H${r === rows || rows === 1 ? last : cols}`;
  for (let c = 0; c <= cols; c++) {
    const h = c <= last ? rows : rows - 1;
    if (h > 0) d += `M${c} 0V${h}`;
  }
  return d;
}

/* ---------------------------------------------------------- module */

let initialised = false;

export function init(app) {
  const section = document.querySelector("[data-glyphset]");
  if (!section || initialised) return;
  initialised = true;

  const { gsap } = app;
  const rm = () => app.mq.rm.matches;
  const groupsEl = section.querySelector("[data-glyph-groups]");
  const selectEl = section.querySelector("[data-weight-select]");
  const ddRoot = section.querySelector("[data-weight-dropdown]");
  const inspector = section.querySelector("#target-glyph");
  const inspectorText = inspector.querySelector("[data-inspector-glyph]");

  const WEIGHTS = [...selectEl.options].map((o) => ({
    id: o.value,
    label: o.textContent.trim(),
    weight: Number(o.dataset.weight),
    style: o.dataset.style,
  }));
  let weight = WEIGHTS.find((w) => w.id === selectEl.value) || WEIGHTS[0];
  const hanWeight = (w) => (w.weight >= 600 ? 700 : 400); // the Hán subset ships 400 + 700 only

  // glyph advance (font units) for the fit-to-square check
  const measureCtx = document.createElement("canvas").getContext("2d");
  function advance(ch, han, w) {
    measureCtx.font = han
      ? `normal ${hanWeight(w)} 1000px "Noto Serif TC Han"`
      : `${w.style} ${w.weight} 1000px "EB Garamond"`;
    return measureCtx.measureText(ch).width;
  }
  const fitFontSize = (ch, han, w) => FONT_SIZE * Math.min(1, MAX_ADVANCE / Math.max(1, advance(ch, han, w) * UNIT));

  function styleGlyphText(text, ch, han, w) {
    text.textContent = ch;
    text.style.fontFamily = han ? "var(--font-han)" : "var(--font-serif)";
    text.style.fontWeight = String(han ? hanWeight(w) : w.weight);
    text.style.fontStyle = han ? "normal" : w.style;
    const fs = fitFontSize(ch, han, w);
    text.setAttribute("font-size", fs.toFixed(1));
    return fs < FONT_SIZE - 0.5; // true → scaled down to fit
  }

  /* ---------- groups + grids ---------- */

  const glyphsFor = (g, w) => (w.style === "italic" && !g.han ? g.glyphs.filter((c) => !ITALIC_MISSING.has(c)) : g.glyphs);

  const views = GROUPS.map((g, gi) => {
    const sec = document.createElement("section");
    sec.className = "gs-group";
    sec.setAttribute("data-motion-glyph-group", "");
    sec.setAttribute("aria-labelledby", `gs-group-${gi}`);
    sec.innerHTML = `<div class="gs-group__head"><h3 class="gs-group__label t-small trim" id="gs-group-${gi}" data-motion-text>${esc(g.name)}</h3></div>
      <div class="gs-grid${g.han ? " is-han" : ""}" role="group" aria-labelledby="gs-group-${gi}" data-group="${gi}">
        <svg class="gs-grid__lines" aria-hidden="true" focusable="false" preserveAspectRatio="none"><path /></svg>
      </div>`;
    groupsEl.append(sec);
    const grid = sec.querySelector(".gs-grid");
    return { group: g, grid, svg: grid.querySelector("svg"), path: grid.querySelector("path"), cells: [], glyphs: [], roving: 0 };
  });

  let cols = 4;
  const ring = document.createElement("span");
  ring.className = "gs-cell__ring animated-gradient-border";
  ring.setAttribute("aria-hidden", "true");
  ring.append(document.createElement("span"));

  let sel = { gi: 1, i: Math.max(0, GROUPS[1].glyphs.indexOf("Ẵ")) }; // open on the tallest stacked mark

  function cellLabel(ch, han) {
    const { desc } = glyphInfo(ch, han);
    return `Chọn ký tự ${ch}${desc ? ` — ${desc}` : ""}`;
  }

  function renderCells(v) {
    v.cells.forEach((c) => c.remove());
    v.glyphs = glyphsFor(v.group, weight);
    const lang = v.group.han ? ' lang="zh-Hant"' : "";
    const html = v.glyphs
      .map(
        (ch, i) =>
          `<button type="button" class="gs-cell" data-index="${i}" data-motion-glyph aria-pressed="false" tabindex="-1" aria-label="${esc(cellLabel(ch, v.group.han))}"><span class="gs-cell__glyph t-glyph trim"${lang}>${esc(ch)}</span><span class="gs-cell__hover" aria-hidden="true"></span></button>`,
      )
      .join("");
    v.grid.insertAdjacentHTML("beforeend", html);
    v.cells = [...v.grid.querySelectorAll(".gs-cell")];
    v.roving = Math.min(v.roving, v.cells.length - 1);
    drawLines(v);
  }

  function drawLines(v) {
    const n = v.glyphs.length;
    if (!n) return;
    v.svg.setAttribute("viewBox", `0 0 ${cols} ${Math.ceil(n / cols)}`);
    v.path.setAttribute("d", gridPath(n, cols));
  }

  function setCols(width) {
    // reference: 8 columns from 64rem, otherwise one column per ~80 px
    const next = app.mq.lg.matches ? 8 : Math.max(1, Math.ceil(width / 80));
    if (next === cols) return;
    cols = next;
    groupsEl.style.setProperty("--cols", cols);
    views.forEach(drawLines);
  }

  function setRoving(v, i) {
    v.cells[v.roving]?.setAttribute("tabindex", "-1");
    v.roving = i;
    v.cells[i]?.setAttribute("tabindex", "0");
  }

  function applySelection() {
    views.forEach((v, gi) => {
      v.cells.forEach((c, i) => c.setAttribute("aria-pressed", String(gi === sel.gi && i === sel.i)));
      setRoving(v, gi === sel.gi ? sel.i : v.roving);
    });
    views[sel.gi].cells[sel.i]?.append(ring); // re-inserting restarts the ring fade-in
    updateInspector();
  }

  function select(gi, i) {
    if (!views[gi]?.cells[i]) return;
    sel = { gi, i };
    applySelection();
  }

  /* ---------- inspector ---------- */

  const metricEls = METRIC_ROWS.map((row) => ({ ...row, el: inspector.querySelector(`[data-metric="${row.key}"]`) }));
  const capChar = inspector.querySelector("[data-glyph-char]");
  const capDesc = inspector.querySelector("[data-glyph-desc]");
  const capCode = inspector.querySelector("[data-glyph-code]");
  const capSr = inspector.querySelector("[data-glyph-sr]");
  inspectorText.setAttribute("x", VIEW / 2);
  inspectorText.setAttribute("y", BASELINE_Y.toFixed(1));

  function layoutMetrics() {
    metricEls.forEach(({ key, el }) => {
      if (!el) return;
      const v = metricValue(key, weight.id);
      el.style.top = `${topPct(v)}%`;
      el.querySelector(".gs-metric__value").textContent = formatUnits(v);
    });
  }

  function describe(ch, han, scaled) {
    const { code, desc } = glyphInfo(ch, han);
    const text = `${desc ? ` — ${desc}` : ""}${scaled ? " · thu nhỏ cho vừa khung" : ""}`;
    return { code, desc, text };
  }

  function updateInspector() {
    const v = views[sel.gi];
    const ch = v.glyphs[sel.i];
    const han = v.group.han;
    const scaled = styleGlyphText(inspectorText, ch, han, weight);
    const d = describe(ch, han, scaled);
    capChar.textContent = ch;
    capChar.className = han ? "han" : "";
    capDesc.textContent = d.text;
    capCode.textContent = d.code;
    capSr.textContent = `Ký tự đang chọn: ${ch}${d.desc ? `, ${d.desc}` : ""}, ${d.code}`;
  }

  /* ---------- weight ---------- */

  const currentLabels = section.querySelectorAll("[data-weight-current]");
  const ddTrigger = ddRoot?.querySelector(".gs-dd__trigger");
  function setWeight(id) {
    const next = WEIGHTS.find((w) => w.id === id);
    if (!next) return;
    const prevStyle = weight.style;
    weight = next;
    selectEl.value = id;
    section.style.setProperty("--gs-wght", weight.weight);
    section.style.setProperty("--gs-ital", weight.style);
    section.style.setProperty("--gs-han-wght", hanWeight(weight));
    currentLabels.forEach((el) => {
      el.textContent = weight.label;
      if (el.dataset.label !== undefined) el.dataset.label = weight.label;
      el.style.fontWeight = weight.weight;
      el.style.fontStyle = weight.style;
    });
    // explicit name: the TextClip duplicate (::after content) would otherwise be read twice
    ddTrigger?.setAttribute("aria-label", `Chọn độ đậm: ${weight.label}`);
    dropdown?.sync();

    if (weight.style !== prevStyle) {
      // italic lists differ (no ¹²³): rebuild the cells, keep the selection on the same character
      const ch = views[sel.gi].glyphs[sel.i];
      const before = section.offsetHeight;
      views.forEach(renderCells);
      const idx = views[sel.gi].glyphs.indexOf(ch);
      sel = { gi: sel.gi, i: idx >= 0 ? idx : 0 };
      if (section.offsetHeight !== before) requestAnimationFrame(() => app.ScrollTrigger.refresh());
    }
    layoutMetrics();
    applySelection();
  }

  selectEl.addEventListener("change", () => setWeight(selectEl.value));

  /* ---------- desktop dropdown ---------- */

  const dropdown = ddRoot ? createDropdown(ddRoot) : null;

  function createDropdown(root) {
    const trigger = root.querySelector(".gs-dd__trigger");
    const panel = root.querySelector(".gs-dd__panel");
    const closeBtn = root.querySelector(".gs-dd__close");
    const label = trigger.querySelector(".gs-dd__row");
    const items = [...panel.querySelectorAll("[data-motion-item]")];
    const options = [...panel.querySelectorAll('[role="option"]')];
    options.forEach((o) => {
      const w = WEIGHTS.find((x) => x.id === o.dataset.value);
      if (w) Object.assign(o.style, { fontWeight: w.weight, fontStyle: w.style });
    });

    // usePanelMotion: clip-path wipe + staggered items, timeScale 1.2 (instant under reduced motion)
    gsap.set(panel, { clipPath: "inset(0% 0% 100% 0%)", visibility: "hidden" });
    gsap.set(items, { opacity: 0, y: -16 });
    let open = false;
    let tl = null;

    function play(build) {
      tl?.kill();
      tl = gsap.timeline();
      build(tl);
      tl.timeScale(1.2);
      if (rm()) tl.progress(1);
    }
    function show(focusIndex) {
      if (open) return;
      open = true;
      trigger.setAttribute("aria-expanded", "true");
      panel.removeAttribute("inert");
      panel.setAttribute("aria-hidden", "false");
      gsap.set(panel, { visibility: "visible" }); // now, so the option below can take focus
      play((t) =>
        t
          .to(label, { opacity: 0, duration: 0.1, ease: "power2.out" }, 0)
          .to(panel, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.7, ease: "expo.out" }, 0)
          .to(items, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out", stagger: 0.055 }, 0.12),
      );
      const i = focusIndex ?? WEIGHTS.findIndex((w) => w.id === weight.id);
      options[i]?.focus({ preventScroll: true });
      document.addEventListener("pointerdown", onOutside, true);
    }
    function hide(refocus = false) {
      if (!open) return;
      open = false;
      trigger.setAttribute("aria-expanded", "false");
      panel.setAttribute("inert", "");
      panel.setAttribute("aria-hidden", "true");
      play((t) =>
        t
          .to(items, { opacity: 0, y: -16, duration: 0.3, ease: "power2.out", stagger: { amount: 0.1, from: "end" } }, 0)
          .to(panel, { clipPath: "inset(0% 0% 100% 0%)", duration: 0.5, ease: "expo.out" }, 0.08)
          .set(panel, { visibility: "hidden" })
          .to(label, { opacity: 1, duration: 0.35 }, 0.2),
      );
      if (refocus) trigger.focus({ preventScroll: true });
      document.removeEventListener("pointerdown", onOutside, true);
    }
    function onOutside(e) {
      if (!root.contains(e.target)) hide(false);
    }

    trigger.addEventListener("click", () => (open ? hide(true) : show()));
    trigger.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        show();
      }
    });
    closeBtn.addEventListener("click", () => hide(true));
    options.forEach((o) =>
      o.addEventListener("click", () => {
        setWeight(o.dataset.value);
        hide(true);
      }),
    );
    panel.addEventListener("keydown", (e) => {
      const i = options.indexOf(document.activeElement);
      const go = (n) => {
        e.preventDefault();
        options[(n + options.length) % options.length].focus({ preventScroll: true });
      };
      if (e.key === "ArrowDown") go(i < 0 ? 0 : i + 1);
      else if (e.key === "ArrowUp") go(i < 0 ? options.length - 1 : i - 1);
      else if (e.key === "Home") go(0);
      else if (e.key === "End") go(options.length - 1);
      else if (e.key === "Escape") {
        e.preventDefault();
        hide(true);
      } else if (e.key === "Tab") hide(false);
    });
    root.addEventListener("focusout", (e) => {
      if (open && e.relatedTarget && !root.contains(e.relatedTarget)) hide(false);
    });

    return {
      sync() {
        options.forEach((o) => o.setAttribute("aria-selected", String(o.dataset.value === weight.id)));
      },
      close: () => hide(false),
    };
  }

  /* ---------- grid interaction ---------- */

  groupsEl.addEventListener("click", (e) => {
    const cell = e.target.closest(".gs-cell");
    if (!cell) return;
    const gi = Number(cell.parentElement.dataset.group);
    const i = Number(cell.dataset.index);
    select(gi, i);
    if (!app.mq.lg.matches) modal.open(cell);
  });

  // roving focus inside each grid: arrows move, Enter/Space select (native button)
  groupsEl.addEventListener("keydown", (e) => {
    const cell = e.target.closest(".gs-cell");
    if (!cell) return;
    const v = views[Number(cell.parentElement.dataset.group)];
    const i = Number(cell.dataset.index);
    const n = v.cells.length;
    const rowStart = i - (i % cols);
    const moves = {
      ArrowRight: i + 1,
      ArrowLeft: i - 1,
      ArrowDown: i + cols,
      ArrowUp: i - cols,
      Home: e.ctrlKey ? 0 : rowStart,
      End: e.ctrlKey ? n - 1 : Math.min(n - 1, rowStart + cols - 1),
    };
    if (!(e.key in moves)) return;
    e.preventDefault();
    const next = Math.max(0, Math.min(n - 1, moves[e.key]));
    setRoving(v, next);
    v.cells[next].focus();
  });

  /* ---------- mobile glyph sheet ---------- */

  const modal = createModal();

  function createModal() {
    let root = null;
    let els = null;
    let flat = [];
    let index = 0;
    let isOpen = false;
    let returnFocus = null;
    let inerted = [];
    let lenisWasStopped = false;
    let closeTimer = 0;
    let animating = null;
    const SLIDES = 5; // recycled: current ±2
    const MID = 2;

    function build() {
      root = document.createElement("div");
      root.className = "gs-modal";
      root.hidden = true;
      root.setAttribute("role", "dialog");
      root.setAttribute("aria-modal", "true");
      root.setAttribute("tabindex", "-1");
      const slide = `<div class="gs-modal__slide"><svg class="gs-modal__svg" viewBox="0 0 ${VIEW} ${VIEW}" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false"><text x="${VIEW / 2}" y="${BASELINE_Y.toFixed(1)}" text-anchor="middle"></text></svg></div>`;
      root.innerHTML = `<div class="gs-modal__backdrop" data-close></div>
        <div class="gs-modal__sheet animated-gradient-border">
          <div class="gs-modal__inner">
            <button type="button" class="gs-modal__close" data-close aria-label="Đóng khung xem ký tự">
              <svg class="gs-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 5l14 14M19 5L5 19" /></svg>
            </button>
            <div class="gs-modal__stage">
              <div class="gs-modal__viewport"><div class="gs-modal__track">${slide.repeat(SLIDES)}</div></div>
              <div class="gs-modal__lines" aria-hidden="true">${METRIC_ROWS.map((r) => `<span data-line="${r.key}"${r.accent ? ' class="is-accent"' : ""}></span>`).join("")}</div>
            </div>
            <p class="gs-modal__caption t-small" aria-live="polite"><span class="gs-modal__caption-name"></span> <span class="gs-modal__caption-code"></span></p>
            <div class="gs-modal__dots" aria-hidden="true"><div class="gs-modal__dots-track">${'<span class="gs-modal__dot"><span></span></span>'.repeat(5)}</div></div>
          </div>
        </div>`;
      document.body.append(root);
      els = {
        sheet: root.querySelector(".gs-modal__sheet"),
        close: root.querySelector(".gs-modal__close"),
        viewport: root.querySelector(".gs-modal__viewport"),
        track: root.querySelector(".gs-modal__track"),
        texts: [...root.querySelectorAll(".gs-modal__svg text")],
        lines: [...root.querySelectorAll(".gs-modal__lines > span")],
        name: root.querySelector(".gs-modal__caption-name"),
        code: root.querySelector(".gs-modal__caption-code"),
        dotsTrack: root.querySelector(".gs-modal__dots-track"),
        dots: [...root.querySelectorAll(".gs-modal__dot")],
      };
      gsap.set(els.track, { xPercent: -100 * MID, x: 0 });
      gsap.set(els.dotsTrack, { x: -12 });
      root.addEventListener("click", (e) => {
        if (e.target.closest("[data-close]")) close();
      });
      root.addEventListener("keydown", onKey);
      bindDrag();
    }

    function layoutLines() {
      els.lines.forEach((el) => (el.style.top = `${topPct(metricValue(el.dataset.line, weight.id))}%`));
    }

    function render() {
      const n = flat.length;
      els.texts.forEach((text, s) => {
        const item = flat[(((index + s - MID) % n) + n) % n];
        styleGlyphText(text, item.ch, item.han, weight);
      });
      const cur = flat[index];
      const scaled = advance(cur.ch, cur.han, weight) * UNIT > MAX_ADVANCE;
      const d = describe(cur.ch, cur.han, scaled);
      els.name.innerHTML = `<span${cur.han ? ' class="han"' : ""}>${esc(cur.ch)}</span>${esc(d.text)}`;
      els.code.textContent = `· ${d.code}`;
      root.setAttribute("aria-label", `Ký tự ${cur.ch}`);
      els.dots.forEach((dot, k) => dot.classList.toggle("is-active", k === MID));
      gsap.set(els.track, { xPercent: -100 * MID, x: 0 });
      gsap.set(els.dotsTrack, { x: -12 });
    }

    // slide one glyph left/right; selection in the grid follows the sheet
    function go(dir) {
      if (!dir || !flat.length) return;
      animating?.progress(1);
      const dur = rm() ? 0 : 0.4;
      els.dots.forEach((dot, k) => dot.classList.toggle("is-active", k === MID + dir));
      animating = gsap
        .timeline({
          onComplete: () => {
            animating = null;
            index = (index + dir + flat.length) % flat.length;
            const item = flat[index];
            select(item.gi, item.i);
            render();
          },
        })
        .to(els.track, { xPercent: -100 * (MID + dir), x: 0, duration: dur, ease: "power3.out" }, 0)
        .to(els.dotsTrack, { x: -12 - 12 * dir, duration: dur, ease: "power3.out" }, 0);
    }

    function bindDrag() {
      let drag = null;
      const vp = els.viewport;
      vp.addEventListener("pointerdown", (e) => {
        if (e.button !== 0 || animating) return;
        drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, axis: null, vx: 0, t: performance.now(), lx: e.clientX };
        try {
          vp.setPointerCapture(e.pointerId);
        } catch {
          /* pointer already released */
        }
      });
      vp.addEventListener("pointermove", (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        drag.dx = e.clientX - drag.x0;
        drag.dy = e.clientY - drag.y0;
        const now = performance.now();
        drag.vx = (e.clientX - drag.lx) / Math.max(1, now - drag.t);
        drag.lx = e.clientX;
        drag.t = now;
        if (!drag.axis && Math.hypot(drag.dx, drag.dy) > 6) {
          drag.axis = Math.abs(drag.dx) > Math.abs(drag.dy) ? "x" : "y";
          root.classList.add("is-dragging");
          if (drag.axis === "y") els.sheet.classList.add("is-dragging");
        }
        if (drag.axis === "x") gsap.set(els.track, { x: drag.dx });
        else if (drag.axis === "y") els.sheet.style.translate = `0 ${drag.dy > 0 ? drag.dy : drag.dy * 0.25}px`;
      });
      const end = (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        const { axis, dx, dy, vx } = drag;
        drag = null;
        root.classList.remove("is-dragging");
        els.sheet.classList.remove("is-dragging");
        if (axis === "x") {
          const w = vp.clientWidth;
          const dir = dx < -w * 0.15 || (vx < -0.4 && dx < -12) ? 1 : dx > w * 0.15 || (vx > 0.4 && dx > 12) ? -1 : 0;
          if (dir) go(dir);
          else gsap.to(els.track, { x: 0, duration: rm() ? 0 : 0.3, ease: "power3.out" });
        } else if (axis === "y") {
          if (Math.abs(dy) > 100) close();
          else els.sheet.style.translate = "";
        }
      };
      vp.addEventListener("pointerup", end);
      vp.addEventListener("pointercancel", end);
    }

    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        go(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
      } else if (e.key === "Tab") {
        // focus trap: the close button is the only control
        e.preventDefault();
        els.close.focus();
      }
    }

    function open(fromCell) {
      if (!root) build();
      clearTimeout(closeTimer);
      flat = views.flatMap((v, gi) => v.glyphs.map((ch, i) => ({ ch, gi, i, han: v.group.han })));
      index = Math.max(0, flat.findIndex((f) => f.gi === sel.gi && f.i === sel.i));
      returnFocus = fromCell || null;
      layoutLines();
      render();
      if (isOpen) return;
      isOpen = true;
      els.sheet.style.translate = "";
      root.hidden = false;
      // lock the page: Lenis + body scroll, everything else inert
      lenisWasStopped = !!app.lenis?.isStopped;
      app.lenis?.stop();
      document.body.style.overflow = "hidden";
      inerted = [...document.body.children].filter((n) => n !== root && !n.inert && n.tagName !== "SCRIPT");
      inerted.forEach((n) => (n.inert = true));
      root.getBoundingClientRect(); // commit the closed state so the open transition runs
      root.classList.add("is-open");
      root.focus({ preventScroll: true });
    }

    function close() {
      if (!isOpen) return;
      isOpen = false;
      animating?.progress(1);
      root.classList.remove("is-open");
      inerted.forEach((n) => (n.inert = false));
      inerted = [];
      document.body.style.overflow = "";
      if (!lenisWasStopped) app.lenis?.start();
      const target = views[sel.gi].cells[sel.i] || returnFocus;
      if (target) {
        target.focus({ preventScroll: true });
        // swiped to a glyph that is off screen: bring the grid along so the ring is visible
        const r = target.getBoundingClientRect();
        if (target !== returnFocus && (r.top < 0 || r.bottom > innerHeight)) {
          const offset = -(innerHeight - r.height) / 2;
          if (app.lenis && !lenisWasStopped) app.lenis.scrollTo(target, { offset, immediate: rm(), duration: 1, force: true });
          else target.scrollIntoView({ block: "center" });
        }
      }
      closeTimer = setTimeout(
        () => {
          root.hidden = true;
          els.sheet.style.translate = "";
        },
        rm() ? 0 : 300,
      );
    }

    return { open, close, isOpen: () => isOpen };
  }

  /* ---------- first render ---------- */

  views.forEach(renderCells);
  setCols(groupsEl.clientWidth);
  setWeight(weight.id);

  // the canvas fit check needs every face loaded (italic + Hán are otherwise fetched on first use)
  Promise.all(
    ['italic 400 1em "EB Garamond"', 'italic 700 1em "EB Garamond"', '400 1em "Noto Serif TC Han"', '700 1em "Noto Serif TC Han"'].map(
      (f) => document.fonts.load(f, f.includes("Han") ? "文" : "A"),
    ),
  ).then(updateInspector, () => {});

  new ResizeObserver((entries) => setCols(entries[0].contentRect.width)).observe(groupsEl);
  app.mq.lg.addEventListener("change", () => {
    setCols(groupsEl.clientWidth);
    if (app.mq.lg.matches) modal.close();
    else dropdown?.close();
  });

  /* ---------- motion (after WebGL compiled, like the reference) ---------- */

  const titleSvg = section.querySelector(".gs-title__svg");
  const letters = [...titleSvg.querySelectorAll("text")];

  function whenCompiled(fn) {
    let done = false;
    let offA = null;
    let offB = null;
    const run = () => {
      if (done) return;
      done = true;
      offA?.();
      offB?.();
      fn();
    };
    if (app.state.compiled || app.state.webglFailed) return run();
    offA = app.on("webgl:compiled", run);
    offB = app.on("webgl:error", run);
  }

  // local copy of the shell helper, used only if src/core/reveal.js is absent
  function fallbackRevealLines(el, { trigger = el, start = "top bottom", yPercent = 100, duration = 0.8, ease = "power2.out", once = true } = {}) {
    if (rm()) return null;
    return app.SplitText.create(el, {
      type: "lines",
      mask: "lines",
      linesClass: "line",
      autoSplit: true,
      onSplit: (s) =>
        gsap.timeline({
          scrollTrigger: { trigger, start, toggleActions: once ? "play none none none" : "play reverse play reverse" },
        }).from(s.lines, { yPercent, duration, ease, stagger: { amount: 0.075 * s.lines.length } }),
    });
  }

  const revealReady = revealModule
    ? revealModule().then((m) => m.revealLines || fallbackRevealLines, () => fallbackRevealLines)
    : Promise.resolve(fallbackRevealLines);

  revealReady.then((revealLines) =>
    whenCompiled(() => {
      const texts = [...section.querySelectorAll("[data-motion-text]")];
      gsap.matchMedia().add({ all: "all", isRm: "(prefers-reduced-motion: reduce)" }, (ctx) => {
        if (ctx.conditions.isRm) {
          gsap.set([...texts, ...letters], { clearProps: "all" });
          return undefined;
        }
        const handles = texts.map((el) =>
          revealLines(el, { trigger: el, start: "top 90%", yPercent: 110, duration: 0.9, ease: "power3.out", once: true }),
        );
        // letters pop up one by one (0.05 s × 8 letters of the reference = 0.4 s spread)
        gsap.from(letters, {
          yPercent: 100,
          duration: 0.9,
          ease: "power3.out",
          stagger: { amount: 0.4 },
          scrollTrigger: { trigger: titleSvg, start: "top 90%", toggleActions: "play none none none" },
        });
        return () =>
          handles.forEach((h) => {
            if (h?.revert) h.revert();
            else if (h?.kill) h.kill();
          });
      });
    }),
  );
}
