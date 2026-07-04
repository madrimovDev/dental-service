# CLI-398 Frontend Test-Quality Bundle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tuzatish 4 ta mustaqil, kichik test-sifat/i18n nuqsonini `apps/web`da (Linear CLI-398, round-2 audit): (1) ikkita test hardcoded tarjima matniga bog'langan; (2) `DesktopServerConnectionCard`da "ulanmoqda..." i18n kaliti hech qayerda render qilinmaydi va in-flight holat testlanmagan; (3) `IntegrationsSettingsScreen.test.tsx`da test nomi tooltip'ni tekshirishni da'vo qiladi, lekin tekshirmaydi; (4) `PosPanel.tsx`da ortiqcha inline i18n default sibling chaqiruvdan farq qiladi.

**Architecture:** Har bir task alohida fayl(lar)ga tegadi, bir-biriga bog'liq emas — parallel yoki istalgan tartibda bajarilishi mumkin. To'liq dizayn asoslash: `docs/superpowers/specs/2026-07-05-cli-398-frontend-test-quality-bundle-design.md`.

**Tech Stack:** React, vitest, `@testing-library/react`, react-i18next.

## Global Constraints

- Faqat `apps/web` ichida (source + test); backend/i18n locale fayllarga **hech qanday o'zgarish kerak emas** (barcha ishlatiladigan kalitlar allaqachon uz/ru'da mavjud).
- Hardcoded assertsiyalarni almashtirishda faqat kodbazada allaqachon ishlatilayotgan naqshga ergashiladi: `i18n.t(key)` (`@/lib/i18n.ts`dan import), `IntegrationsSettingsScreen.test.tsx:15` va `DesktopServerConnectionCard.test.tsx`dagi mavjud chaqiruvlar bilan bir xil.
- Har task tugagach: `bun test` (yoki `vitest run`) tegishli fayl(lar) uchun yashil + `bun run typecheck` (yoki loyihaning mos `turbo`/`bun --filter @dental/web` buyrug'i) toza bo'lishi shart, keyin commit.
- Har task o'z commitiga ega (4 ta kichik, mustaqil commit) — bitta katta commit qilinmaydi.

---

### Task 1: WaitlistCard.test.tsx va select-workspace.page.test.tsx — hardcoded matn o'rniga `i18n.t()`

**Files:**
- Modify: `apps/web/src/features/appointments/components/WaitlistCard.test.tsx:26`
- Modify: `apps/web/src/features/auth/pages/select-workspace.page.test.tsx:46`

- [ ] **Step 1: Assertsiyalarni tuzatish**

  `WaitlistCard.test.tsx` — import qatoriga `i18n` qo'shiladi va assertsiya o'zgartiriladi:
  ```tsx
  // Before (imports, 1-4-qator):
  import { screen } from '@testing-library/react';
  import { describe, expect, it } from 'vitest';
  import { renderApp } from '../../../test-utils';
  import { WaitlistCard } from './WaitlistCard';

  // After:
  import { screen } from '@testing-library/react';
  import { describe, expect, it } from 'vitest';
  import { i18n } from '@/lib/i18n.ts';
  import { renderApp } from '../../../test-utils';
  import { WaitlistCard } from './WaitlistCard';
  ```
  ```tsx
  // Before (25-26-qator):
    expect(screen.getByTestId('waitlist-coming-soon')).toBeInTheDocument();
    expect(screen.getByTestId('waitlist-coming-soon')).toHaveTextContent('Tez orada');

  // After:
    expect(screen.getByTestId('waitlist-coming-soon')).toBeInTheDocument();
    expect(screen.getByTestId('waitlist-coming-soon')).toHaveTextContent(
      i18n.t('shell.coming_soon'),
    );
  ```

  `select-workspace.page.test.tsx` — import qatoriga `i18n` qo'shiladi va assertsiya o'zgartiriladi:
  ```tsx
  // Before (1-4-qator):
  import { screen } from '@testing-library/react';
  import { describe, expect, it, vi } from 'vitest';
  import { renderApp } from '../../../test-utils';
  import { SelectWorkspacePage } from './select-workspace.page';

  // After:
  import { screen } from '@testing-library/react';
  import { describe, expect, it, vi } from 'vitest';
  import { i18n } from '@/lib/i18n.ts';
  import { renderApp } from '../../../test-utils';
  import { SelectWorkspacePage } from './select-workspace.page';
  ```
  ```tsx
  // Before (43-48-qator):
    renderApp(<SelectWorkspacePage />);

    expect(screen.getByText('Egasi')).toBeInTheDocument();
    expect(screen.queryByText('Owner')).not.toBeInTheDocument();

  // After:
    renderApp(<SelectWorkspacePage />);

    expect(screen.getByText(i18n.t('auth.select_workspace.owner_badge'))).toBeInTheDocument();
    expect(screen.queryByText('Owner')).not.toBeInTheDocument();
  ```
  (`queryByText('Owner')` literal string sifatida qoladi — bu qasddan "literal inglizcha 'Owner' emasligini" tekshiradi, tarjima kalitiga bog'lanmasligi kerak.)

- [ ] **Step 2: Testlarni ishga tushirib tasdiqlash**
  ```bash
  cd apps/web && bun run test -- WaitlistCard.test.tsx select-workspace.page.test.tsx
  ```
  Ikkala test yashil bo'lishi kerak (xulq o'zgarmadi — faqat assertsiya manbai).

- [ ] **Step 3: Commit**
  ```
  test(web): assert i18n.t() output instead of hardcoded uz strings (CLI-398)
  ```

---

### Task 2: `DesktopServerConnectionCard` — in-flight "ulanmoqda..." holatini ulash + test

**Files:**
- Modify: `apps/web/src/features/settings/components/DesktopServerConnectionCard.tsx`
- Modify: `apps/web/src/features/settings/components/DesktopServerConnectionCard.test.tsx`

- [ ] **Step 1: Komponentga in-flight matnni ulash**

  `DesktopServerConnectionCard.tsx` — `Button` bolasi (68-75-qator):
  ```tsx
  // Before:
      <Button
        size="xs"
        style={{ alignSelf: 'flex-start' }}
        loading={isSubmitting}
        onClick={handleConnect}
      >
        {t('settings.desktop_server_connect_button')}
      </Button>

  // After:
      <Button
        size="xs"
        style={{ alignSelf: 'flex-start' }}
        loading={isSubmitting}
        onClick={handleConnect}
      >
        {isSubmitting
          ? t('settings.desktop_server_connecting')
          : t('settings.desktop_server_connect_button')}
      </Button>
  ```
  Locale fayllarga **hech qanday o'zgarish kerak emas** — `settings.desktop_server_connecting` kaliti `uz.json:379` va `ru.json:379`da allaqachon to'liq tarjima bilan mavjud.

- [ ] **Step 2: In-flight holatni tekshiruvchi test yozish**

  `DesktopServerConnectionCard.test.tsx` — mavjud testlar oxiriga yangi `it` bloki qo'shiladi (fayl oxiridagi `});`dan oldin, so'nggi mavjud test bilan bir xil uslubda, `setServerUrl`ni deferred promise bilan mocklab):
  ```tsx
  it('submit paytida (isSubmitting) tugma matni "ulanmoqda..." ga almashadi', async () => {
    let resolveSetServerUrl: (value: { ok: true; connected: boolean; serverUrl: string }) => void;
    const pending = new Promise<{ ok: true; connected: boolean; serverUrl: string }>((resolve) => {
      resolveSetServerUrl = resolve;
    });
    const setServerUrl = vi.fn().mockReturnValue(pending);
    window.dentalDesktop = { setServerUrl };

    const { getByRole, findByText, queryByText } = renderApp(<DesktopServerConnectionCard />);
    fireEvent.change(getByRole('textbox'), { target: { value: 'http://10.0.0.5:8001' } });
    fireEvent.click(getByRole('button'));

    // isSubmitting=true bo'lgan darhol oraliqda tugma matni "ulanmoqda..." bo'lishi kerak
    expect(await findByText(i18n.t('settings.desktop_server_connecting'))).toBeInTheDocument();
    expect(queryByText(i18n.t('settings.desktop_server_connect_button'))).not.toBeInTheDocument();

    resolveSetServerUrl!({ ok: true, connected: true, serverUrl: 'http://10.0.0.5:8001' });

    // Promise hal bo'lgach tugma asl matniga qaytadi
    expect(await findByText(i18n.t('settings.desktop_server_connect_button'))).toBeInTheDocument();
  });
  ```
  Bu test allaqachon import qilingan `fireEvent`, `i18n`, `renderApp`, `vi`dan foydalanadi — qo'shimcha import kerak emas.

