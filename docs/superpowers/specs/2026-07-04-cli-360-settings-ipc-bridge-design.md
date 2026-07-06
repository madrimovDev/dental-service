# CLI-360 — Settings sahifasi Electron IPC `setServerUrl()` ko'prigi (Dizayn / Spec)

> **Sana:** 2026-07-04
> **Linear:** CLI-360 (Medium)
> **Scope:** `apps/web/src/features/settings/components/IntegrationsSettingsScreen.tsx`ga qo'lda server URL kiritish + Electron IPC chaqirish UI'ni qo'shish.

---

## 1. Maqsad

Electron tarafi (`apps/desktop/src/settings-ipc.ts` + `apps/desktop/src/preload.cts`) allaqachon tayyor — `window.dentalDesktop.setServerUrl(url)` orqali serverUrl'ni `config.ts`ga yozadi va ulanishni tekshiradi. Lekin web `/settings` sahifasida bu ko'prikka murojaat qiluvchi UI yo'q. Klient rejimida (Local Desktop, CLI-338) server LAN broadcast orqali topilmasa yoki noto'g'ri bo'lsa, foydalanuvchi qo'lda server manzilini kiritib qayta ulanish imkoniga ega bo'lishi kerak.

`apps/desktop/src/main.ts` va `settings-ipc.ts` ichidagi kommentariyalar bu ishni aniq "apps/web doirasi tashqarisida, follow-up" deb belgilagan — CLI-360 shu follow-up'ni yopadi.

---

## 2. Topilgan aniq shartnoma (o'zgartirilmaydi, faqat iste'mol qilinadi)

**`apps/desktop/src/settings-ipc.ts`:**
```ts
export const SET_SERVER_URL_CHANNEL = 'dental:set-server-url';

export interface SetServerUrlResult {
  ok: true;
  connected: boolean;
  serverUrl: string;
}
```
Handler xatti-harakati (`registerSettingsIpc`, `settings-ipc.test.ts`dan tasdiqlangan):
- `writeConfig({ serverUrl })` **har doim** chaqiriladi (ulanish natijasidan qat'i nazar) — config baribir saqlanadi.
- `checkConnection(url)` (default: `GET ${url}/api/health`, 3s timeout) natijasi `connected` maydoniga yoziladi.
- Promise **hech qachon reject qilmaydi** — har doim `{ ok: true, connected: boolean, serverUrl: string }` bilan `resolve` bo'ladi. `connected: false` — "ulanmadi" holati, XATO EMAS (bu — muvaffaqiyatli config-yozish + muvaffaqiyatsiz health-check).

**`apps/desktop/src/preload.cts`:**
```ts
contextBridge.exposeInMainWorld('dentalDesktop', {
  setServerUrl: (serverUrl: string) => ipcRenderer.invoke(SET_SERVER_URL_CHANNEL, serverUrl),
});
```
→ Renderer'da `window.dentalDesktop.setServerUrl(url): Promise<SetServerUrlResult>`.

⚠️ **`SetServerUrlResult` tipi apps/web'ga import qilinmaydi** — `apps/desktop` va `apps/web` alohida TS project (`apps/desktop` Node/Electron target, `apps/web` DOM/Vite target), workspace paket sifatida ulanmagan. Web tomonda **shakl mustaqil ravishda takrorlanadi** (structural typing, xuddi `preload.cts` `settings-ipc.ts`dan import qilmagani kabi — bir xil qaror ikkinchi marta qo'llanadi).

---

## 3. Yondashuv

### 3.1 Joylashuv

