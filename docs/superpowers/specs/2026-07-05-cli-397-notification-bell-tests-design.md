# CLI-397 — NotificationBell test coverage (Dizayn / Spec)

> **Sana:** 2026-07-05
> **Linear:** CLI-397 (Medium)
> **Scope:** yangi `apps/web/src/features/notifications/components/NotificationBell.test.tsx` — faqat test qo'shiladi, `NotificationBell.tsx`/`notifications.api.ts` o'zgarmaydi (characterization testing).

---

## 1. Muammo

`apps/web/src/features/notifications/components/NotificationBell.tsx` (162 qator) da hech qanday `.test.tsx` yo'q, lekin komponent bir nechta shartli mantiqqa ega:

- **Unread-count capping** (`NotificationBell.tsx:93`): `unreadCount > 99 ? '99+' : unreadCount` — Mantine `Indicator`'ning `label` prop'i.
- **Indicator `disabled`** (`NotificationBell.tsx:92`): `unreadCount === 0` bo'lsa Mantine `Indicator` badge Box'ini umuman render qilmaydi (`node_modules/@mantine/core/esm/components/Indicator/Indicator.mjs`: `!disabled && <Box>{label}</Box>`).
- **"Hammasini o'qilgan deb belgilash" tugma ko'rinishi** (`NotificationBell.tsx:115`): `unreadCount > 0 &&` — faqat unread bor bo'lsa render qilinadi, bosilganda `markAllRead.mutate()`.
- **Qator-bo'yicha o'qilgan/o'qilmagan branching** (`NotificationRow`, `NotificationBell.tsx:41`): `item.readAt === null` → `unread`. `data-unread={unread || undefined}` atributi, `fw={unread ? 600 : 400}`, unread bo'lsa `onClick`da `onRead(item.id)` chaqiriladi (`unread && onRead(item.id)` — qisqartuv, `readAt` bor bo'lsa hech narsa chaqirilmaydi).
- **Locale-aware sana formatlash** (`formatDate`, `NotificationBell.tsx:21-30`): `locale === 'ru' ? 'ru-RU' : 'uz-UZ'`, `Intl.DateTimeFormat` bilan `timeZone: 'Asia/Tashkent'`, `day/month/hour/minute: '2-digit'`, `hour12: false`.

`notifications.api.ts`dagi `useNotifications` (60s `refetchInterval`), `useMarkRead`, `useMarkAllRead` — bular hook-daraja (TanStack Query wrapper'lari); bu ticket ularni **to'g'ridan-to'g'ri test qilmaydi** — `NotificationBell.test.tsx` ularni mock qiladi (DoD "notifications.api.ts also untested" qismi shu orqali bilvosita qoplanadi: komponent ularning qaytargan `data`/`mutate` shaklidan qanday foydalanishini test qiladi, real HTTP/refetch-interval'ni emas — refetch-interval'ning o'zi alohida ticket bo'lishi mumkin, bu yerda scope emas).

## 2. Yondashuv

### 2.1 Test-setup konvensiyasi (mavjud kod bazasidan olindi)

- **Render helper:** `renderApp` (`apps/web/src/test-utils.tsx`) — `QueryClientProvider` + `MantineProvider` + `I18nextProvider` (real `i18n` singleton, `@/lib/i18n.ts`) + `MemoryRouter`ni o'raydi. Boshqa hamma feature-komponent testi shuni ishlatadi (masalan `OdontogramTab.test.tsx`, `QueueBoard.test.tsx`).
- **Hook mocking:** `notifications.api.ts` eksport qilgan `useNotifications`/`useMarkRead`/`useMarkAllRead` `vi.mock('../notifications.api.ts', () => ({...}))` bilan to'liq almashtiriladi — module-level mutable o'zgaruvchi (`mockData`) orqali har testda boshqa `data`/`unreadCount` in'ektsiya qilinadi. Bu naqsh `QueueBoard.test.tsx`da (`vi.mock('../queue.api', () => ({...}))`, mutable `queueData`) va `Topbar.test.tsx`da (`vi.mock('@/features/notifications/notifications.api.ts', () => ({ useNotifications: () => ({ data: { data: [], unreadCount: 0 }, isLoading: false }), useMarkRead: ..., useMarkAllRead: ... }))`) allaqachon ishlatilgan — **`Topbar.test.tsx` ayni shu uch hookni aynan shu nomlar bilan mock qilib ko'rsatgan**, shu bilan hook signature'lari tasdiqlangan.
- **Locale almashtirish:** `i18n.changeLanguage('ru')` / `i18n.changeLanguage('uz')` real `i18n` singleton'da (`@/lib/i18n.ts`) — `zod-error-map.test.ts` va global `test-setup.ts` shu usulni ishlatadi (`test-setup.ts` global `afterEach` YO'Q, lekin boshlang'ich holatni `void i18n.changeLanguage('uz')` bilan o'rnatadi; `zod-error-map.test.ts` o'z faylida `afterEach(() => i18n.changeLanguage('uz'))` bilan tozalaydi — shu naqsh takrorlanadi, boshqa test fayllariga sizib chiqmasligi uchun).
- **Tarjima matnlari** (`packages/i18n/src/locales/uz.json`/`ru.json`, `notifications` blok): `title: "Bildirishnomalar"/"Уведомления"`, `mark_all_read: "Hammasini o'qilgan deb belgilash"/"Отметить все как прочитанные"`, `empty: "Bildirishnomalar yo'q"/"Нет уведомлений"`. `shell.notifications: "Bildirishnomalar"/"Уведомления"` — bell `ActionIcon`ning `aria-label`i shu (`Topbar.test.tsx`da `screen.getByLabelText('Bildirishnomalar')` bilan tasdiqlangan).

### 2.2 Muhim texnik nuqta — Popover ochilishi async

`Popover.Dropdown` Mantine `Transition` komponenti orqali mount bo'ladi (`node_modules/@mantine/core/esm/components/Transition/Transition.mjs`). `env === "test"` bo'lsagina sinxron mount bo'ladi, lekin bu `env` — `MantineProvider`'ning `env` prop'idan keladi (`useMantineContext().env || "default"`), va `test-utils.tsx`dagi `<MantineProvider theme={mantineTheme}>` bu prop'ni bermaydi → default transition yo'li ishlaydi: `requestAnimationFrame` (2 marta) + `setTimeout(duration)` (default 250ms) orqali `transitionStatus` `"exited"` dan `"pre-entering"` → `"entering"` → `"entered"`ga o'tadi; `"exited"` bo'lmagan har qanday holatda children DOM'ga chiqadi. Demak popover bell bosilgandan keyin **darhol emas**, balki bir necha rAF/timeout tick'idan keyin DOM'da paydo bo'ladi.

**Xulosa:** popover ochilgandan keyingi har qanday assertion `screen.findByText(...)` yoki `waitFor(...)` (async, real timer bilan poll qiluvchi) orqali yozilishi kerak, `screen.getByText(...)` (sinxron) emas. `vi.useFakeTimers()` ishlatilmasin — Mantine `requestAnimationFrame` asosidagi ketma-ketlik real timer bilan ishlaydi va fake timer bilan qo'lda oldinga surish keraksiz murakkablik qo'shadi. `withinPortal` bo'lgani uchun dropdown kontenti `document.body`ga portal qilinadi, lekin RTL `screen` global `document.body`ni so'raydi — `container` chegarasidan tashqarida bo'lsa ham `screen.findByText` uni topadi.

### 2.3 CSS modul cheklovi

`apps/web/vitest.config.ts`da `test.css: false` — CSS/`.module.css` importlari bo'sh modulga aylanadi, ya'ni `classes.row`/`classes.unreadDot`/`classes.iconChip` kabi import qilingan class-nomlar test muhitida **ishlamaydi** (`className` bo'sh/undefined bo'ladi). Shu sababli:
- Qator unread/read holatini `classes.unreadDot`(CSS class) orqali emas, **`data-unread` atributi** orqali tekshirish kerak — bu oddiy JSX prop (`data-unread={unread || undefined}`), CSS'ga bog'liq emas, har doim render bo'ladi.
- Mantine `Indicator`'ning `disabled` xatti-harakati ham CSS'ga bog'liq emas — `!disabled && <Box>{label}</Box>` shart bevosita JS darajasida, shuning uchun `unreadCount === 0`da label matni umuman DOM'da yo'q (`screen.queryByText(...)` bilan tekshiriladi).
- Vizual og'irlik (`fw={unread ? 600 : 400}`) test qilinmaydi — CSS-bog'liq va past qiymatli; DoD buni talab qilmaydi.

### 2.4 Qamrab olinadigan real holatlar

1. **Unread-count capping** (`unreadCount`): `0` (badge yo'q), `5` (aynan "5"), `99` (aynan "99", "99+" emas — chegara holati), `100` va `150` (ikkalasi ham "99+").
2. **Mark-all-read ko'rinishi**: `unreadCount=0` → tugma yo'q; `unreadCount>0` → tugma bor, bosilganda `markAllRead.mutate()` chaqiriladi (parametrsiz, komponentda `() => markAllRead.mutate()`).
3. **O'qilgan/o'qilmagan farqi**: `readAt: null` qator — `data-unread="true"`, bosilganda `markRead.mutate(id)` chaqiriladi; `readAt: <ISO string>` qator — `data-unread` atributi yo'q, bosilganda `markRead.mutate` umuman chaqirilmaydi.
4. **uz/ru sana formatlash**: bir xil ISO sana (`Asia/Tashkent` TZ) `i18n.language === 'uz'`da `uz-UZ` formatida, `'ru'`da `ru-RU` formatida render qilinadi. Kutilgan matn test ichida **komponentning xuddi shu `Intl.DateTimeFormat` chaqiruvi bilan** (`timeZone`/`day`/`month`/`hour`/`minute`/`hour12` bir xil options) hisoblanadi — literal string hardcode qilinmaydi (Node ICU versiyasiga bog'liq bo'lib qolmaslik uchun), lekin `formatDate` funksiyasi eksport qilinmagani uchun test o'z ichida bir xil options bilan mustaqil hisoblaydi (tautologiya emas — chunki asosiy tekshiruv shu ikki hisoblangan qiymatning **bir-biridan farqli** ekanini tasdiqlash, ya'ni `locale === 'ru' ? 'ru-RU' : 'uz-UZ'` shoxobchasi haqiqatan ishlatilishini isbotlash).

## 3. DoD

- [ ] Yangi `apps/web/src/features/notifications/components/NotificationBell.test.tsx` — `renderApp` orqali, `../notifications.api.ts` mock qilingan holda.
- [ ] Capping: `0`, `5`, `99`, `100`, `150` — kamida shu 5 holat, `99+` faqat `>99`da paydo bo'lishi tasdiqlangan.
- [ ] Mark-all-read tugmasi `unreadCount===0`da yo'q, `unreadCount>0`da bor va bosilganda `markAllRead.mutate()` chaqiriladi.
- [ ] `readAt===null` qator `data-unread` bilan belgilangan va bosilganda `markRead.mutate(id)` chaqiradi; `readAt` bor qator belgilanmagan va bosilganda hech narsa chaqirmaydi.
- [ ] uz va ru locale uchun sana formatlash tekshirilgan (ikkala format ko'rsatiladi va bir-biridan farq qiladi).
- [ ] `bunx vitest run apps/web/src/features/notifications/components/NotificationBell.test.tsx` — barcha testlar yashil.
- [ ] Mavjud testlar (`Topbar.test.tsx` va boshqalar) buzilmaydi — `notifications.api.ts` mock faqat shu yangi test faylida, global emas.
- [ ] Agar biror test komponentning haqiqiy xatti-harakati **noto'g'ri** ekanini fosh qilsa (masalan capping off-by-one) — testni "to'g'ri" deb moslashtirmasdan, muammoni ochiq qoldirish (yangi ticket/flag), chunki bu ticket faqat test yozish uchun, bugfix uchun emas.