- [ ] **Step 3: Testlarni ishga tushirib tasdiqlash**
  ```bash
  cd apps/web && bun run test -- DesktopServerConnectionCard.test.tsx
  ```
  Barcha testlar (eskisi + yangisi) yashil bo'lishi kerak.

- [ ] **Step 4: Commit**
  ```
  feat(web): wire desktop_server_connecting label into in-flight submit state (CLI-398)
  ```

---

### Task 3: `IntegrationsSettingsScreen.test.tsx` — tooltip matnini haqiqatan tekshirish

**Files:**
- Modify: `apps/web/src/features/settings/components/IntegrationsSettingsScreen.test.tsx:41-49`

- [ ] **Step 1: `fireEvent` import qilish va tooltip assertsiyasini qo'shish**

  Import qatoriga `fireEvent` qo'shiladi:
  ```tsx
  // Before (1-4-qator):
  import { describe, expect, it, vi } from 'vitest';
  import { i18n } from '@/lib/i18n.ts';
  import { renderApp } from '../../../test-utils';
  import { IntegrationsSettingsScreen } from './IntegrationsSettingsScreen';

  // After:
  import { fireEvent, screen } from '@testing-library/react';
  import { describe, expect, it, vi } from 'vitest';
  import { i18n } from '@/lib/i18n.ts';
  import { renderApp } from '../../../test-utils';
  import { IntegrationsSettingsScreen } from './IntegrationsSettingsScreen';
  ```

  Testni `async` qilib, hover + tooltip assertsiyasi qo'shiladi (41-49-qator):
  ```tsx
  // Before:
    it('Connect/Configure tugmalari disabled va "tez orada" tooltip ko‘rsatadi', () => {
      const { getAllByRole } = renderApp(<IntegrationsSettingsScreen />);
      const buttons = getAllByRole('button');
      // 4 karta — har birida bitta Connect yoki Configure tugma, hammasi disabled bo'lishi kerak
      expect(buttons).toHaveLength(4);
      for (const button of buttons) {
        expect(button).toBeDisabled();
      }
    });

  // After:
    it('Connect/Configure tugmalari disabled va "tez orada" tooltip ko‘rsatadi', async () => {
      const { getAllByRole } = renderApp(<IntegrationsSettingsScreen />);
      const buttons = getAllByRole('button');
      // 4 karta — har birida bitta Connect yoki Configure tugma, hammasi disabled bo'lishi kerak
      expect(buttons).toHaveLength(4);
      for (const button of buttons) {
        expect(button).toBeDisabled();
      }

      // Tooltip'ning hover-nishoni — disabled tugmani o'rab turgan <span> (Tooltip.tsx
      // komponent kodida tugma emas, span'ga bog'langan: disabled tugma pointer-hodisa
      // otmaydi). Mantine Tooltip label'ni faqat `opened` bo'lganda mount qiladi —
      // shuning uchun getByText emas, findByText (async) ishlatiladi.
      const firstButtonWrapper = buttons[0]?.parentElement;
      expect(firstButtonWrapper).toBeTruthy();
      fireEvent.mouseEnter(firstButtonWrapper as HTMLElement);
      expect(await screen.findByText(i18n.t('shell.coming_soon'))).toBeInTheDocument();
    });
  ```
  **Eslatma implementatorga:** agar `fireEvent.mouseEnter` bilan tooltip ochilmasa (jsdom/floating-ui interop muammosi), Step 2'da aniqlanadi — shu holda `fireEvent.mouseOver(firstButtonWrapper)` yoki `fireEvent.pointerEnter(firstButtonWrapper)` bilan almashtirib qayta sinash kerak (Mantine `Tooltip` default `events: { hover: true }` — `mouseenter/mouseleave` react-hodisalariga tayanadi, lekin floating-ui `useHover` implementatsiyasi versiyaga qarab `pointerenter`ni ham talab qilishi mumkin).