Yangi bo'lim **`IntegrationsSettingsScreen.tsx`**ning tepasiga (mavjud 4-karta grid'idan oldin) — chunki bu "integratsiya/ulanish" mavzusiga tegishli, alohida yangi ekran/route ochish ortiqcha (DoD buni aniq ko'rsatgan: "yoki mos ekran", lekin `IntegrationsSettingsScreen` eng mos joy, chunki `SettingsShell active="integrations"` allaqachon shu yerda).

Yangi komponent: `DesktopServerConnectionCard` — o'zi alohida fayl (`apps/web/src/features/settings/components/DesktopServerConnectionCard.tsx`), `IntegrationsSettingsScreen` uni import qilib grid'dan oldin render qiladi. Ajratish sababi: (a) test alohida yoziladi (Electron mavjud/yo'q holatlarini mock qilish kartalar bilan aralashmaydi), (b) `IntegrationsSettingsScreen.test.tsx` mavjud testlari (4 karta, statuslar) buzilmasin — yangi bo'lim shu fayl DOM tuzilishiga tegmaydi (grid ustidagi alohida qism).

### 3.2 `window.dentalDesktop` mavjudligini aniqlash

```ts
const isDesktop = typeof window !== 'undefined' && Boolean(window.dentalDesktop);
```

- Brauzer buildida (`apps/web` standalone, SaaS mijozlar) `window.dentalDesktop` **`undefined`** — komponent **umuman render qilinmaydi** (`null` qaytaradi). Bu — global constraint (§5), chunki mavjud brauzer-based testlar (`IntegrationsSettingsScreen.test.tsx`, `renderApp` helper — jsdom, `window.dentalDesktop` yo'q) buzilmasligi kerak.
- TypeScript uchun global tur e'loni kerak — `window.dentalDesktop` hech qayerda deklaratsiya qilinmagan (`grep dentalDesktop` faqat `apps/desktop`da natija berdi). Yangi fayl: `apps/web/src/types/electron-desktop.d.ts` — `declare global { interface Window { dentalDesktop?: {...} } }` (§4.1 Task 1'da aniq kod).

### 3.3 UI holatlar

Mantine `TextInput` (serverUrl, controlled state — `@mantine/form` shart emas, bitta maydon, validatsiya zod orqali emas oddiy required-check bilan) + `Button` ("Ulash"):

| Holat | Ko'rinish |
|---|---|
| Boshlang'ich | Input bo'sh (yoki joriy config'dan oldindan to'ldirilgan — **YO'Q**, chunki web tarafda joriy `serverUrl`ni o'qish uchun IPC kanali mavjud emas, scope tashqarisida — foydalanuvchi qo'lda kiritadi) |
| Yuborilmoqda | Button `loading` prop, input `disabled` |
| `connected: true` | Yashil (`color="green"` yoki mavjud `StatusPill status="success"`) muvaffaqiyat xabari + `notifications.show({ color: 'teal'/default })` |
| `connected: false` | Sariq/qizil ogohlantirish — "Config saqlandi, lekin serverga ulanib bo'lmadi" (ANIQ farqlanadi "so'rov xato berdi"dan) |
| Promise reject (kutilmagan, masalan IPC o'zi throw qilsa) | Qizil xato — umumiy "Xatolik yuz berdi" |

`SetServerUrlResult.ok` doim `true` (interfeys shart qiladi) — shuning uchun `ok` maydoni UI branching uchun ishlatilmaydi, faqat `connected` ishlatiladi. `ok` faqat tip-darajasida "muvaffaqiyatli invoke bo'ldi" belgisi.

### 3.4 i18n kalitlar (yangi, `settings.*` ostida — mavjud `integration_*` konvensiyasiga mos)

Mavjud namuna (`uz.json`/`ru.json` `settings` obyekti ichida, flat key, prefiks `integration_`):
```
integration_connect => "Ulash" / "Подключить"
integration_status_connected => "Ulangan" / "Подключено"
```

Yangi kalitlar (prefiks `desktop_server_` — mavjud `integration_*`dan ajratiladi, chunki bu backend `integration_settings`ga bog'liq emas, Electron-only mahalliy holat):
- `settings.desktop_server_title`
- `settings.desktop_server_desc`
- `settings.desktop_server_url_label`
- `settings.desktop_server_url_placeholder`
- `settings.desktop_server_connect_button`
- `settings.desktop_server_connecting`
- `settings.desktop_server_success` (connected:true)
- `settings.desktop_server_saved_not_connected` (connected:false)
- `settings.desktop_server_error` (reject / kutilmagan xato)
- `settings.desktop_server_url_required` (bo'sh input validatsiyasi)

Aniq JSON diff — Task 2 (`docs/superpowers/plans/2026-07-04-cli-360-settings-ipc-bridge.md`).

---

## 4. Global constraint

1. **Brauzer/web-only buildda hech narsa render/error qilmasligi kerak.** `window.dentalDesktop` yo'q bo'lganda komponent `null` qaytaradi — mavjud `IntegrationsSettingsScreen.test.tsx` (jsdom, `dentalDesktop` yo'q) 100% ilgarigidek o'tishi shart, DOM'ga hech narsa qo'shilmaydi.
2. **`SetServerUrlResult` promise hech qachon reject qilmaydi (real Electron muhitida)** — lekin test-safety uchun component `try/catch` bilan yozilishi kerak (IPC transport xatosi nazariy jihatdan sodir bo'lishi mumkin, `ipcRenderer.invoke` Electron docs bo'yicha ba'zi holatlarda reject qiladi).
3. **Mavjud i18n fayllar strukturasi buzilmaydi** — yangi kalitlar `settings` obyekti ichiga, alifbo/joylashuv tartibiga rioya qilinmaydi (mavjud fayl allaqachon tartiblanmagan, oxiriga qo'shish yetarli).
4. **`@mantine/form` majburiy emas** bu holatda (RFC-0010 forma konvensiyasi asosan validatsiyali ko'p-maydonli formalar uchun; bitta required-text-input + submit uchun oddiy `useState` yetarli va boshqa loyihada — masalan agar kelajakda `PermissionBuilder.tsx` kabi joyларда oddiy input holatlari useState bilan yozilgan bo'lsa shu pattern davom etadi). **Agar reviewer buni zid deb topsa** — muqobil: `@mantine/form` + `zod4Resolver` bitta `z.string().url()` schema bilan ham qabul qilinadi (ikkala variant DoD'ni qanoatlantiradi, plan minimal useState variantini tanladi).

---

## 5. DoD (ticket'dan, aniqlashtirilgan)

- [ ] `IntegrationsSettingsScreen.tsx` (yoki undan chaqiriladigan yangi `DesktopServerConnectionCard.tsx`) server URL input + "Ulash" tugmasi qo'shadi.
- [ ] Faqat Electron muhitida ko'rinadi — `window.dentalDesktop` mavjudligi tekshiriladi, aks holda komponent `null` (brauzer buildda UI'da iz qoldirmaydi).
- [ ] `window.dentalDesktop.setServerUrl(url)` chaqiriladi, natija (`{ok, connected, serverUrl}`) asosida muvaffaqiyat/ogohlantirish/xato holati aniq ko'rsatiladi (3 holat: connected, saved-but-not-connected, error).
- [ ] Yangi i18n kalitlar `uz.json` + `ru.json` ikkalasiga qo'shiladi.
- [ ] Vitest + Testing Library bilan qoplangan: (a) `window.dentalDesktop` yo'qligida render qilinmasligi, (b) mavjud bo'lganda input+button ko'rinishi, (c) submit → mock `setServerUrl` chaqirilishi to'g'ri argument bilan, (d) `connected:true`/`false`/reject uch holat uchun to'g'ri xabar.
- [ ] Mavjud `IntegrationsSettingsScreen.test.tsx` testlari o'zgarishsiz yashil qoladi.
