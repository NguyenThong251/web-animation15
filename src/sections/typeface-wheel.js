// Kiểu chữ · typeface wheel (SPEC_MOTION §4.6, "sticky cards video").
//
// A 700lvh section with a sticky #f5f5f5 stage. Four square cards ride a big wheel whose
// centre sits below the stage; scrolling turns the wheel, each card passes the top upright,
// and the last card leaves the wheel and expands to (almost) fill the stage. Instead of the
// reference's videos every card holds a live <canvas> typographic animation set in
// EB Garamond, and the last card turns into a DOM type tester once it starts expanding.
//
// Canvases only draw while their card intersects the viewport (IntersectionObserver), at
// devicePixelRatio (capped at 2), sized to the card (ResizeObserver).

const N = 4; // cards on the wheel
const DEG = Math.PI / 180;
const SERIF = '"EB Garamond"';
const OLDSTYLE = '"EB Garamond Oldstyle"'; // same VF, onum + tnum on the @font-face (20-typeface-wheel.css)
const C = {
  indigo: "#5b74eb",
  pink: "#ff9cef",
  black: "#000000",
  white: "#ffffff",
};

// EB Garamond metrics (src/data/glyphs.json, units per em = 1000)
const X_HEIGHT = 0.4;

const SAMPLE = "Trăm năm trong cõi người ta, chữ tài chữ mệnh khéo là ghét nhau.";
const STYLES = [
  { key: "thuong", label: "Thường", italic: false, weight: 400 },
  { key: "nghieng", label: "Nghiêng", italic: true, weight: 400 },
  { key: "dam", label: "Đậm", italic: false, weight: 700 },
  { key: "dam-nghieng", label: "Đậm nghiêng", italic: true, weight: 700 },
];

// ---------------------------------------------------------------------------------------
// small math helpers
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, t) => a + (b - a) * t;
const power3Out = (t) => 1 - Math.pow(1 - t, 3); // = gsap "power3.out"
const power3InOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2); // = "power3.inOut"
const sineInOut = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
const smoothstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const font = (size, { weight = 400, italic = false, family = SERIF } = {}) =>
  `${italic ? "italic " : ""}${Math.round(weight)} ${Math.max(1, size).toFixed(2)}px ${family}`;

// Shared header row of every card: title on the left, index (or a live value) on the right.
function drawHeader(ctx, w, S, left, right, color, rightColor = color) {
  const pad = S * 0.06;
  const fs = Math.max(11, S * 0.036);
  ctx.textBaseline = "alphabetic";
  ctx.font = font(fs, { weight: 500 });
  ctx.fillStyle = color;
  ctx.textAlign = "left";
  ctx.fillText(left, pad, pad + fs * 0.75);
  ctx.fillStyle = rightColor;
  ctx.textAlign = "right";
  ctx.fillText(right, w - pad, pad + fs * 0.75);
}

// Fit a single line of text into maxW by shrinking its size.
function fitSize(ctx, text, size, maxW, opts) {
  ctx.font = font(size, opts);
  const width = ctx.measureText(text).width;
  return width > maxW ? (size * maxW) / width : size;
}

// ---------------------------------------------------------------------------------------
// Card canvas: owns the backing store, local clock and visibility of one animation.
class CardCanvas {
  constructor(canvas, painter) {
    this.canvas = canvas;
    this.card = canvas.closest("[data-tw-card]");
    this.ctx = canvas.getContext("2d");
    this.painter = painter;
    this.t = painter.startTime || 0;
    this.cssW = 0;
    this.cssH = 0;
    this.w = 0;
    this.h = 0;
    this.dpr = 1;
    this.visible = false; // IntersectionObserver
    this.enabled = true; // wheel state (hidden cards / expanded tester)
    this.dirty = true;
  }
  get active() {
    return this.visible && this.enabled && this.cssW > 1 && this.cssH > 1;
  }
  setSize(w, h) {
    if (w === this.cssW && h === this.cssH) return;
    this.cssW = w;
    this.cssH = h;
    this.dirty = true;
  }
  fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.max(1, Math.round(this.cssW * dpr));
    const H = Math.max(1, Math.round(this.cssH * dpr));
    if (this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas.width = W;
      this.canvas.height = H;
    }
    this.dpr = dpr;
    this.w = W / dpr;
    this.h = H / dpr;
    this.painter.layout?.(this.ctx, this);
    this.dirty = false;
  }
  frame(dt) {
    if (this.dirty) this.fit();
    this.t += dt;
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    this.painter.draw(ctx, this);
  }
}

// ---------------------------------------------------------------------------------------
// 1 · Dấu thanh — a giant vowel; the five tone marks drop in one by one.
//
// Precomposed toned vowels are composites of the plain letter + a mark stack (for ấ the
// circumflex itself is swapped for a narrower variant), so the "stack" of each form is
// rasterised offscreen as (toned glyph − plain letter) with destination-out. The plain
// letter stays put and only the stack animates.
const TONE_MARKS = ["\u0300", "\u0301", "\u0309", "\u0303", "\u0323"]; // combining grave, acute, hook, tilde, dot below
const TONE_NAMES = ["huyền", "sắc", "hỏi", "ngã", "nặng"];
const VOWELS = [
  ["a", "a", "a"],
  ["ă", "a", "á"],
  ["â", "a", "ớ"],
  ["e", "e", "e"],
  ["ê", "e", "ê"],
  ["i", "ı", "i"],
  ["o", "o", "o"],
  ["ô", "o", "ô"],
  ["ơ", "ơ", "ơ"],
  ["u", "u", "u"],
  ["ư", "ư", "ư"],
  ["y", "y", "i dài"],
].map(([letter, plain, name]) => ({
  letter, // the vowel as written
  plain, // the shared base outline (dotless ı so the dot of i is part of the stack)
  name, // how the letter is called when spelling aloud ("ă" is read "á", "y" is "i dài")
  forms: [letter, ...TONE_MARKS.map((m) => (letter + m).normalize("NFC"))],
}));

