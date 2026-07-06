# CLI-434 — Autentifikatsiyasiz LAN discovery + ixtiyoriy setServerUrl → evil-twin server

> Audit: AUDIT-2026-07-06.md · M21. Desktop-only (Electron). Asosan **qo'lda tasdiqlash** (Electron/Windows) — mantiq unit-testlanadi.

## 1. Muammo va ildiz sabab

Uch qatlamli hujum yuzasi (evil-twin: rogue LAN qurilma o'zini "Dental server" deb ko'rsatib klient credential/ma'lumotini o'g'irlaydi):

### (a) Autentifikatsiyasiz discovery
`apps/desktop/src/discovery.ts:85-95` — klient UDP broadcast (`255.255.255.255:47890`) yuboradi, **birinchi** `DENTAL_SERVER_v1:` prefiksli javobga ishonadi:
```ts
client.on('message', (msg) => {
  if (!text.startsWith(RESPONSE_PREFIX)) return;
  const { ip, port } = JSON.parse(text.slice(RESPONSE_PREFIX.length));
  done(`http://${ip}:${port}`);   // 89 — hech qanday auth/tasdiqlash
});
```
Server tomoni (discovery.ts:57-61) har `DENTAL_DISCOVER_v1` so'roviga IP/port bilan javob beradi — **umumiy sir yo'q, imzo yo'q**. LAN'dagi istalgan qurilma soxta javob yuborib klient'ни `http://<attacker>:<port>`'ga yo'naltiradi. `main.ts:243` `config.serverUrl || (await findServer())` → `openBrowser(serverUrl)` (main.ts:269) — privileged `preload.cjs`-li BrowserWindow attacker URL'ini yuklaydi.

### (b) `setServerUrl` validatsiyasiz
`apps/desktop/src/settings-ipc.ts:62-70` — renderer'dan kelgan `serverUrl`'ни `String(serverUrl)` qilib to'g'ridan-to'g'ri `writeConfig` + `checkConnection` qiladi. **Scheme/host tekshiruvi yo'q** — `file://`, `javascript:`, ixtiyoriy host qabul qilinadi.

### (c) BrowserWindow origin guard yo'q
`main.ts:127-141` `openBrowser` — `setWindowOpenHandler` bor (yangi oyna → tashqi brauzer, 133-136), lekin **`will-navigate` guard yo'q**. Yuklangan sahifa ichida `location = evil` yoki redirect asosiy oynani ixtiyoriy origin'ga olib ketishi mumkin — preload API'lari (`window.dentalDesktop`) o'sha origin'ga ochiq qoladi.

## 2. Dizayn qarori

### (a) Discovery javoblarini autentifikatsiya qilish YOKI foydalanuvchi tasdig'i
Ikki variant, ikkalasi ham qabul:
1. **Umumiy sir / imzolangan e'lon (tavsiya asosiy):** server javobiga HMAC qo'shiladi. Lekin klient va server bir xil sirni qayerdan oladi? Bitta-EXE'da build-time sir mumkin (`bun build --define`), lekin bu barcha o'rnatishlarда bir xil → LAN attacker ham build'dan chiqarib olishi mumkin. Shuning uchun sir **o'rnatishга xos** bo'lishi kerak — server first-run'da generatsiya qiladi, klient uni **birinchi ulanishда foydalanuvchi tasdig'i** bilan oladi (TOFU — trust on first use).
2. **Foydalanuvchi tasdig'i (tavsiya minimal, kamroq infra):** `findServer` bir nechta javobni yig'adi (birinchisiga sakramaydi), foydalanuvchiga topilgan serverlar ro'yxatini ko'rsatib **tanlashni/tasdiqlashni** so'raydi; tanlangan `serverUrl` config'ga yoziladi va keyingi startup'larda avto-ishlatiladi (qayta so'ramaydi).

