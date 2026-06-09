# RFC-0008: Notifications (kanal abstraksiya + Eskiz)

- **Status:** Accepted (STUB — yo'nalish)
- **Sana:** 2026-06-09
- **Bog'liq:** CONCEPT.md §4.6, [`docs/design-architecture-gap-analysis.md`](../design-architecture-gap-analysis.md), R4 (CLI-71), Linear CLI-91

> ⚠️ **STUB** — R4. Faqat yo'nalish; to'liq dizayn R4 da.

## Kontekst

Dizaynda topbar **qo'ng'iroq ikonkasi** (in-app bildirishnoma) + **SMS eslatma**. CONCEPT.md'da `NotificationChannel` abstraksiyasi belgilangan (SmsChannel/Eskiz Phase 1, TelegramChannel Phase 2). Hozir faqat auth'da **mock OTP** bor; real kanal yo'q.

## Yo'nalish

### Kanal abstraksiya (CONCEPT.md'ga sodiq)
```ts
interface NotificationChannel { send(user, message): Promise<NotificationResult>; }
```
- **SmsChannel (Eskiz)** — real integratsiya (auth mock OTP ham Eskiz'ga o'tadi).
- **TelegramChannel** — Phase 2.
- `NotificationService` — foydalanuvchining afzal kanaliga yuboradi (Telegram > SMS, dublikatsiyasiz).

### In-app bildirishnomalar (topbar bell)
- `notifications` jadval — tenant, user, type, payload (JSON), channel, status, read_at. In-app ko'rsatish + log.
- O'qilmagan soni (badge), o'qilgan deb belgilash.

### Yuborish (async)
- **BullMQ** (stack'da bor) — rejalashtirilgan/async yuborish: yozilish eslatmasi (vizit oldidan), no-show, lab deadline.

### Manba hodisalar (event catalog — R4 da to'ldiriladi)
Yozilish eslatma, no-show ogohlantirish, lab deadline, kassa/balans hodisalari, tizim xabarlari.

## Ochiq savollar (R4)

- Hodisa katalogi (qaysi event → qaysi kanal/shablon).
- Shablon boshqaruvi (uz/ru, per-tenant).
- Foydalanuvchi afzalliklari (qaysi kanal, opt-out).
- Eskiz API tafsilotlari (rate limit, narx, delivery status).

## Holat

STUB **Accepted-as-direction** — kanal abstraksiya + in-app jadval + BullMQ yo'nalishi tasdiqlanadi; tafsilot R4 da.