function createMarksPainter() {
  const NEUTRAL = 1.3; // seconds the toneless vowel holds
  const STEP = 1.6; // seconds per tone
  const PER_VOWEL = NEUTRAL + 5 * STEP;
  const DROP_DELAY = 0.1;
  const DROP = 0.85;
  const LETTER_WEIGHT = 500;
  const stacks = new Map();
  let geo = null;

  // offscreen mark stack of `form`, in device pixels, anchored at (ox, oy) = (centre, baseline)
  function stackOf(form, plain, cc) {
    const key = form;
    if (stacks.has(key)) return stacks.get(key);
    if (stacks.size > 24) stacks.delete(stacks.keys().next().value);
    const size = geo.F * cc.dpr;
    const c = document.createElement("canvas");
    const x = c.getContext("2d");
    x.font = font(size, { weight: LETTER_WEIGHT });
    x.textAlign = "center";
    x.textBaseline = "alphabetic";
    const m = x.measureText(form);
    const ox = Math.ceil(m.actualBoundingBoxLeft) + 6;
    const oy = Math.ceil(m.actualBoundingBoxAscent) + 6;
    c.width = ox + Math.ceil(m.actualBoundingBoxRight) + 6;
    c.height = oy + Math.ceil(m.actualBoundingBoxDescent) + 6;
    x.font = font(size, { weight: LETTER_WEIGHT }); // resizing resets the context
    x.textAlign = "center";
    x.textBaseline = "alphabetic";
    x.fillStyle = C.pink;
    x.fillText(form, ox, oy);
    x.globalCompositeOperation = "destination-out";
    x.fillText(plain, ox, oy);
    // also erase a few device pixels around the base outline: the composite and the plain
    // letter do not rasterise to identical coverage, and the leftover fringe would show
    // as a ghost outline while the stack is still falling
    x.lineWidth = Math.max(3, size * 0.012);
    x.lineJoin = "round";
    x.strokeText(plain, ox, oy);
    const s = { canvas: c, ox, oy };
    stacks.set(key, s);
    return s;
  }

  function drawStack(ctx, cc, form, plain, dy, alpha) {
    if (alpha <= 0.001 || form === plain) return;
    const s = stackOf(form, plain, cc);
    const { dpr } = cc;
    ctx.globalAlpha = alpha;
    // integer device-pixel anchor so the stack registers exactly with the base letter
    ctx.drawImage(
      s.canvas,
      (geo.xDev - s.ox) / dpr,
      (geo.yDev - s.oy + Math.round(dy * dpr)) / dpr,
      s.canvas.width / dpr,
      s.canvas.height / dpr,
    );
    ctx.globalAlpha = 1;
  }

  function drawPlain(ctx, cc, plain, alpha) {
    if (alpha <= 0.001) return;
    ctx.globalAlpha = alpha;
    ctx.font = font(geo.F, { weight: LETTER_WEIGHT });
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = C.white;
    ctx.fillText(plain, geo.xDev / cc.dpr, geo.yDev / cc.dpr);
    ctx.globalAlpha = 1;
  }

  function state(t) {
    const L = VOWELS.length;
    const vi = Math.floor(t / PER_VOWEL) % L;
    const local = t % PER_VOWEL;
    const step = local < NEUTRAL ? 0 : 1 + Math.min(4, Math.floor((local - NEUTRAL) / STEP));
    const stepT = step === 0 ? local : local - NEUTRAL - (step - 1) * STEP;
    const prev = step === 0 ? { v: VOWELS[(vi + L - 1) % L], step: 5 } : { v: VOWELS[vi], step: step - 1 };
    return { v: VOWELS[vi], step, stepT, prev };
  }

  const captionOf = (v, step) =>
    step === 0
      ? [v.name, `chữ ${v.letter} · thanh ngang`]
      : [`${v.name} ${TONE_NAMES[step - 1]} ${v.forms[step]}`, `chữ ${v.letter} · dấu ${TONE_NAMES[step - 1]}`];

  return {
    startTime: 0.9,
    layout(ctx, cc) {
      stacks.clear();
      const S = Math.min(cc.w, cc.h);
      const F = S * 0.5;
      const by = cc.h * 0.63;
      ctx.font = font(F, { weight: LETTER_WEIGHT });
      // top of the tallest stacked marks → the "vùng dấu" band
      let top = 0;
      for (const g of ["ẫ", "ẩ", "ỗ", "ễ", "ẵ", "ữ", "ỡ", "ỷ"]) top = Math.max(top, ctx.measureText(g).actualBoundingBoxAscent);
      geo = {
        S,
        F,
        by,
        xDev: Math.round((cc.w / 2) * cc.dpr),
        yDev: Math.round(by * cc.dpr),
        markTop: by - top,
      };
    },
    draw(ctx, cc) {
      const { w, h, t } = cc;
      const { S, F, by } = geo;
      const pad = S * 0.06;
      ctx.fillStyle = C.indigo;
      ctx.fillRect(0, 0, w, h);

      // metric guides: baseline, x-height, and the band where Vietnamese marks live
      const xh = by - X_HEIGHT * F;
      const bandBottom = xh - F * 0.04;
      ctx.fillStyle = "rgba(255,255,255,0.07)";
      ctx.fillRect(0, geo.markTop, w, bandBottom - geo.markTop);
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.fillRect(0, Math.round(by), w, 1);
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.fillRect(0, Math.round(xh), w, 1);
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, Math.round(geo.markTop) + 0.5);
      ctx.lineTo(w, Math.round(geo.markTop) + 0.5);
      ctx.stroke();
      ctx.restore();
      if (S >= 360) {
        const lf = S * 0.026;
        ctx.font = font(lf);
        ctx.textAlign = "left";
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.fillText("vùng dấu", pad, geo.markTop + lf * 1.3);
        ctx.fillText("chiều cao x", pad, xh - lf * 0.5);
        ctx.fillText("đường cơ sở", pad, by - lf * 0.5);
      }

      drawHeader(ctx, w, S, "Dấu thanh", "01", "rgba(255,255,255,0.9)");

      // letter + stacks
      const { v, step, stepT, prev } = state(t);
      const vowelChange = step === 0 && prev.v !== v;
      if (vowelChange) {
        const k = smoothstep(0.05, 0.5, stepT);
        drawPlain(ctx, cc, prev.v.plain, 1 - k);
        drawStack(ctx, cc, prev.v.forms[prev.step], prev.v.plain, -k * S * 0.05, 1 - k);
        drawPlain(ctx, cc, v.plain, k);
      } else {
        drawPlain(ctx, cc, v.plain, 1);
        const k = clamp01(stepT / 0.3);
        drawStack(ctx, cc, prev.v.forms[prev.step], v.plain, -power3Out(k) * S * 0.05, 1 - k);
      }
      // the new stack drops from above with a soft ease-out
      const d = clamp01((stepT - DROP_DELAY) / DROP);
      drawStack(ctx, cc, v.forms[step], v.plain, -(1 - power3Out(d)) * S * 0.3, clamp01(d * 2.5));

      // caption: the spelling chant ("ơ ngã ỡ") + letter / tone name
      const capK = smoothstep(0, 0.35, stepT);
      const capY = S * 0.885;
      const c1 = Math.max(15, S * 0.062);
      const c2 = Math.max(10.5, S * 0.032);
      const drawCaption = (lines, alpha, dy) => {
        if (alpha <= 0.001) return;
        ctx.globalAlpha = alpha;
        ctx.textAlign = "left";
        ctx.fillStyle = C.white;
        ctx.font = font(c1, { italic: true });
        ctx.fillText(lines[0], pad, capY + dy);
        ctx.fillStyle = "rgba(255,255,255,0.72)";
        ctx.font = font(c2);
        ctx.fillText(lines[1], pad, capY + c2 * 1.75 + dy);
        ctx.globalAlpha = 1;
      };
      drawCaption(captionOf(prev.v, prev.step), 1 - capK, -capK * S * 0.02);
      drawCaption(captionOf(v, step), capK, (1 - capK) * S * 0.02);

      // the five toned forms, current one lit
      const rf = Math.max(14, S * 0.054);
      const gap = rf * 1.25;
      const rowY = capY + c2 * 1.75;
      ctx.font = font(rf, { weight: LETTER_WEIGHT });
      ctx.textAlign = "center";
      for (let i = 0; i < 5; i++) {
        const x = w - pad - gap * (4 - i) - rf * 0.35;
        const on = step === i + 1 ? capK : prev.step === i + 1 && prev.v === v ? 1 - capK : 0;
        ctx.fillStyle = `rgba(255,255,255,${0.35 + 0.65 * on})`;
        ctx.fillText(v.forms[i + 1], x, rowY);
        if (on > 0.01) {
          ctx.fillStyle = C.pink;
          ctx.globalAlpha = on;
          ctx.beginPath();
          ctx.arc(x, rowY + rf * 0.42, Math.max(1.5, S * 0.006), 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
    },
  };
}

// ---------------------------------------------------------------------------------------
// 2 · Niên đại — an odometer of years in oldstyle figures with a one-line caption.
const YEARS = [
  [1070, "Dựng Văn Miếu"],
  [1076, "Lập Quốc Tử Giám"],
  [1442, "Khoa thi đầu tiên được khắc bia"],
  [1484, "Dựng bia tiến sĩ"],
  [1651, "Từ điển Việt – Bồ – La"],
  [1865, "Gia Định báo"],
  [1919, "Khoa thi Hội cuối cùng ở Huế"],
];

function createYearsPainter() {
  const PERIOD = 3.4; // seconds per year
  const ROLL = 1.15; // roll duration of one drum
  const COL_DELAY = 0.08; // units drum leads, thousands drum trails
  const PHI = 0.9; // angle between two figures on the drum (radians)
  let geo = null;

  return {
    startTime: 1.6,
    layout(ctx, cc) {
      const S = Math.min(cc.w, cc.h);
      const D = S * 0.3;
      ctx.font = font(D, { weight: 500, family: OLDSTYLE });
      let colW = 0;
      for (let d = 0; d < 10; d++) colW = Math.max(colW, ctx.measureText(String(d)).width);
      colW *= 1.04;
      geo = { S, D, colW, R: D * 1.05, cy: cc.h * 0.42, x0: (cc.w - colW * 4) / 2 };
    },
    draw(ctx, cc) {
      const { w, h, t } = cc;
      const { S, D, colW, R, cy, x0 } = geo;
      const pad = S * 0.06;
      ctx.fillStyle = C.pink;
      ctx.fillRect(0, 0, w, h);
      drawHeader(ctx, w, S, "Niên đại", "02", C.black);

      const n = YEARS.length;
      const idx = Math.floor(t / PERIOD) % n;
      const st = t % PERIOD;
      const from = String(YEARS[(idx + n - 1) % n][0]).split("").map(Number);
      const to = String(YEARS[idx][0]).split("").map(Number);

      // drum window
      const win = D * 0.62;
      ctx.fillStyle = "rgba(0,0,0,0.85)";
      ctx.fillRect(x0 - D * 0.12, Math.round(cy - win), colW * 4 + D * 0.24, 1);
      ctx.fillRect(x0 - D * 0.12, Math.round(cy + win), colW * 4 + D * 0.24, 1);
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      for (let c = 1; c < 4; c++) ctx.fillRect(Math.round(x0 + colW * c), cy - win * 0.55, 1, win * 1.1);

      ctx.save();
      ctx.beginPath();
      ctx.rect(x0 - D * 0.12, cy - win + 1, colW * 4 + D * 0.24, win * 2 - 1);
      ctx.clip();
      ctx.font = font(D, { weight: 500, family: OLDSTYLE });
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = C.black;
      for (let c = 0; c < 4; c++) {
        const r = power3InOut(clamp01((st - (3 - c) * COL_DELAY) / ROLL));
        const delta = (to[c] - from[c] + 10) % 10; // odometers only ever roll forward
        const v = from[c] + delta * r;
        const base = Math.floor(v);
        for (let k = base - 1; k <= base + 2; k++) {
          // figure k sits on a drum: angle a from the window centre, projected to y = R·sin a
          const a = (k - v) * PHI;
          if (Math.abs(a) >= Math.PI / 2) continue;
          const sy = Math.cos(a);
          ctx.save();
          ctx.globalAlpha = sy * sy;
          ctx.translate(x0 + colW * (c + 0.5), cy + R * Math.sin(a));
          ctx.scale(1, sy);
          // oldstyle figures centre on ~0.2 em above the baseline
          ctx.fillText(String(((k % 10) + 10) % 10), 0, D * 0.2);
          ctx.restore();
        }
      }
      ctx.restore();

      // caption crossfade
      const capY = cy + win + S * 0.13;
      const k = smoothstep(0.05, 0.6, st);
      const drawCap = (text, alpha, dy) => {
        if (alpha <= 0.001) return;
        const size = fitSize(ctx, text, Math.max(15, S * 0.06), w - pad * 2, { italic: true });
        ctx.font = font(size, { italic: true });
        ctx.textAlign = "center";
        ctx.fillStyle = C.black;
        ctx.globalAlpha = alpha;
        ctx.fillText(text, w / 2, capY + dy);
        ctx.globalAlpha = 1;
      };
      drawCap(YEARS[(idx + n - 1) % n][1], 1 - k, -k * S * 0.03);
      drawCap(YEARS[idx][1], k, (1 - k) * S * 0.03);

      // timeline 1000 → 2000
      const ly = S * 0.86;
      const lx0 = pad;
      const lx1 = w - pad;
      const X = (year) => lerp(lx0, lx1, (year - 1000) / 1000);
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(lx0, Math.round(ly), lx1 - lx0, 1);
      for (let y = 1000; y <= 2000; y += 100) {
        const th = y % 500 === 0 ? S * 0.022 : S * 0.011;
        ctx.fillRect(Math.round(X(y)), Math.round(ly) - th, 1, th);
      }
      const lf = Math.max(10, S * 0.03);
      ctx.font = font(lf, { family: OLDSTYLE });
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.textAlign = "left";
      ctx.fillText("1000", lx0, ly + lf * 1.4);
      ctx.textAlign = "center";
      ctx.fillText("1500", X(1500), ly + lf * 1.4);
      ctx.textAlign = "right";
      ctx.fillText("2000", lx1, ly + lf * 1.4);
      for (const [y] of YEARS) {
        ctx.beginPath();
        ctx.arc(X(y), ly + 0.5, Math.max(1.6, S * 0.0065), 0, Math.PI * 2);
        ctx.fill();
      }
      const m = power3InOut(clamp01(st / (ROLL + 3 * COL_DELAY)));
      ctx.fillStyle = C.indigo;
      ctx.beginPath();
      ctx.arc(lerp(X(YEARS[(idx + n - 1) % n][0]), X(YEARS[idx][0]), m), ly + 0.5, Math.max(3.5, S * 0.014), 0, Math.PI * 2);
      ctx.fill();
    },
  };
}

// ---------------------------------------------------------------------------------------
// 3 · Bốn giọng — "Việt" breathing from 400 to 800 and from roman to italic.
function createVoicesPainter() {
  const PERIOD = 8.4;
  const SKEW = 0.2; // slant used to morph roman ↔ italic (≈ 11°)
  let geo = null;

  // weight w (400–800) and italic morph m (0–1) over one loop
  function state(t) {
    const x = t % PERIOD;
    if (x < 2.4) return { w: lerp(400, 800, sineInOut(x / 2.4)), m: 0 };
    if (x < 3.0) return { w: 800, m: 0 };
    if (x < 3.9) return { w: 800, m: power3InOut((x - 3.0) / 0.9) };
    if (x < 4.5) return { w: 800, m: 1 };
    if (x < 6.9) return { w: lerp(800, 400, sineInOut((x - 4.5) / 2.4)), m: 1 };
    if (x < 7.5) return { w: 400, m: 1 };
    return { w: 400, m: 1 - power3InOut((x - 7.5) / 0.9) };
  }

  return {
    startTime: 0.2,
    layout(ctx, cc) {
      const S = Math.min(cc.w, cc.h);
      const pad = S * 0.06;
      const size = fitSize(ctx, "Việt", S * 0.34, cc.w - pad * 2.4, { weight: 800 });
      geo = { S, pad, size, by: cc.h * 0.56 };
    },
    draw(ctx, cc) {
      const { w, h, t } = cc;
      const { S, pad, size, by } = geo;
      const { w: wght, m } = state(t);
      ctx.fillStyle = C.white;
      ctx.fillRect(0, 0, w, h);

      // header: live weight value in tabular oldstyle figures
      drawHeader(ctx, w, S, "Bốn giọng", "", C.black);
      const hf = Math.max(11, S * 0.036);
      ctx.textAlign = "right";
      ctx.font = font(hf, { weight: 500, family: OLDSTYLE });
      ctx.fillStyle = C.indigo;
      const num = String(Math.round(wght));
      ctx.fillText(num, w - pad, pad + hf * 0.75);
      const numW = ctx.measureText(num).width;
      ctx.font = font(hf, { weight: 500, italic: true });
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillText("wght ", w - pad - numW, pad + hf * 0.75);

      // baseline guide
      ctx.fillStyle = "rgba(0,0,0,0.1)";
      ctx.fillRect(pad, Math.round(by), w - pad * 2, 1);

      // roman and italic cross-slanted so they meet half-way (a morph, not a cut)
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = C.black;
      const romanA = 1 - smoothstep(0.3, 0.7, m);
      const italicA = smoothstep(0.3, 0.7, m);
      if (romanA > 0.001) {
        ctx.save();
        ctx.globalAlpha = romanA;
        ctx.translate(w / 2, by);
        ctx.transform(1, 0, -SKEW * m, 1, 0, 0);
        ctx.font = font(size, { weight: wght });
        ctx.fillText("Việt", 0, 0);
        ctx.restore();
      }
      if (italicA > 0.001) {
        ctx.save();
        ctx.globalAlpha = italicA;
        ctx.translate(w / 2, by);
        ctx.transform(1, 0, SKEW * (1 - m), 1, 0, 0);
        ctx.font = font(size, { weight: wght, italic: true });
        ctx.fillText("Việt", 0, 0);
        ctx.restore();
      }

      // weight track 400 — 800
      const ty = S * 0.78;
      const lf = Math.max(10, S * 0.03);
      ctx.font = font(lf, { family: OLDSTYLE });
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.textAlign = "left";
      ctx.fillText("400", pad, ty + lf * 0.35);
      ctx.textAlign = "right";
      ctx.fillText("800", w - pad, ty + lf * 0.35);
      const tx0 = pad + lf * 2.4;
      const tx1 = w - pad - lf * 2.4;
      const dotX = lerp(tx0, tx1, (wght - 400) / 400);
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.fillRect(tx0, Math.round(ty), tx1 - tx0, 1);
      ctx.fillStyle = C.indigo;
      ctx.fillRect(tx0, Math.round(ty) - 0.5, dotX - tx0, 2);
      ctx.beginPath();
      ctx.arc(dotX, ty + 0.5, Math.max(4, S * 0.014), 0, Math.PI * 2);
      ctx.fill();

      // the four styles, the one being shown lit
      const current = m >= 0.5 ? (wght >= 600 ? 3 : 1) : wght >= 600 ? 2 : 0;
      const cf = Math.max(11, S * 0.036);
      const cy = S * 0.9;
      const slot = (w - pad * 2) / 4;
      ctx.textAlign = "center";
      STYLES.forEach((s, i) => {
        ctx.font = font(cf, { weight: s.weight, italic: s.italic });
        ctx.fillStyle = i === current ? C.black : "rgba(0,0,0,0.32)";
        const x = pad + slot * (i + 0.5);
        ctx.fillText(s.label, x, cy);
        if (i === current) {
          ctx.fillStyle = C.indigo;
          ctx.fillRect(x - slot * 0.18, cy + cf * 0.45, slot * 0.36, Math.max(1.5, S * 0.004));
        }
      });
    },
  };
}

// ---------------------------------------------------------------------------------------
// 4 · Thử chữ (preview while the card rides the wheel) — the sample line types itself in
// each of the four styles, with a sketch of the tester controls underneath.
function createTesterPreviewPainter() {
  const TYPE_RATE = 24; // characters per second
  const ERASE_RATE = 75;
  const HOLD = 1.6;
  const chars = Array.from(SAMPLE);
  const typeDur = chars.length / TYPE_RATE;
  const eraseDur = chars.length / ERASE_RATE;
  const PER_STYLE = typeDur + HOLD + eraseDur + 0.25;
  let geo = null;

  // greedy word wrap → [{ text, start }] where start is the char index of the line
  function wrap(ctx, maxW) {
    const words = SAMPLE.split(" ");
    const lines = [];
    let line = "";
    let start = 0;
    let pos = 0;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(test).width > maxW) {
        lines.push({ text: line, start });
        start = pos;
        line = word;
      } else line = test;
      pos += Array.from(word).length + 1;
    }
    lines.push({ text: line, start });
    return lines;
  }

  return {
    startTime: 0,
    layout(ctx, cc) {
      const S = Math.min(cc.w, cc.h);
      const pad = S * 0.06;
      const size = S * 0.088;
      const layouts = STYLES.map((s) => {
        ctx.font = font(size, s);
        return wrap(ctx, cc.w - pad * 2);
      });
      geo = { S, pad, size, layouts };
    },
    draw(ctx, cc) {
      const { w, h, t } = cc;
      const { S, pad, size, layouts } = geo;
      ctx.fillStyle = C.black;
      ctx.fillRect(0, 0, w, h);
      drawHeader(ctx, w, S, "Thử chữ", "04", C.pink, "rgba(255,255,255,0.6)");

      const si = Math.floor(t / PER_STYLE) % STYLES.length;
      const local = t % PER_STYLE;
      const style = STYLES[si];
      let count;
      let blink = false;
      if (local < typeDur) count = Math.floor(local * TYPE_RATE);
      else if (local < typeDur + HOLD) {
        count = chars.length;
        blink = true;
      } else count = Math.max(0, chars.length - Math.floor((local - typeDur - HOLD) * ERASE_RATE));

      // typed text
      const lh = size * 1.16;
      const top = S * 0.2 + size;
      ctx.font = font(size, style);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = C.white;
      let caretX = pad;
      let caretY = top;
      for (const [li, line] of layouts[si].entries()) {
        const lineChars = Array.from(line.text);
        const visible = Math.max(0, Math.min(lineChars.length, count - line.start));
        if (visible <= 0 && li > 0) break;
        const shown = lineChars.slice(0, visible).join("");
        const y = top + li * lh;
        ctx.fillText(shown, pad, y);
        caretX = pad + ctx.measureText(shown).width;
        caretY = y;
        if (visible < lineChars.length) break;
      }
      if (!blink || local % 1 < 0.55) {
        ctx.fillStyle = C.pink;
        ctx.fillRect(caretX + size * 0.04, caretY - size * 0.74, Math.max(1.5, S * 0.004), size * 0.92);
      }

      // sketch of the controls: segmented styles + weight slider
      const cf = Math.max(10, S * 0.032);
      const segY = S * 0.8;
      const ph = cf * 0.75;
      let x = pad;
      const widths = STYLES.map((s) => {
        ctx.font = font(cf, s);
        return ctx.measureText(s.label).width + ph * 2;
      });
      const total = widths.reduce((a, b) => a + b, 0) + 6;
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x + 0.5, segY - cf * 1.25 + 0.5, total, cf * 2.1, 6);
      ctx.stroke();
      x += 3;
      STYLES.forEach((s, i) => {
        const sw = widths[i];
        if (i === si) {
          ctx.fillStyle = C.pink;
          ctx.beginPath();
          ctx.roundRect(x, segY - cf * 1.25 + 3, sw, cf * 2.1 - 5, 4);
          ctx.fill();
        }
        ctx.font = font(cf, s);
        ctx.fillStyle = i === si ? C.black : "rgba(255,255,255,0.75)";
        ctx.fillText(s.label, x + ph, segY + cf * 0.1);
        x += sw;
      });

      const sy = S * 0.9;
      ctx.font = font(cf);
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.fillText("Độ đậm", pad, sy + cf * 0.35);
      const sx0 = pad + cf * 5;
      const sx1 = w - pad - cf * 3;
      const dot = lerp(sx0, sx1, (style.weight - 400) / 400);
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.fillRect(sx0, Math.round(sy), sx1 - sx0, 1);
      ctx.fillStyle = C.pink;
      ctx.fillRect(sx0, Math.round(sy), dot - sx0, 1);
      ctx.beginPath();
      ctx.arc(dot, sy + 0.5, Math.max(3.5, S * 0.012), 0, Math.PI * 2);
      ctx.fill();
      ctx.textAlign = "right";
      ctx.fillStyle = C.white;
      ctx.font = font(cf, { family: OLDSTYLE });
      ctx.fillText(String(style.weight), w - pad, sy + cf * 0.35);
    },
  };
}