**Qaror:** (2) **TOFU + foydalanuvchi tasdig'i** — minimal infra, evil-twin'ni to'xtatadi (attacker foydalanuvchini aldashi kerak, jim emas), va (1) HMAC'ni keyingi bosqichда qo'shish uchun ochiq qoldiradi. `findServer` `timeoutMs` davomida **barcha** javoblarni to'playdi (birinchisida `done` qilmaydi) va massiv qaytaradi.

- **Rad etilgan:** TLS + sertifikat — LAN self-hosted'da CA infrastrukturasi og'ir; keyingi bosqich.
- **Rad etilgan:** jim birinchi-javob (hozirgi) — evil-twin'ning aynan sababi.

### (b) `setServerUrl` scheme + host validatsiyasi
`serverUrl`: faqat `http:`/`https:` scheme; host — LAN/localhost allowlist (private IP diapazonlari `10.`, `192.168.`, `172.16-31.`, `127.`, `localhost`, yoki `*.local` mDNS). `file:`/`javascript:`/`data:` va public host rad etiladi → `{ ok:false, error:'INVALID_URL' }`.

### (c) BrowserWindow origin guard
`openBrowser`'da `mainWindow.webContents.on('will-navigate', ...)` — faqat joriy `serverUrl` origin'iga (yoki `/activate` kabi shu-origin yo'llarga) navigatsiyaga ruxsat; boshqa origin `event.preventDefault()` + `shell.openExternal`. `setWindowOpenHandler` allaqachon bor (main.ts:133) — `will-navigate` uni to'ldiradi.

## 3. Spec — xulq + qirra holatlar + test holatlari

### (a) `findServer` → `findServers`
- Qaytaradi: `Array<{ url: string; ip: string; port: number }>` (unikal, `timeoutMs` davomida yig'ilgan). Bo'sh massiv = topilmadi.
- `main.ts` klient oqimi: `config.serverUrl` bo'lsa uni ishlatadi (avval tasdiqlangan). Bo'lmasa `findServers()` → 0 ta → "Server topilmadi" tray (mavjud); 1+ ta → **tasdiqlash UI** (yoki bitta bo'lsa ham tasdiq), tanlangan URL `writeConfig` + `openBrowser`.
- **TOFU:** bir marta tasdiqlangach `config.serverUrl` yoziladi → keyingi startup'lar qayta so'ramaydi.

### (b) `setServerUrl` validatsiya
- `validateServerUrl(raw): { ok:true, url } | { ok:false, code }` — sof funksiya (unit-testlanadi).
- Ruxsat: `http(s)://<private-host-or-localhost-or-.local>[:port][/path]`.
- Rad: boshqa scheme, public host, parse xatosi.
- `registerSettingsIpc` handler validatsiyadan o'tmasa `writeConfig` **qilmaydi**, `{ ok:false, code }` qaytaradi.

### (c) `will-navigate`
- Joriy oyna origin'i = yuklangan `serverUrl` origin'i. Boshqa origin'ga `will-navigate` → prevent + external.

### Qirra holatlar
- **Ko'p server (legit multi + rogue)** — foydalanuvchi ro'yxatdan tanlaydi; jim birinchi-javob yo'q.
- **`config.serverUrl` allaqachon bor** — discovery o'tkazilmaydi (TOFU bajarilgan); lekin agar u endi validatsiyaдан o'tmasa (eski buzuq config) — rad etilib qayta tasdiqlashga tushadi.
- **Same-origin redirect** (login → /activate) — ruxsat.
- **checkConnection public host'ga** — validatsiya `checkConnection`'dan OLDIN, shuning uchun rogue public host'ga hatto health-check ham ketmaydi.

### Test holatlari
- `validateServerUrl`: `http://192.168.1.5:8000` ok; `http://localhost:8000` ok; `https://server.local` ok; `file:///etc/passwd` rad; `javascript:alert(1)` rad; `http://evil.com` rad; `http://8.8.8.8` rad (public IP).
- `registerSettingsIpc`: invalid URL → `writeConfig` chaqirilmaydi, `{ ok:false }`.
- `findServers`: ikki mock javob → ikkalasi ham massivda (birinchisiga sakramaydi); timeout'да bo'sh → `[]`.

## 4. Implementatsiya rejasi (TDD)

1. **Failing test** — `validateServerUrl` (yangi, hali yo'q) uchun testlar; `findServers` massiv qaytarishi uchun test (hozir `findServer` bitta string).
2. **Impl (b)** — `settings-ipc.ts`'ga `validateServerUrl` sof funksiya + `registerSettingsIpc`'da gate. (Sof mantiq — Linux'da to'liq unit-testlanadi.)
3. **Impl (a)** — `discovery.ts` `findServer` → `findServers` (massiv, barcha javob, dedupe). `main.ts` klient oqimini moslash + tasdiqlash UI (tray menyusi yoki oddiy `dialog`). ⚠️ **Electron — jismoniy PC'da qo'lda tasdiq.**
4. **Impl (c)** — `main.ts` `openBrowser`'ga `will-navigate` guard. ⚠️ **Electron — qo'lda tasdiq.**
5. **Verify** — `bun test apps/desktop/src/settings-ipc.test.ts` + `discovery.test.ts` yashil; `turbo typecheck`. Electron qismlari (a-UI, c-guard) — Linux E2E recipe (MEMORY: project_desktop_linux_run) yoki Windows PC'da qo'lda.

> **Manual-verification qismlar:** discovery tasdiqlash UI oqimi, `will-navigate` guard, IPC preload real BrowserWindow'da — Electron runtime. Sof funksiyalar (`validateServerUrl`, `findServers` parsing) Linux unit-test.

## 5. Migratsiya / rollout / xavflar

- **Migratsiya:** eski `config.serverUrl` (agar validatsiyaдан o'tmasa) qayta-tasdiqlashga tushadi — bir martalik UX, xavfsizlik uchun maqbul.
- **Xavf (UX):** tasdiqlash qadami legit yagona-server holatida ham so'raladi — birinchi marta; keyin jim (TOFU). Yagona server topilsa avto-tanlab faqat ma'lumot ko'rsatish ham mumkin (qaror: bitta bo'lsa avto, lekin config'ga yozib qayta so'ramaslik).
- **Xavf:** private-IP allowlist noto'g'ri LAN topologiyasini (masalan mijoz public-IP LAN) bloklashi mumkin — kam ehtimol (klinika ichki tarmoq); kerak bo'lsa allowlist kengaytiriladi.
- **Rollback:** validatsiya/guard'ni olib tashlash nuqsonni qaytaradi.

## 6. Qabul mezonlari

- [ ] `findServers` barcha javoblarni yig'adi, jim birinchi-javobga sakramaydi.
- [ ] Klient birinchi ulanishда serverni tasdiqlaydi; tasdiqlangach TOFU (qayta so'ramaydi).
- [ ] `setServerUrl` faqat http(s) + private/localhost/.local host qabul qiladi; boshqasi rad + `writeConfig` qilinmaydi.
- [ ] `will-navigate` boshqa origin'ni prevent + external.
- [ ] `validateServerUrl` + `findServers` unit-testlari yashil; typecheck toza.
- [ ] Electron oqimlari Windows/Linux-E2E'da qo'lda tasdiqlangan.

## 7. Ta'sirlangan fayllar

- `apps/desktop/src/settings-ipc.ts` — `validateServerUrl` + handler gate.
- `apps/desktop/src/discovery.ts` — `findServer` → `findServers` (massiv, barcha javob).
- `apps/desktop/src/main.ts` — klient oqimi (tasdiqlash UI, `findServers`), `openBrowser` `will-navigate` guard.
- `apps/desktop/src/settings-ipc.test.ts`, `discovery.test.ts` — yangi testlar (sof mantiq).
- (kelajak, ixtiyoriy) HMAC/imzolangan discovery e'lon — keyingi bosqich.
