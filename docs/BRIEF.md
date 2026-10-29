# Khuê Văn — build brief

An ORIGINAL Vietnamese-language microsite about Vietnamese writing — from chữ Hán carved on the
82 doctoral steles of Văn Miếu – Quốc Tử Giám, through chữ Nôm (Truyện Kiều), to chữ Quốc ngữ —
that reproduces the **style and motion language** of michelangelus.studiogusto.com with our own
code, content, 3D and assets. Nothing from the reference site (code, fonts, models, textures,
images, copy) may be copied; we rebuild behaviour from the written specs.

* Reference specs (read the parts relevant to you — they hold the exact numbers):
  * `SPEC_MOTION` = /tmp/claude-1000/-run-media-thong-New-Volume-FE-DEMO/7716321b-e78a-4be5-bc29-f2a88e602935/scratchpad/spec/spec-sections-motion.md
  * `SPEC_WEBGL`  = /tmp/claude-1000/-run-media-thong-New-Volume-FE-DEMO/7716321b-e78a-4be5-bc29-f2a88e602935/scratchpad/spec/spec-webgl.md
  * Facts for copy = /tmp/claude-1000/-run-media-thong-New-Volume-FE-DEMO/7716321b-e78a-4be5-bc29-f2a88e602935/scratchpad/spec/facts-draft.md (use only "high" confidence facts)
  * Screenshots of the reference (1440×900, every 1500px of scroll): /tmp/claude-1000/-run-media-thong-New-Volume-FE-DEMO/7716321b-e78a-4be5-bc29-f2a88e602935/scratchpad/tools/shots/o1/s00.jpg … s24.jpg
  * The reference itself runs locally (read-only) at http://localhost:4300/