// ---------------------------------------------------------------------------------------
function setupCanvases(section, app) {
  const painters = {
    marks: createMarksPainter,
    years: createYearsPainter,
    voices: createVoicesPainter,
    tester: createTesterPreviewPainter,
  };
  const list = [...section.querySelectorAll("[data-tw-canvas]")].map(
    (canvas) => new CardCanvas(canvas, painters[canvas.dataset.twCanvas]()),
  );
  const byCard = new Map(list.map((cc) => [cc.card, cc]));

  const ro = new ResizeObserver((entries) => {
    for (const e of entries) byCard.get(e.target)?.setSize(e.contentRect.width, e.contentRect.height);
  });
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const cc = byCard.get(e.target);
      if (cc) cc.visible = e.isIntersecting;
    }
  });
  list.forEach((cc) => {
    ro.observe(cc.card);
    io.observe(cc.card);
  });
  addEventListener("resize", () => list.forEach((cc) => (cc.dirty = true)));

  let running = false;
  const tick = (_time, deltaMs) => {
    if (document.hidden) return;
    const dt = Math.min(deltaMs / 1000, 0.1);
    for (const cc of list) if (cc.active) cc.frame(dt);
  };
  return {
    list,
    // start drawing once every face the painters use is loaded
    start() {
      if (running) return;
      running = true;
      const faces = [
        `400 64px ${SERIF}`,
        `500 64px ${SERIF}`,
        `700 64px ${SERIF}`,
        `800 64px ${SERIF}`,
        `italic 400 64px ${SERIF}`,
        `italic 800 64px ${SERIF}`,
        `500 64px ${OLDSTYLE}`,
      ];
      Promise.allSettled(faces.map((f) => document.fonts.load(f, "Việt ấ 0123456789"))).then(() => {
        list.forEach((cc) => (cc.dirty = true));
        app.gsap.ticker.add(tick);
      });
    },
  };
}

