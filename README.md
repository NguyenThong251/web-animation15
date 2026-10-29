# web-animation15 — Khuê Văn

**🔴 Live demo: <https://nguyenthong251.github.io/web-animation15/>**

**Khuê Văn — Hồn chữ Việt, từ bia đá đến Quốc ngữ.** Một trang trình diễn tiếng Việt về hành trình chữ viết của người Việt: chữ Hán khắc trên 82 tấm bia tiến sĩ ở Văn Miếu – Quốc Tử Giám, chữ Nôm của Truyện Kiều, rồi chữ Quốc ngữ — trình bày bằng một kiểu chữ serif có đủ dấu tiếng Việt.

Đây là site **nguyên bản** (code, nội dung, mô hình 3D tự làm), mượn **phong cách chuyển động** của [Michelangelus — Studiogusto](https://michelangelus.studiogusto.com/) (bản clone 1:1 của site đó nằm ở [web-animation14](https://github.com/NguyenThong251/web-animation14)). Không dùng lại mã, font, mô hình, ảnh hay câu chữ của site gốc. Dự án phi thương mại, để học kỹ thuật web.

## Có gì trên trang

| Phần | Nội dung |
|---|---|
| Nền móng | Máy bay không người lái lượn trên **Văn Miếu – Quốc Tử Giám** dựng bằng code (Khuê Văn Các, cổng, giếng Thiên Quang, 82 bia trên lưng rùa), in **halftone hai màu** hồng sen / xanh chàm; chữ 3D "KHUÊ VĂN" mọc lên từng ký tự |
| Bia đá | Một tấm bia khắc chữ Hán trên lưng rùa, ánh đèn quay quanh, khói hương; "1484" — năm dựng những tấm bia đầu tiên |
| Khảo cứu | Ảnh màu 2.5D Khuê Văn Các + 4 tư liệu trôi lệch tầng: bản Nôm *Kim Vân Kiều tân truyện*, trang Truyện Kiều, từ điển Việt – Bồ – La 1651, Gia Định báo 1866 |
| Kiểu chữ | Bánh xe 4 thẻ hoạt hình canvas (dấu thanh rơi xuống nguyên âm, niên đại, độ đậm 400→800) — thẻ cuối nở ra thành **ô gõ thử chữ** |
| Áp phích | "KHU / VĂN" tách đôi, chồng 4 áp phích tiếng Việt thay cho chữ Ê |
| Bộ ký tự | Lưới ký tự (29 chữ cái, 120 nguyên âm mang dấu thanh, chữ số, dấu câu, ₫…, chữ Hán trên bia) + bảng đo có đường **"Vùng dấu"** cho dấu chồng |
| Tải về | Bút lông gặp ngòi bút sắt — Hán Nôm gặp Quốc ngữ; vòng sao mở ra bức tường chữ "HIỀN TÀI LÀ NGUYÊN KHÍ CỦA QUỐC GIA" / 賢材國家之元氣 (bia khoa 1442) |

## Kỹ thuật

- **Vite 6** (vanilla JS, `base: "./"` → chạy ở subpath GitHub Pages không cần rewrite)
- **three.js r184** — `WebGLRenderer`, 6 cảnh render ra render target riêng, **một shader tổng hợp GLSL**: halftone duotone, chuyển cảnh đẩy ngang/dọc, vòng sao 4 cánh, mô phỏng **vệt mực** theo con trỏ, hiệu ứng mở màn; mô hình 3D dựng thủ tục (procedural)
- **troika-three-text** — chữ SDF trong WebGL (đủ dấu tiếng Việt và chữ Hán)
- **GSAP 3** (ScrollTrigger, SplitText) + **Lenis** smooth scroll
- Font: **EB Garamond** (variable 400–800, roman + italic) và **Noto Serif TC** (cắt riêng các chữ Hán dùng trên trang) — SIL Open Font License 1.1, file giấy phép trong `public/fonts/`
- Ảnh tư liệu: Wikimedia Commons, **CC0** và **phạm vi công cộng** — danh sách đầy đủ trong `src/data/credits.json` và hộp thoại "Nguồn ảnh & giấy phép" ở chân trang
- Nội dung lịch sử được đối chiếu với nguồn (Văn Miếu – Quốc Tử Giám, hồ sơ UNESCO, bách khoa…) trước khi đưa lên

Kiến trúc và phân chia module: [`docs/BRIEF.md`](docs/BRIEF.md).

## Chạy local

```bash
npm install
npm run dev      # http://localhost:4400
npm run build    # → dist/
```

Thêm `?debug` vào URL để lộ `window.__app` (điều khiển Lenis khi test tự động).

## Deploy

GitHub Actions (`.github/workflows/deploy.yml`): `npm ci` → `npm run build` → đăng `dist/` lên GitHub Pages.