* Language: all visible copy in **Vietnamese** (correct diacritics, NFC). `<html lang="vi">`.
* Palette (keep the reference's duotone): `--color-primary #ff9cef` (hồng sen), `--color-secondary #5b74eb` (xanh chàm), plus #1a1a1a / #f5f5f5 / #edede9 / #fff / #000.
* Fonts (already in `public/fonts/`, SIL OFL): **EB Garamond** variable 400–800 roman + italic (`EBGaramond-VF.woff2`, `EBGaramond-Italic-VF.woff2`, CSS family `"EB Garamond"`), static TTFs for WebGL text (`EBGaramond-{Regular,Medium,Bold,ExtraBold,Italic,BoldItalic}.ttf`), and Hán subset **Noto Serif TC Han** (`NotoSerifTC-Han-{400,700}.{woff2,ttf}`, CSS family `"Noto Serif TC Han"`, only the characters in `src/data/han-chars.txt` — if you need another Hán character, say so in your final report instead of using it).
* Images (already in `public/images/`, licences in `src/data/credits.json`): khue-van-cac(.webp portrait), khue-van-cac-wide, khue-van-cac-wall, gieng-thien-quang, cong-van-mieu, bia-tien-si-35 (portrait), gia-dinh-bao-1866 (portrait), kim-van-kieu-tan-truyen (Nôm woodblock), truyen-kieu-trang, tu-dien-1651-dep-long (1651 dictionary crop, wide), tu-dien-1651-bao-gio (wide), doan-truong-tan-thanh (title pages, b/w line art).
* Glyph data: `src/data/glyphs.json` (categories, 120 toned vowels, font metrics).

## Stack & runtime (already scaffolded — do not change package.json)
Vite 6 (vanilla JS ES modules, `base: './'`), three **0.184** (`WebGLRenderer` + GLSL — NOT WebGPU/TSL),
gsap 3.15 (ScrollTrigger, SplitText, CustomEase, Flip… all in the `gsap` package), lenis 1.3,
troika-three-text 0.52. **No new dependencies.** Paths to public assets must be RELATIVE at runtime
(e.g. `new URL('fonts/x.ttf', document.baseURI)` or plain `"fonts/x.ttf"` / `"images/x.webp"`), never
starting with `/` (site is served under `/web-animation15/`). In CSS, `url(/fonts/…)` is fine (Vite rewrites).

Already written (contracts — read them, don't rewrite them):
* `vite.config.js` — `<!--#include src/partials/NAME.html-->` in index.html inlines partials (missing file → comment).
* `index.html` — page skeleton: `#webgl` canvas host, loader/header includes, `[data-scene-scroll-root]` with 6
  segments `[data-scene-scroll-segment="hero|stele|depth|paper|hands|text"]`, download/footer/follower/scrollbar includes.
* `src/main.js` — boot: loads every `src/styles/*.css` (filename order), lazily loads every `src/core/*.js`
  and `src/sections/*.js` and calls its exported `init(app)`; loads `src/webgl/index.js` and calls `init(app)`.
  Core modules init immediately; section modules after `document.fonts.ready`.
* `src/core/app.js` — the shared `app` object: `gsap, ScrollTrigger, SplitText, lenis, mq{sm,md,lg,rm,fine}, state{…}, pointer{x,y,nx,ny,x01,y01,moved}, on/once/emit`. Events:
  `fonts:ready`, `webgl:progress(p)`, `webgl:compiled`, `webgl:error(e)`, `reveal:start`, `reveal:done`,
  `scroll({scroll,limit,velocity,direction,progress})`, `resize({w,h})`, `nav:change(id)`.
* `src/styles/00-base.css` — design tokens, @font-face, typography classes `.t-huge .t-h1…h6 .t-large .t-body .t-menu .t-small .t-caption .t-overline .t-glyph` (mobile/≥768 sizes per SPEC_MOTION §1.5), `.container`, `.grid` (2/6/12 cols), `.spacer-2xl`, `.line-mask`, `.animated-gradient-border`, `.text-clip` + `.group-clip`, `.stroke-text`, `.sr-only`, `.han`, Lenis CSS, `#webgl` layer.

Extra shared state (add-on to app.state, no file change needed — just read/write these keys):
* `app.state.sceneProgress = { hero, stele, depth, paper, hands, text }` (0..1 each) and
  `app.state.transition = { from, to, progress }` — **written by webgl** on every Lenis scroll (SPEC_WEBGL §3.2 table, pixel based).
  The download pill reads `sceneProgress.text` (pill width `clamp01((p − 0.42)/0.5)`); if webgl failed it falls back to its own
  ScrollTrigger on the hands segment.
* `app.state.footerTextureOffset` — **written by shell** (footer ScrollTrigger: `progress × footerHeight / innerHeight`), read by webgl.

WebGL models API (contract between the `webgl` and `models` owners; Y-up, metres, `MeshStandardMaterial` white
`roughness 1 metalness 0`, every mesh `castShadow = receiveShadow = true` unless noted; pass `THREE` in so both use the same instance):
```js
// src/webgl/models/index.js
export function buildVanMieu(THREE, { quality = "high" } = {}) // → { group, anchors, dispose }
//   origin = centre of the Thiên Quang well at ground level. The entrance (Văn Miếu môn) is at +Z, then Đại Trung môn,
//   then the pavilion Khuê Văn Các just in front of the well; the stele houses flank the well on ±X; Đại Thành môn is
//   behind the well at −Z. Real layout (facts sheet A12–A13): five walled courtyards in a row along Z. anchors = { gate, daiTrungMon, khueVanCac, khueVanCacTop, pond, daiThanhMon,
//   steleLeft, steleRight, bounds /*THREE.Box3*/ } (THREE.Vector3s). Includes ground, perimeter walls, trees as simple masses,
//   2 × 41 steles on turtles (InstancedMesh). Background "sky dome" is NOT included (webgl owns it).
export async function buildSteleOnTurtle(THREE, { lines /* Hán strings, top→bottom columns */, title } = {}) // → { group, anchors: { face, top, base }, size: { w, h } }
//   one detailed stele (rounded/arched top with cloud-dragon crest relief, carved Hán columns via a canvas height map → normalMap),
//   on a stone turtle; awaits document.fonts.load('64px "Noto Serif TC Han"').
export function buildBrush(THREE) // → { group, tip /*Vector3*/, axis /*Vector3 pointing from tip to handle*/ }  calligraphy brush ≈1 m long
export function buildPen(THREE)   // → { group, tip, axis }  steel dip pen (nib + holder) ≈1 m long
export function khueVanCacElevationSVG() // → string: line drawing (black strokes, white bg) of the pavilion, viewBox "0 0 1440 950"
```

Breakpoints: sm <768, md ≥768, lg ≥1024, xl ≥1280. Respect `prefers-reduced-motion` (skip SplitText/parallax, as the spec says).

## File ownership (write ONLY your files; others are being written in parallel)
| owner | files |
|---|---|
| shell | `src/partials/{loader,header,hero,stele,sticky-text,hands,download,footer,scroll-follower,scrollbar}.html`, `src/core/*.js` except app.js, `src/styles/10-shell.css`, `public/favicon.svg` |
| webgl | `src/webgl/**` except `src/webgl/models/**` |
| models | `src/webgl/models/**` |
| wheel | `src/partials/typeface-wheel.html`, `src/sections/typeface-wheel.js`, `src/styles/20-typeface-wheel.css` |
| deck | `src/partials/poster-deck.html`, `src/sections/poster-deck.js`, `src/styles/30-poster-deck.css` |
| glyphset | `src/partials/glyphset.html`, `src/sections/glyphset.js`, `src/styles/40-glyphset.css` |

Each section module: `export function init(app) {…}` (idempotent; use `gsap.matchMedia()` for breakpoints/RM; gate scroll reveals on `app.state.compiled`/`webgl:compiled` like the reference does).
Shared helper owned by shell: `src/core/reveal.js` exporting
`revealLines(el, { trigger = el, start = "top bottom", yPercent = 100, duration = 0.8, ease = "power2.out", once = true })`
(SplitText lines + mask, stagger amount `0.075 × lines`, no-op under reduced motion) — others may import it; if it does not exist yet when you test, guard with a dynamic import.

## Section map (reference → ours)
Nav (5 anchors, `id="nav-anchor-X" data-nav="X"`): `nen-mong` "Nền móng" (hero segment) · `khao-cuu` "Khảo cứu" (depth segment) ·
`kieu-chu` "Kiểu chữ" (typeface wheel section) · `bo-ky-tu` "Bộ ký tự" (glyphset section) · `tai-ve` "Tải về" (hands segment).

| segment / section | reference | ours |
|---|---|---|
| loader | pink border stroke progress + 40-frame ScrambleChar flip-book + spinner | same; flip-book cycles Vietnamese letters with stacked diacritics (Ặ ỗ Ữ ẫ ơ Đ ư ằ ỡ ề …) and 4 Hán characters (文 廟 奎 賢), 9 style variants incl. outline `.stroke-text` |
| hero (600svh, empty) | drone over St Peter's + MSDF "MICHELANGELUS" | drone over a procedural **Văn Miếu – Quốc Tử Giám** (Khuê Văn Các, gates, Thiên Quang well, two rows of steles on turtles); 3D title **"KHUÊ VĂN"** |
| stele (100svh spacer + 2 paragraphs) | Pietà + "MMXXVI" + dust | one **stele on its stone turtle** with carved Hán text, incense-smoke particles; 3D title **"1484"** |
| depth (sticky-text 260lvh / lg 190lvh, nav khao-cuu) | colour depth photo + 4 parallax tiles | 2.5D **colour photo of Khuê Văn Các** (images/khue-van-cac.webp, synthetic depth); 4 archive tiles (Nôm woodblock, 1651 dictionary, Gia Định báo 1866, Truyện Kiều page) |
| paper: typeface wheel (700lvh, nav kieu-chu) | 4 videos on a wheel, last expands | 4 **live canvas typographic animations** on the wheel; the last one expands into a **type tester** |
| paper: poster deck (1100svh, pink) | "MICHEL / NGELUS" split at "A", 4 posters | **"KHU / VĂN"** — "KHUÊ VĂN" split at **Ê**, the deck of 4 Vietnamese posters stands in for the missing Ê |
| paper: glyphset (#1a1a1a, nav bo-ky-tu) | grid + inspector + weight dropdown | Vietnamese glyph groups from glyphs.json + a "Chữ Hán trên bia" group (Noto Serif TC Han) + inspector with metric lines incl. a Vietnamese **"Vùng dấu"** line (stacked-diacritic height) |
| hands (400svh, nav tai-ve) | Creation-of-Adam hands + "MICHELANGELUS" | a **calligraphy brush (bút lông)** reaching toward a **steel dip-pen nib (ngòi bút)** — Hán-Nôm meets Quốc ngữ; giant white **"QUỐC NGỮ"** |
| text (closing wall) | gradient + Sistine line drawing + Latin outline lines | gradient + 5% line drawing of Khuê Văn Các + outline lines from the 1442 stele: **"HIỀN TÀI LÀ NGUYÊN KHÍ CỦA QUỐC GIA"** etc. |
| download pill | "Download Michelangelus" | **"Tải bộ chữ EB Garamond"** → https://fonts.google.com/specimen/EB+Garamond (target _blank) |
| footer | black/white, partner logos | black: paragraph + links ("Nguồn ảnh & giấy phép" opens a credits dialog listing credits.json; "Cảm hứng thiết kế: Michelangelus — Studiogusto" → https://michelangelus.studiogusto.com/); white: 3 dashed-separated text marks "Văn Miếu · 1070", "Truyện Kiều · chữ Nôm", "Quốc ngữ · 1651" |

## Copy deck (Vietnamese; shell + section owners may polish wording but keep facts)
* Brand: **Khuê Văn** · payoff: "— Hồn chữ Việt, từ bia đá đến Quốc ngữ" · mobile payoff: "Hồn chữ Việt".
* Scroll follower: "Cuộn\nxuống". Skip link: "Bỏ qua, tới nội dung chính".
* Stele paragraph 1 (left) — eyebrow "Chữ khắc vào đá"; heading "Ở Văn Miếu, tên người đỗ đạt được khắc lên bia đá đặt trên lưng rùa, để nhiều thế kỷ sau vẫn còn người đọc."; body (italic) "Khuê Văn kể lại hành trình của chữ Việt: từ chữ Hán trên 82 tấm bia tiến sĩ, qua chữ Nôm của Truyện Kiều, đến chữ Quốc ngữ ta viết mỗi ngày — trình bày bằng một kiểu chữ serif có đủ dấu tiếng Việt."
* Stele paragraph 2 (right) — eyebrow "Từ nét khắc đến con chữ in"; heading "Mỗi dấu mũ, dấu móc, dấu thanh phải nằm đúng chỗ: đủ thoáng để không chạm dòng trên, đủ gần để vẫn thuộc về con chữ."; body "Những chữ như “ặ”, “ỗ”, “ữ” mang hai lớp dấu chồng lên nhau — phép thử khắt khe nhất cho bất kỳ kiểu chữ nào muốn nói được tiếng Việt."
* Sticky text (Khảo cứu) — title "Ba lớp chữ trên cùng một tiếng nói"; text "Chữ Hán là văn tự của triều đình và khoa cử. Chữ Nôm mượn, ghép các thành phần của chữ Hán để ghi âm tiếng Việt — thứ chữ đã chở Truyện Kiều của Nguyễn Du. Thế kỷ XVII, các giáo sĩ phương Tây dùng mẫu tự La-tinh ghi lại tiếng Việt; năm 1651, từ điển Việt – Bồ – La của Alexandre de Rhodes được in tại Rome. Phải gần ba thế kỷ sau, chữ Quốc ngữ mới trở thành chữ viết của mọi người."
* Typeface wheel (Kiểu chữ) — title "Một kiểu chữ, bốn giọng"; text "EB Garamond là bản phục dựng mã nguồn mở của dòng chữ Garamond thế kỷ XVI, có đủ bộ dấu tiếng Việt. Thường, nghiêng, đậm, đậm nghiêng — đủ cho sách, báo, văn bản và những dòng tiêu đề trang trọng."
* Poster deck — aria-label "Bộ sưu tập áp phích".
* Glyphset — title "BỘ KÝ TỰ"; text "Tiếng Việt viết bằng 29 chữ cái, 6 thanh điệu và một hệ dấu phụ dày đặc: 134 chữ cái mang dấu — hoa và thường — không có trong bảng chữ La-tinh cơ bản. Dưới đây là các nhóm ký tự cần cho một văn bản tiếng Việt hoàn chỉnh, cùng vài chữ Hán để nhớ những tấm bia đã khắc nên lịch sử chữ viết của chúng ta."; labels "Chọn độ đậm", "Ký tự đang chọn".
* Download pill — "Tải bộ chữ EB Garamond".
* Footer paragraph — "Khuê Văn là dự án trình diễn phi thương mại về lịch sử chữ Việt, làm để học kỹ thuật web. Kiểu chữ: EB Garamond và Noto Serif TC (SIL Open Font License 1.1). Ảnh tư liệu: Wikimedia Commons (CC0 và phạm vi công cộng)."; copy "© 2026 Khuê Văn".

## Testing (everyone)
* Run your own dev server: `cd "/run/media/thong/New Volume/FE_DEMO/khuevan" && npx vite --port <YOUR_PORT> --strictPort` in the background (shell 4410, webgl 4411, models 4412, wheel 4413, deck 4414, glyphset 4415). Kill only your own server at the end.
* Headless browser: Playwright 1.61 lives in /tmp/claude-1000/-run-media-thong-New-Volume-FE-DEMO/7716321b-e78a-4be5-bc29-f2a88e602935/scratchpad/tools/node_modules — put your scripts in a NEW subfolder of that tools dir so `import { chromium } from "playwright"` resolves. For **real GPU WebGL** launch with
  `args: ["--no-sandbox","--use-angle=vulkan","--enable-gpu","--ignore-gpu-blocklist","--enable-features=Vulkan","--autoplay-policy=no-user-gesture-required"]` (screenshots work with this; SwiftShader is too slow).
  Lenis drives scrolling: use `page.mouse.wheel` or `window.__app.lenis.scrollTo(y, {immediate:true})`.
* Look at your screenshots (Read the image file) and compare with the reference shots. Fix what looks wrong.
* Before finishing: zero console errors from your files at 1440×900 and 390×844, reduced-motion works, no horizontal page scroll on mobile.
* Other agents' files may be half-written while you test — if the page breaks because of someone else's file, ignore that error (don't edit their file) and keep testing your part.
* Final answer: a short report — what you built, files, how you verified (with screenshot paths), any known gaps.
