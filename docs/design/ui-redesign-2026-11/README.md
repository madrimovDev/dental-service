# UI qayta dizayni — kanvas manbasi (2026-11-11)

Bu papka — claude.ai Design kanvasining (https://claude.ai/artifact/71dFMTtcyyMFE5yZhGSDZ3) **to'liq manba nusxasi**. Kanvas faqat egasiga ko'rinadi, shuning uchun kod yozadigan har bir sessiya yoki agent shu fayllardan foydalanadi.

- `canvas/canvas.json` — indeks: artboardlar, sahifalar (Asos, Registrator, Shifokor, Rahbar, Tashqi), o'lchamlar.
- `canvas/*.dc.html` — 24 ta artboard. Har biri — inline style'li HTML va pastdagi `renderVals()` ichidagi namuna ma'lumotlar.
- **Amalga oshirish spetsifikatsiyasi (nima, qayerda, qaysi tartibda):** [`../../superpowers/specs/2026-11-11-ui-redesign-design.md`](../../superpowers/specs/2026-11-11-ui-redesign-design.md).

Kanvas o'zgarsa, bu nusxani yangilang: Artifact `read` → `project/*` fayllarini shu yerga ko'chiring va commit qiling.