// ---------------------------------------------------------------------------------------
// Type tester controls (DOM): style segments, weight + size sliders, editable line.
function setupTester(section, app) {
  const root = section.querySelector("[data-tw-tester]");
  const text = root.querySelector("[data-tw-text]");
  const radios = [...root.querySelectorAll('input[name="tw-style"]')];
  const wght = root.querySelector("[data-tw-wght]");
  const wghtOut = root.querySelector("[data-tw-wght-out]");
  const size = root.querySelector("[data-tw-size]");
  const sizeOut = root.querySelector("[data-tw-size-out]");
  const meta = root.querySelector("[data-tw-meta]");
  const reset = root.querySelector("[data-tw-reset]");
  const DEFAULT_TEXT = text.textContent.trim();
  const RANGES = { sm: { min: 18, max: 72, value: 40 }, md: { min: 24, max: 160, value: 88 } };

  const state = { italic: false, weight: 400, size: RANGES.md.value, sizeTouched: false };
  const styleOf = () => STYLES.find((s) => s.italic === state.italic && (s.weight >= 600) === state.weight >= 600);
  const fill = (input) => {
    const p = ((input.value - input.min) / (input.max - input.min)) * 100;
    input.style.setProperty("--fill", `${p}%`);
  };

  function render() {
    const style = styleOf();
    root.style.setProperty("--tt-wght", state.weight);
    root.style.setProperty("--tt-style", state.italic ? "italic" : "normal");
    root.style.setProperty("--tt-size", state.size);
    wght.value = state.weight;
    size.value = state.size;
    wghtOut.textContent = String(state.weight);
    sizeOut.textContent = `${state.size} px`;
    fill(wght);
    fill(size);
    radios.forEach((r) => (r.checked = r.value === style.key));
    meta.textContent = `EB Garamond · ${style.label} · ${state.weight} · ${state.size} px — nhấp vào dòng chữ để gõ thử`;
  }

  // a preset glides the weight (CSS transition); dragging the slider stays immediate
  let easeTimer = 0;
  radios.forEach((r) =>
    r.addEventListener("change", () => {
      const s = STYLES.find((x) => x.key === r.value);
      state.italic = s.italic;
      state.weight = s.weight;
      text.style.transitionDuration = "";
      clearTimeout(easeTimer);
      easeTimer = setTimeout(() => (text.style.transitionDuration = "0ms"), 450);
      render();
    }),
  );
  text.style.transitionDuration = "0ms";
  wght.addEventListener("input", () => {
    state.weight = Number(wght.value);
    render();
  });
  size.addEventListener("input", () => {
    state.size = Number(size.value);
    state.sizeTouched = true;
    render();
  });

  // slider range follows the breakpoint
  const applyRange = () => {
    const r = app.mq.sm.matches ? RANGES.sm : RANGES.md;
    size.min = r.min;
    size.max = r.max;
    state.size = state.sizeTouched ? Math.min(r.max, Math.max(r.min, state.size)) : r.value;
    render();
  };
  app.mq.sm.addEventListener("change", applyRange);

  // the editable line: plain text only, a single paragraph, never empty
  text.contentEditable = "plaintext-only";
  if (text.contentEditable !== "plaintext-only") {
    text.contentEditable = "true";
    text.addEventListener("paste", (e) => {
      e.preventDefault();
      const sel = getSelection();
      if (!sel || !sel.rangeCount) return;
      const node = document.createTextNode((e.clipboardData?.getData("text/plain") || "").replace(/\s+/g, " "));
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(node);
      range.setStartAfter(node);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    });
  }
  text.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === "Escape") {
      e.preventDefault();
      text.blur();
    }
  });
  text.addEventListener("blur", () => {
    if (!text.textContent.trim()) text.textContent = DEFAULT_TEXT;
  });

  reset.addEventListener("click", () => {
    state.italic = false;
    state.weight = 400;
    state.sizeTouched = false;
    text.textContent = DEFAULT_TEXT;
    applyRange();
  });

  applyRange();
  return { root, text, setRef: (px) => root.style.setProperty("--tt-ref", Math.max(1, Math.round(px))) };
}