- [ ] **Step 2: Testni ishga tushirib tasdiqlash, kerak bo'lsa hover-hodisa turini moslashtirish**
  ```bash
  cd apps/web && bun run test -- IntegrationsSettingsScreen.test.tsx
  ```
  Agar `findByText` timeout bilan fail bo'lsa — Step 1'dagi eslatmaga muvofiq `mouseEnter` → `mouseOver`/`pointerEnter` bilan almashtirib qayta ishga tushiring.

- [ ] **Step 3: Commit**
  ```
  test(web): actually assert tooltip text in IntegrationsSettingsScreen disabled-buttons test (CLI-398)
  ```

---

### Task 4: `PosPanel.tsx` — ortiqcha inline i18n default olib tashlash

**Files:**
- Modify: `apps/web/src/features/cashier/components/PosPanel.tsx:434`

- [ ] **Step 1: Ortiqcha defaultni olib tashlash**
  ```tsx
  // Before:
            {t('cashier.noop_fiscal', 'Fiskal hujjat keyinroq Soliqqa yuboriladi')}

  // After:
            {t('cashier.noop_fiscal')}
  ```
  Bu `ReceiptModal.tsx:257`dagi `{t('cashier.noop_fiscal')}` chaqiruvi bilan bir xil shaklga keltiradi. Locale fayllarga o'zgarish kerak emas — kalit `uz.json:1089` va `ru.json:1089`da allaqachon to'liq tarjima bilan mavjud.

