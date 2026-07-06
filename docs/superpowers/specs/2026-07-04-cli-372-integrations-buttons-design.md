# CLI-372 — IntegrationsSettingsScreen Connect/Configure tugmalari no-op (Dizayn / Spec)

> **Sana:** 2026-07-04
> **Linear:** CLI-372 (Medium)
> **Scope:** `apps/web/src/features/settings/components/IntegrationsSettingsScreen.tsx:137-152`

---

## 1. Maqsad

`IntegrationsSettingsScreen` 4 ta integratsiya kartasi render qiladi (Eskiz SMS, Telegram bot, Soliq.uz fiskal, 1C eksport). Har bir karta holatiga qarab (`connected`) ikkita tugmadan birini ko'rsatadi: **«Sozlash»** (ulangan, `variant="outline"`) yoki **«Ulash»** (ulanmagan, primary rangda to'ldirilgan). Fayl ichidagi komment (13-23 qator) buni ochiq tan oladi: bu — qasddan scaffold, chunki maxfiy cred yig'ish + faollashtirish oqimi Faza 3'ga qoldirilgan.

Muammo: ikkala tugma ham **hech qanday `onClick`ga ega emas** va vizual jihatdan to'liq faol (enabled, primary-styled) ko'rinadi. Owner/Admin rol uchun bu — real, bosilsa ishlaydigan amal ko'rinishida, lekin bosilganda hech narsa sodir bo'lmaydi (silent no-op). DoD (ticket'dan): tugmalar kamida disabled holat yoki loyihaning mavjud «tez orada» ko'rsatkichiga mos tooltip/badge olishi kerak.

---

## 2. Tekshiruv — har bir qatorning holati

Fayl to'liq o'qildi (`IntegrationsSettingsScreen.tsx`, 161 qator). Barcha 4 karta (`CARDS` massivi, 33-60 qator) bitta umumiy JSX blokidan (81-155 qator) render qilinadi — per-karta shart yo'q, faqat `connected` bool bilan ikki tugma variantidan biri tanlanadi:

| Karta | `provider` maydoni | `connected` holati backend'dan real keladimi? | Connect/Configure tugma `onClick` bormi? |
|---|---|---|---|
| `eskiz` | `'eskiz'` | ✅ ha — `integrations.eskiz.enabled` (`GET /tenant-settings` → `integration_settings` JSONB) | ❌ yo'q |
| `telegram` | `'telegram'` | ✅ ha — `integrations.telegram.enabled` | ❌ yo'q |
| `soliq` | yo'q (`provider` undefined) | ❌ yo'q — komment tasdiqlaydi: "hali backend-tomondan boshqarilmaydi ... doimo «Ulanmagan»" | ❌ yo'q |
| `onec` | yo'q (`provider` undefined) | ❌ yo'q — xuddi shu sabab | ❌ yo'q |

**Xulosa: muammo barcha 4 kartaga bab-baravar tegishli.** `eskiz`/`telegram` uchun **status pill** (`StatusPill` — 121-126 qator) real backend holatini to'g'ri ko'rsatadi (bu qism ishlaydi, tuzatish shart emas) — lekin ularning Connect/Configure tugmalari ham xuddi `soliq`/`onec` kabi hech narsa qilmaydi, chunki cred-yig'ish/faollashtirish UI'si (modal, forma) umuman qurilmagan (Faza 3). Demak tuzatish **tugmaning o'ziga** (137-152 qator) tegishli, `connected`/`provider` shartiga bog'liq emas — ikkala tugma variant ham bir xil davolanadi.

---

## 3. Mavjud "coming soon" pattern — topildi va tekshirildi

Grep: `grep -rn "coming_soon" apps/web/src` → yagona ishlatilish joyi `apps/web/src/shell/Sidebar.tsx:212-223` (nav-item, `renderNavItem`-ga o'xshash funksiya ichida, kod bloki quyida):

```tsx
return (
  <span
    key={item.key}
    className={classes.item}
    aria-disabled="true"
    title={t('shell.coming_soon')}
  >
    <Icon />
    <span className={classes.label}>{label}</span>
    <span className={classes.soon}>{t('shell.coming_soon')}</span>
  </span>
);
```

`Sidebar.module.css`dagi `.soon` klassi (102-107 qator): kichik, mono shrift, uppercase, `letter-spacing`li badge — `margin-left: auto` bilan o'ng chetga suriladi; rail-rejimida (`[data-rail="true"] .soon`) yashiriladi.

**Muhim topilma: bu — qayta ishlatiladigan komponent EMAS.** `packages/ui` (`export * from './patterns'` / `'./primitives'` / `'./theme'`) ichida na `ComingSoonBadge`, na `Tooltip` wrapper mavjud (`find ... -iname "*tooltip*" -o -iname "*badge*"` — natija yo'q). Bu — inline JSX + CSS-Module pattern, faqat Sidebar ichida, faqat nav-item uchun (`<Link>` o'rniga `<span aria-disabled>`). U import qilib to'g'ridan-to'g'ri Buttonga qo'llab bo'lmaydi.

`shell.coming_soon` tarjima kaliti (`packages/i18n/src/locales/{uz,ru}.json:221`) generic va qayta ishlatishga mos:
- uz: `"coming_soon": "Tez orada"`
- ru: `"coming_soon": "Скоро"`

Kalit `shell` nomespace'ida joylashgan bo'lsa-da, matn semantik jihatdan umumiy ("Tez orada" / "Скоро") — `settings` nomespace'iga yangi dublikat kalit qo'shishga hojat yo'q, mavjud `shell.coming_soon` to'g'ridan-to'g'ri qayta ishlatiladi (i18n DRY, CLAUDE.md §5 "hech qachon hardcoded matn" qoidasiga mos, mavjud kalitni takrorlamaslik ham xuddi shu ruhda).

Repo bo'yicha `Tooltip` ishlatilishi qidirildi (`grep -rln "Tooltip" apps/web/src --include="*.tsx"`) — **natija: hech qayerda ishlatilmagan.** Demak Mantine `Tooltip` + `disabled` button kombinatsiyasi uchun loyihada oldindan o'rnatilgan konvensiya yo'q — Mantine'ning o'z rasmiy patternidan foydalanamiz.

---

## 4. Yondashuv — tanlangan yechim

**Mantine v7 `Tooltip` + `disabled` Button, `shell.coming_soon` kalitini qayta ishlatib.**

Sababi:
1. Sidebar'dagi `.soon` badge pattern komponentlashtirilmagan (CSS-module-bog'liq, faqat nav-item), uni Button ichiga ko'chirish real refactor bo'lardi — ticket doirasidan tashqari (scope: faqat shu 2 tugma qatori). Buning o'rniga **kontseptual pattern** (disabled holat + "tez orada" matni) qayta ishlatiladi, komponent emas.
2. Mantine `Button`ning `disabled` propi native `disabled` atributini qo'yadi → `pointer-events: none` → **`Tooltip` hover ishlamaydi**, agar `Button` to'g'ridan-to'g'ri `Tooltip`ning yagona farzandi bo'lsa (Mantine rasmiy hujjatlashtirilgan cheklov). Yechim — Mantine'ning tavsiya etgan wrapper pattern: `Tooltip` bolasi qilib disabled bo'lmagan `<span>` (yoki `<div style={{ display: 'inline-block' }}>`) qo'yiladi, `Button` shu `<span>` ichida joylashadi. Bu hover/tap eventlarini `<span>` orqali ilib oladi, `Button`ning o'zi hali ham to'g'ri `disabled` ko'rinadi (kulrang, bosilmaydigan).
3. `title` atributi (Sidebar patternidagi kabi) native brauzer tooltip bo'lib, styling/joylashuvga ega emas — Mantine `Tooltip` esa loyihaning mavjud dizayn tizimiga (border-radius, shadow, theme rang) mos chiqadi, chunki `MantineProvider` allaqachon global o'rnatilgan. Shu sabab `title` emas, `Tooltip` tanlandi (ikkalasi ham DoD "tooltip" so'zini qondiradi, lekin `Tooltip` — vizual jihatdan izchilroq).
4. `aria-disabled="true"` (Sidebar patternida ishlatilgan) o'rniga native `disabled` propi ishlatiladi, chunki bu — haqiqiy `<button>` elementi (Sidebar'da esa `<span>` edi, chunki u umuman `<button>`/`<Link>` emas edi — faqat vizual nav-item). Mantine `Button`ning o'z `disabled` propi to'g'ri semantik va vizual holatni (kulrang, cursor: not-allowed) bepul beradi.

**Aniq UI o'zgarish (`IntegrationsSettingsScreen.tsx:137-152`):**

```tsx
import { Button, Loader, Title, Tooltip } from '@mantine/core';
// ...

{connected ? (
  <Tooltip label={t('shell.coming_soon')}>
    <span style={{ alignSelf: 'flex-start' }}>
      <Button variant="outline" size="xs" disabled>
        {t('settings.integration_configure')}
      </Button>
    </span>
  </Tooltip>
) : (
  <Tooltip label={t('shell.coming_soon')}>
    <span style={{ alignSelf: 'flex-start' }}>
      <Button
        size="xs"
        disabled
        style={{
          background: 'var(--primary)',
          color: 'var(--on-primary)',
        }}
      >
        {t('settings.integration_connect')}
      </Button>
    </span>
  </Tooltip>
)}
```

Eslatma: `alignSelf: 'flex-start'` inline style hozir `Button`ning o'zida turibdi (flex container ichida grid item o'zini cho'zib yubormasligi uchun) — wrapper `<span>` qo'shilgach, bu style **wrapper `<span>`ga ko'chadi** (chunki endi flex-item — bevosita farzand — shu `<span>`), `Button`ning o'zida qolmaydi. Mantine `disabled` Button'da rangli `background`/`color` inline style xira ko'rinishga (`opacity` pasayishi Mantine CSS'i orqali) to'g'ri ta'sir qiladi — qo'shimcha o'zgarish shart emas.

**Rad etilgan muqobillar:**
- ❌ Faqat `disabled` (Tooltip'siz) — DoD "kamida disabled holat **yoki** tooltip/badge" deydi, ya'ni disabled yolg'iz ham DoD'ni texnik qondiradi. Lekin Owner/Admin uchun *nega* disabled ekanligi tushunarsiz qoladi (yana chalkashlik manbai) — shuning uchun Tooltip qo'shish arzon va foydali, DoD "kamida" so'zi minimal chegarani belgilaydi, kengroq yechimni taqiqlamaydi.
- ❌ Sidebar'dagi `.soon` badge'ni Button qatoriga component sifatida ko'chirish — ortiqcha refactor, ticket scope'idan tashqari (Sidebar ichidagi nav-item pattern boshqa DOM tuzilishiga mo'ljallangan: label + badge yonma-yon, Button esa bitta matn label).
- ❌ Yangi `settings.integration_coming_soon` tarjima kaliti qo'shish — `shell.coming_soon` matni allaqachon mos va generic, dublikat kalit DRY buzadi.

---

## 5. DoD

- [ ] `IntegrationsSettingsScreen.tsx`dagi ikkala Button variant (connected → «Sozlash», not-connected → «Ulash») `disabled` holatga ega.
- [ ] Ikkala Button `Tooltip` bilan o'ralgan, `label={t('shell.coming_soon')}` (mavjud kalit qayta ishlatilgan, yangi kalit qo'shilmagan).
- [ ] Hech qanday yangi hardcoded UI matn yo'q — barcha matn `t()` orqali.
- [ ] Mavjud `IntegrationsSettingsScreen.test.tsx` testlari (4 karta, status pill 1/3 split, tugma matn label'lari) hamon PASS bo'ladi — `disabled` atributi qo'shilishi tugma `role="button"`/`textContent`ga ta'sir qilmaydi.
- [ ] Yangi test qo'shilgan: kamida bitta tugma `disabled` ekanligini tasdiqlaydi (masalan `getAllByRole('button')` ichidan disabled ekanini tekshirish).
- [ ] `bun run typecheck` (yoki loyihaning standart typecheck komandasi `apps/web` uchun) toza.