// ---------------------------------------------------------------------------------------
export function init(app) {
  const section = document.querySelector("[data-typeface-wheel]");
  if (!section || section.dataset.twInit) return;
  section.dataset.twInit = "1";

  const { gsap, ScrollTrigger } = app;
  const stage = section.querySelector("[data-tw-stage]");
  const cards = [...section.querySelectorAll("[data-tw-card]")];
  const last = cards[N - 1];
  const copy = section.querySelector("[data-tw-copy]");
  const canvases = setupCanvases(section, app);
  const preview = canvases.list.find((cc) => cc.card === last);
  const tester = setupTester(section, app);

  const mm = gsap.matchMedia();
  // conditions object: the callback runs when any of them matches, so isSm must be listed too
  const conditions = {
    isSm: "(max-width: 767px)",
    isMd: "(min-width: 768px)",
    isRm: "(prefers-reduced-motion: reduce)",
  };
  mm.add(conditions, (ctx) => {
    const { isMd, isRm } = ctx.conditions;
    let W = 0;
    let H = 0;
    let box = 0;
    let R = 0;
    let cxStart = 0;
    let cxEnd = 0;
    let cy = 0;
    let step = 0;
    let finalW = 0;
    let finalH = 0;
    let u = 1;
    let uEnd = 1;
    let trig = null;
    let expanded = null;
    let first = true;

    // wheel geometry for the current stage size (all numbers from the spec)
    const measure = () => {
      W = stage.clientWidth;
      H = stage.clientHeight;
      box = isMd ? 0.7 * H : 0.8 * W; // square card
      R = isMd ? W : 1.3 * W; // wheel radius
      cxStart = isMd ? 0.6 * W : 0.5 * W; // wheel centre drifts left over the scroll
      cxEnd = 0.5 * W;
      cy = isMd ? H / 2 + R : H + 0.5 * R; // centre below the stage
      // angular spacing so neighbouring cards keep a 12 % gap along the rim
      step = (2 * Math.asin(Math.min(1, Math.max(-1, (1.12 * box) / (2 * R))))) / DEG;
      finalW = W - (isMd ? 60 : 30);
      finalH = Math.min(0.9 * H, isMd ? (9 / 16) * finalW : (16 / 9) * finalW);
      // the last card leaves the wheel when it reaches θ = 182° (just before upright)
      u = clamp01((225.2 + step * (N - 1) - 182) / 315.2);
      uEnd = u + (1 - u) / 0.7;
      trig = orbit(N - 1, u);
      tester.setRef(isRm ? stage.clientWidth * 0.9 : finalW);
    };

    // card i on the rim at progress p: base angle sweeps 225.2° → −90°
    const orbit = (i, p) => {
      const theta = lerp(225.2, -90, p) + step * i;
      const cx = lerp(cxStart, cxEnd, p);
      return {
        x: cx - Math.sin(theta * DEG) * R,
        y: cy + Math.cos(theta * DEG) * R,
        rotation: theta - 180,
      };
    };

    const setExpanded = (on, instant) => {
      if (expanded === on) return;
      expanded = on;
      last.style.pointerEvents = on ? "auto" : "none";
      tester.root.inert = !on;
      if (!on && tester.root.contains(document.activeElement)) document.activeElement.blur();
      const duration = instant ? 0 : 0.35;
      gsap.to(tester.root, { autoAlpha: on ? 1 : 0, duration, ease: "power2.out", overwrite: true });
      gsap.to(preview.canvas, { autoAlpha: on ? 0 : 1, duration, ease: "power2.out", overwrite: true });
      preview.enabled = !on; // the live DOM tester replaces the canvas preview
    };

    const layout = (p, dir, immediate) => {
      const k = power3Out(clamp01((p - u) / (uEnd - u)));
      cards.forEach((card, i) => {
        let pos = orbit(i, p);
        if (i === N - 1) {
          if (p >= u) {
            pos = {
              x: lerp(trig.x, W / 2, k),
              y: lerp(trig.y, H / 2, k),
              rotation: lerp(trig.rotation, 0, k),
              width: lerp(box, finalW, k),
              height: lerp(box, finalH, k),
            };
          } else {
            pos.width = box;
            pos.height = box;
          }
        }
        if (immediate) gsap.set(card, pos);
        // follow-through: the leading card answers in 80 ms, trailing ones lag 50 ms more each
        else
          gsap.to(card, {
            ...pos,
            duration: 0.08 + (dir === 1 ? i : N - 1 - i) * 0.05,
            ease: "power1.out",
            overwrite: true,
          });
      });
      gsap.set(copy, { autoAlpha: Math.max(0, 1 - 2 * k) });
      setExpanded(p >= u, immediate);
    };

    if (isRm) {
      // Reduced motion: no wheel. The copy and the tester (parked in the middle of the stage)
      // each get the stage to themselves and swap with a scroll-tied opacity crossfade at the
      // point where the wheel would expand the tester — the dark copy never sits on the card.
      gsap.set(cards.slice(0, -1), { autoAlpha: 0 });
      canvases.list.forEach((cc) => (cc.enabled = false));
      gsap.set(last, { left: "5%", top: "10%", width: "90%", height: "80%", clearProps: "transform" });
      setExpanded(true, true);
      const apply = (p) => {
        const a = smoothstep(u - 0.03, u + 0.03, p);
        gsap.set(copy, { autoAlpha: 1 - smoothstep(u - 0.1, u - 0.04, p) });
        gsap.set(last, { autoAlpha: a, pointerEvents: a > 0.5 ? "auto" : "none" });
        tester.root.inert = a <= 0.5;
        if (a <= 0.5 && tester.root.contains(document.activeElement)) document.activeElement.blur();
      };
      ScrollTrigger.create({
        trigger: section,
        start: "top bottom",
        end: "bottom bottom",
        invalidateOnRefresh: true,
        onRefresh: (self) => {
          measure();
          apply(self.progress);
        },
        onUpdate: (self) => apply(self.progress),
      });
    } else {
      // autoAlpha: undo the reduced-motion crossfade if the preference changed at runtime
      gsap.set(cards, { xPercent: -50, yPercent: -50, autoAlpha: 1 });
      ScrollTrigger.create({
        trigger: section,
        start: "top bottom",
        end: "bottom bottom",
        invalidateOnRefresh: true,
        onRefresh: (self) => {
          gsap.killTweensOf(cards);
          measure();
          gsap.set(cards.slice(0, -1), { width: box, height: box });
          layout(self.progress, 1, true);
          first = false;
        },
        onUpdate: (self) => {
          layout(self.progress, self.direction, first);
          first = false;
        },
      });
    }
    section.classList.add("is-ready");

    return () => {
      // non-GSAP state the context cannot revert by itself
      canvases.list.forEach((cc) => (cc.enabled = true));
      last.style.pointerEvents = "";
      tester.root.inert = true;
    };
  });

  canvases.start();
  revealCopy(section, app);
  if (import.meta.env.DEV) window.__tw = { canvases: canvases.list, tester };
}