- [ ] **Step 2: Testlarni ishga tushirib tasdiqlash**
  ```bash
  cd apps/web && bun run test -- PosPanel
  ```
  Mavjud `PosPanel` testlari (agar bor bo'lsa) o'zgarmasdan yashil bo'lishi kerak — chiqish matni bir xil qoladi (kalit ikkala locale'da bor edi, faqat "agar kalit yo'qolsa nima bo'ladi" xavfsizlik to'ri olib tashlanadi).

- [ ] **Step 3: Commit**
  ```
  fix(web): remove redundant inline i18n default in PosPanel noop-fiscal footer (CLI-398)
  ```

---

## Self-review

- **Task 1:** to'g'ridan-to'g'ri, past-risk — faqat assertsiya manbai o'zgaradi, komponent kodiga tegilmaydi. `i18n` import yo'li (`@/lib/i18n.ts`) mavjud testlarda tasdiqlangan naqsh.
- **Task 2:** yagona haqiqiy dizayn qarori (wire vs delete) — spec hujjatida asoslangan. Test deferred-promise texnikasi loyihada yangi (`vi.fn().mockResolvedValue` o'rniga `mockReturnValue(pending)` + qo'lda `resolve`), lekin bu — Mantine `loading` prop tranzitiv holatini "muzlatib" ko'rish uchun zarur; boshqa yo'l — `setServerUrl`ni sun'iy `setTimeout` bilan kechiktirish — yanada mo'rt (timer-based flakiness xavfi) bo'lardi, shuning uchun deferred-promise afzal.
- **Task 3:** eng yuqori mexanik-risk item — advisor bilan tasdiqlangan: hover nishon **span** (`button.parentElement`), `findByText` (async, `getByText` emas). Fallback eslatma implementatorga qo'shildi (hover-hodisa turi floating-ui versiyasiga qarab farq qilishi mumkin) — bu qasddan "aniq bitta yo'l" o'rniga qisqa muqobil yo'l ko'rsatiladi, chunki jsdom+floating-ui hover interop haqiqiy repo muhitida ishga tushirib ko'rilmaguncha 100% kafolatlab bo'lmaydi.
- **Task 4:** eng past-risk, bir qatorli o'zgarish — sibling `ReceiptModal.tsx` naqshiga hizalash, locale fayllar tasdiqlangan (kalit ikkala tilda ham bor).
- Har 4 ta task mustaqil fayl(lar)ga tegadi, orasida bog'liqlik yo'q — istalgan tartibda yoki parallel bajarilishi mumkin.
- Hech bir task locale JSON fayllarga tegmaydi (barcha ishlatiladigan kalitlar allaqachon mavjud) — bu global constraint barcha 4 task bo'ylab qat'iy saqlangan.
