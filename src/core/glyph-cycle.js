// The 40-frame glyph cycle shared by the loader flip-book and the animated favicon:
// Vietnamese letters with stacked diacritics plus four Hán characters from the site's story
// (文 văn, 廟 miếu, 奎 khuê, 賢 hiền), each frame drawn in one of nine style variants.

// 37 glyphs — 37 is coprime with 7, so frame i → GLYPHS[(7i) mod 37] visits every glyph
export const GLYPHS = [
  "Ặ", "ỗ", "文", "Ữ", "ẫ", "ơ", "Đ", "ư", "廟", "ằ", "ỡ", "ề", "Ẩ", "ự", "奎", "ẵ", "Ở", "ệ", "ộ",
  "賢", "Ẳ", "ữ", "ẻ", "Ỗ", "ậ", "Ừ", "ẳ", "ỹ", "Ế", "ở", "Ẫ", "ừ", "Ỡ", "ặ", "Ề", "ỷ", "ố",
];
export const FRAME_COUNT = 40;

// nine style variants, picked by (5i) mod 9; "stroke" = outline like .stroke-text
export const VARIANTS = [
  { weight: 400, italic: false, upper: false, stroke: false },
  { weight: 700, italic: false, upper: false, stroke: false },
  { weight: 400, italic: true, upper: false, stroke: false },
  { weight: 400, italic: false, upper: true, stroke: false },
  { weight: 700, italic: true, upper: false, stroke: false },
  { weight: 400, italic: false, upper: false, stroke: true },
  { weight: 700, italic: false, upper: false, stroke: true },
  { weight: 400, italic: true, upper: false, stroke: true },
  { weight: 400, italic: false, upper: true, stroke: true },
];

export const isHan = (c) => /\p{Script=Han}/u.test(c);

// every face the cycle needs, as document.fonts.load() descriptors
export const FONT_LOADS = [
  '400 100px "EB Garamond"',
  '700 100px "EB Garamond"',
  'italic 400 100px "EB Garamond"',
  'italic 700 100px "EB Garamond"',
  '400 100px "Noto Serif TC Han"',
  '700 100px "Noto Serif TC Han"',
];

/** @returns {{ text: string, han: boolean, weight: number, italic: boolean, stroke: boolean }[]} */
export function glyphFrames() {
  const frames = [];
  for (let i = 0; i < FRAME_COUNT; i++) {
    const glyph = GLYPHS[(7 * i) % GLYPHS.length];
    const v = VARIANTS[(5 * i) % VARIANTS.length];
    const han = isHan(glyph);
    frames.push({
      text: v.upper ? glyph.toLocaleUpperCase("vi") : glyph,
      han,
      weight: v.weight,
      italic: v.italic && !han, // Hán has no italic; never fake one
      stroke: v.stroke,
    });
  }
  return frames;
}

// canvas font string for a frame
export const frameFont = (f, px) =>
  `${f.italic ? "italic " : ""}${f.weight} ${px}px ${f.han ? '"Noto Serif TC Han"' : '"EB Garamond"'}`;

// resolve when the faces are loaded, or after `timeout` ms — whichever comes first
export function loadCycleFonts(timeout = 1200) {
  const text = GLYPHS.join("") + GLYPHS.join("").toLocaleUpperCase("vi");
  return Promise.race([
    Promise.all(FONT_LOADS.map((f) => document.fonts.load(f, text))).catch(() => {}),
    new Promise((r) => setTimeout(r, timeout)),
  ]);
}