// Title + text rise out of their line masks (shell's revealLines), once WebGL is compiled.
function revealCopy(section, app) {
  const targets = [section.querySelector("[data-tw-title]"), section.querySelector("[data-tw-text-copy]")];
  const opts = { trigger: section, start: "top 82%", yPercent: 110, duration: 0.9, ease: "power3.out" };
  const loaders = import.meta.glob("../core/reveal.js");
  const load = loaders["../core/reveal.js"];
  const fallback = {
    whenCompiled(fn) {
      if (app.state.compiled || app.state.webglFailed) fn();
      else {
        app.once("webgl:compiled", fn);
      }
    },
    revealLines(el, o) {
      if (app.mq.rm.matches) return;
      app.SplitText.create(el, {
        type: "lines",
        mask: "lines",
        linesClass: "line",
        autoSplit: true,
        onSplit: (s) =>
          app.gsap
            .timeline({ scrollTrigger: { trigger: o.trigger, start: o.start, toggleActions: "play none none none" } })
            .from(s.lines, { yPercent: o.yPercent, duration: o.duration, ease: o.ease, stagger: { amount: 0.075 * s.lines.length } }),
      });
    },
  };
  (load ? load().catch(() => fallback) : Promise.resolve(fallback)).then((mod) => {
    const api = mod.revealLines ? mod : fallback;
    const when = api.whenCompiled || fallback.whenCompiled;
    when(() => targets.forEach((el) => el && api.revealLines(el, opts)));
  });
}
