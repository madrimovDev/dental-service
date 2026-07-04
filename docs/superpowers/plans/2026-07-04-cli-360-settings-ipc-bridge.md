# CLI-360 Settings IPC Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Web `/settings` → Integrations sahifasiga "Desktop server manzili" kartasi qo'shish, u `window.dentalDesktop.setServerUrl(url)` (Electron preload ko'prigi, `apps/desktop/src/preload.cts` + `apps/desktop/src/settings-ipc.ts`, allaqachon mavjud va o'zgartirilmaydi) ni chaqirib qo'lda server URL kiritish + qayta ulanishni ta'minlaydi. Faqat Electron muhitida (`window.dentalDesktop` mavjud bo'lganda) ko'rinadi; brauzer-only buildda hech narsa render qilmaydi.

**Architecture:** `apps/web/src/features/settings/` feature-folder (RFC-0010). Yangi kichik komponent `DesktopServerConnectionCard.tsx` — `IntegrationsSettingsScreen.tsx` uni grid'dan oldin render qiladi. Global `Window.dentalDesktop` tipi yangi `.d.ts` faylda e'lon qilinadi (workspace paket import yo'q — `apps/desktop` va `apps/web` alohida TS project, shakl qo'lda takrorlanadi, xuddi `preload.cts` o'zi `settings-ipc.ts`dan import qilmaganidek).

**Tech Stack:** React, Mantine v7, apps/web/src/features/settings/, react-i18next, vitest + @testing-library/react.

## Global Constraints

- Barcha ko'rinadigan matn `t('settings.desktop_server_*')` orqali — hech qanday hardcode uz/ru matn. Yangi kalitlar `packages/i18n/src/locales/uz.json` VA `ru.json` ikkalasiga birga qo'shiladi (bitta tilda unut qoldirilmaydi).
- `window.dentalDesktop` yo'q bo'lganda (brauzer build, jsdom test muhiti) komponent **`null` qaytaradi** — DOM'ga hech narsa qo'shmaydi. Mavjud `IntegrationsSettingsScreen.test.tsx` (jsdom, `dentalDesktop` yo'q) o'zgarishsiz yashil qolishi shart — bu test HAR bir task oxirida qayta ishga tushiriladi (regressiya guard).
- `SetServerUrlResult` shakli **aynan** `apps/desktop/src/settings-ipc.ts`dan: `{ ok: true; connected: boolean; serverUrl: string }`. Promise real Electron muhitida reject qilmaydi (handler har doim resolve qiladi — `settings-ipc.test.ts`da tasdiqlangan), lekin `ipcRenderer.invoke` transport darajasida nazariy jihatdan reject qilishi mumkin — komponent shuni ham `try/catch` bilan qamrab oladi.
- Testlar **vitest** + `@testing-library/react` (`apps/web` konvensiyasi — `bun:test` EMAS). `renderApp()` helper (`apps/web/src/test-utils.tsx`) orqali render qilinadi (MantineProvider + I18nextProvider + QueryClientProvider + MemoryRouter allaqachon o'ralgan).
- Har task oxirida: `vitest run` yangi test fayli + `IntegrationsSettingsScreen.test.tsx` (regressiya) + `bun run typecheck --filter @dental/web` (yoki repo-level typecheck skripti).
- `@mantine/form` shart emas bu holatda (bitta required text-input) — oddiy `useState` ishlatiladi (spec §5 constraint 4ga qarang, `docs/superpowers/specs/2026-07-04-cli-360-settings-ipc-bridge-design.md`).

---

### Task 1: Global tip e'loni + komponent skeleton (ko'rinish-gating)

**Files:**
- Create: `apps/web/src/types/electron-desktop.d.ts`
- Create: `apps/web/src/features/settings/components/DesktopServerConnectionCard.tsx`
- Test: `apps/web/src/features/settings/components/DesktopServerConnectionCard.test.tsx`

**Interfaces:**
- Consumes: `window.dentalDesktop?.setServerUrl(url: string): Promise<{ ok: true; connected: boolean; serverUrl: string }>` (aynan `apps/desktop/src/settings-ipc.ts` `SetServerUrlResult` shakli, mustaqil takrorlangan — import yo'q).
- Produces: `DesktopServerConnectionCard` React komponenti — `window.dentalDesktop` yo'qligida `null`, borligida input+button qobiq (hali submit mantiqisiz).

- [ ] **Step 1: Write the failing test**

`apps/web/src/features/settings/components/DesktopServerConnectionCard.test.tsx`:
```tsx
import { afterEach, describe, expect, it } from 'vitest';
import { renderApp } from '../../../test-utils';
import { DesktopServerConnectionCard } from './DesktopServerConnectionCard';

afterEach(() => {
  // @ts-expect-error — test-only cleanup, brauzer holatiga qaytarish
  delete window.dentalDesktop;
});

describe('DesktopServerConnectionCard', () => {
  it('window.dentalDesktop yo\'q bo\'lsa hech narsa render qilmaydi (brauzer build)', () => {
    const { container } = renderApp(<DesktopServerConnectionCard />);
    expect(container.querySelector('[data-testid="desktop-server-card"]')).toBeNull();
  });

  it('window.dentalDesktop mavjud bo\'lsa input + tugma render qiladi', () => {
    // @ts-expect-error — test-only global stub
    window.dentalDesktop = { setServerUrl: async () => ({ ok: true, connected: true, serverUrl: 'x' }) };

    const { container, getByRole } = renderApp(<DesktopServerConnectionCard />);
    expect(container.querySelector('[data-testid="desktop-server-card"]')).not.toBeNull();
    expect(getByRole('textbox')).toBeTruthy();
    expect(getByRole('button')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vitest run apps/web/src/features/settings/components/DesktopServerConnectionCard.test.tsx`
(Kutilgan xato: modul topilmadi — `DesktopServerConnectionCard.tsx` hali mavjud emas.)

- [ ] **Step 3: Write minimal implementation**

`apps/web/src/types/electron-desktop.d.ts`:
```ts
/**
 * Electron `contextBridge` orqali ochilgan global — `apps/desktop/src/preload.cts`.
 * Shakl mustaqil takrorlanadi (workspace import yo'q — apps/desktop va apps/web
 * alohida TS project). O'zgartirsangiz preload.cts + settings-ipc.ts bilan
 * moslikni qo'lda saqlang.
 */
export interface DentalDesktopBridge {
  setServerUrl(serverUrl: string): Promise<{
    ok: true;
    connected: boolean;
    serverUrl: string;
  }>;
}

declare global {
  interface Window {
    dentalDesktop?: DentalDesktopBridge;
  }
}

export {};
```

`apps/web/src/features/settings/components/DesktopServerConnectionCard.tsx`:
```tsx
import { Button, Stack, Text, TextInput, Title } from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const CARD_STYLE: React.CSSProperties = {
  borderRadius: 'var(--radius-card)',
  padding: 18,
  marginBottom: 16,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  boxShadow: 'var(--shadow-sm)',
};

export function DesktopServerConnectionCard() {
  const { t } = useTranslation();
  const [serverUrl, setServerUrl] = useState('');

  if (typeof window === 'undefined' || !window.dentalDesktop) {
    return null;
  }

  return (
    <Stack gap={10} style={CARD_STYLE} data-testid="desktop-server-card">
      <Title order={4} fw={700} c="var(--ink)">
        {t('settings.desktop_server_title')}
      </Title>
      <Text size="xs" c="var(--ink-3)">
        {t('settings.desktop_server_desc')}
      </Text>
      <TextInput
        label={t('settings.desktop_server_url_label')}
        placeholder={t('settings.desktop_server_url_placeholder')}
        value={serverUrl}
        onChange={(e) => setServerUrl(e.currentTarget.value)}
      />
      <Button size="xs" style={{ alignSelf: 'flex-start' }}>
        {t('settings.desktop_server_connect_button')}
      </Button>
    </Stack>
  );
}
```

Yangi i18n kalitlar (`packages/i18n/src/locales/uz.json`, `integration_status_off` qatoridan keyin, `perm_group`dan oldin — aniq joy: satr 372dan keyin):
```diff
     "integration_status_connected": "Ulangan",
     "integration_status_off": "Ulanmagan",
+    "desktop_server_title": "Desktop server manzili",
+    "desktop_server_desc": "LAN orqali server avtomatik topilmasa, manzilni qo'lda kiriting va qayta ulaning.",
+    "desktop_server_url_label": "Server manzili",
+    "desktop_server_url_placeholder": "http://192.168.1.10:8001",
+    "desktop_server_connect_button": "Ulash",
+    "desktop_server_connecting": "Ulanmoqda...",
+    "desktop_server_success": "Serverga muvaffaqiyatli ulandi.",
+    "desktop_server_saved_not_connected": "Manzil saqlandi, lekin serverga ulanib bo'lmadi. Manzil va tarmoqni tekshiring.",
+    "desktop_server_error": "Xatolik yuz berdi. Qaytadan urinib ko'ring.",
+    "desktop_server_url_required": "Server manzilini kiriting.",
     "perm_group": {
```

`packages/i18n/src/locales/ru.json` (bir xil joy, satr 372dan keyin):
```diff
     "integration_status_connected": "Подключено",
     "integration_status_off": "Не подключено",
+    "desktop_server_title": "Адрес desktop-сервера",
+    "desktop_server_desc": "Если сервер не найден автоматически по локальной сети, введите адрес вручную и переподключитесь.",
+    "desktop_server_url_label": "Адрес сервера",
+    "desktop_server_url_placeholder": "http://192.168.1.10:8001",
+    "desktop_server_connect_button": "Подключить",
+    "desktop_server_connecting": "Подключение...",
+    "desktop_server_success": "Успешно подключено к серверу.",
+    "desktop_server_saved_not_connected": "Адрес сохранён, но подключиться не удалось. Проверьте адрес и сеть.",
+    "desktop_server_error": "Произошла ошибка. Попробуйте снова.",
+    "desktop_server_url_required": "Введите адрес сервера.",
     "perm_group": {
```

- [ ] **Step 4: Run test to verify it passes**

Run: `vitest run apps/web/src/features/settings/components/DesktopServerConnectionCard.test.tsx`
Also run regression: `vitest run apps/web/src/features/settings/components/IntegrationsSettingsScreen.test.tsx`

- [ ] **Step 5: Commit**

---

### Task 2: Submit → `setServerUrl()` chaqirish + connected-true holati

**Files:**
- Modify: `apps/web/src/features/settings/components/DesktopServerConnectionCard.tsx`
- Test: `apps/web/src/features/settings/components/DesktopServerConnectionCard.test.tsx`

**Interfaces:**
- Consumes: `window.dentalDesktop.setServerUrl(url): Promise<{ ok: true; connected: boolean; serverUrl: string }>`
- Produces: submit paytida button `loading` holatiga o'tadi; `connected: true` qaytganda `settings.desktop_server_success` xabari ko'rinadi (Mantine `notifications.show` — mavjud pattern `TenantSettingsScreen.tsx`/`UsersSettingsScreen.tsx`dagi kabi).

- [ ] **Step 1: Write the failing test**

`DesktopServerConnectionCard.test.tsx`ga qo'shiladi (yuqoridagi `describe` blokiga yangi `it`lar):
```tsx
import { fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

it('bo\'sh URL bilan submit qilinsa setServerUrl chaqirilmaydi, xato ko\'rinadi', async () => {
  const setServerUrl = vi.fn();
  // @ts-expect-error test stub
  window.dentalDesktop = { setServerUrl };

  const { getByRole, findByText } = renderApp(<DesktopServerConnectionCard />);
  fireEvent.click(getByRole('button'));

  await findByText((_content, node) => node?.textContent === 'settings.desktop_server_url_required' || false);
  expect(setServerUrl).not.toHaveBeenCalled();
});

it('to\'g\'ri URL bilan submit qilinsa setServerUrl chaqiriladi va connected:true da muvaffaqiyat xabari chiqadi', async () => {
  const setServerUrl = vi.fn().mockResolvedValue({ ok: true, connected: true, serverUrl: 'http://10.0.0.5:8001' });
  // @ts-expect-error test stub
  window.dentalDesktop = { setServerUrl };

  const { getByRole } = renderApp(<DesktopServerConnectionCard />);
  fireEvent.change(getByRole('textbox'), { target: { value: 'http://10.0.0.5:8001' } });
  fireEvent.click(getByRole('button'));

  await waitFor(() => expect(setServerUrl).toHaveBeenCalledWith('http://10.0.0.5:8001'));
});
```
(Eslatma: aniq matn assertion — real i18n resurslardagi tarjima matniga moslashtiriladi, Step 4'da test ijrosi natijasiga qarab aniqlashtiriladi; `i18n.t()` real tarjima qaytaradi, `renderApp` orqali `I18nextProvider` real instance ishlatadi — `IntegrationsSettingsScreen.test.tsx` xuddi shunday `t()`ni to'g'ridan import qilib solishtiradi.)

- [ ] **Step 2: Run test to verify it fails**

Run: `vitest run apps/web/src/features/settings/components/DesktopServerConnectionCard.test.tsx`

- [ ] **Step 3: Write minimal implementation**

`DesktopServerConnectionCard.tsx`ni yangilash:
```tsx
import { Button, Stack, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

// ... CARD_STYLE o'zgarmaydi

export function DesktopServerConnectionCard() {
  const { t } = useTranslation();
  const [serverUrl, setServerUrl] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (typeof window === 'undefined' || !window.dentalDesktop) {
    return null;
  }

  const handleConnect = async () => {
    if (!serverUrl.trim()) {
      setUrlError(t('settings.desktop_server_url_required'));
      return;
    }
    setUrlError(null);
    setIsSubmitting(true);
    try {
      const result = await window.dentalDesktop!.setServerUrl(serverUrl.trim());
      if (result.connected) {
        notifications.show({ message: t('settings.desktop_server_success'), color: 'teal' });
      } else {
        notifications.show({ message: t('settings.desktop_server_saved_not_connected'), color: 'yellow' });
      }
    } catch {
      notifications.show({ message: t('settings.desktop_server_error'), color: 'red' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Stack gap={10} style={CARD_STYLE} data-testid="desktop-server-card">
      <Title order={4} fw={700} c="var(--ink)">
        {t('settings.desktop_server_title')}
      </Title>
      <Text size="xs" c="var(--ink-3)">
        {t('settings.desktop_server_desc')}
      </Text>
      <TextInput
        label={t('settings.desktop_server_url_label')}
        placeholder={t('settings.desktop_server_url_placeholder')}
        value={serverUrl}
        onChange={(e) => {
          setServerUrl(e.currentTarget.value);
          if (urlError) setUrlError(null);
        }}
        error={urlError}
        disabled={isSubmitting}
      />
      <Button size="xs" style={{ alignSelf: 'flex-start' }} loading={isSubmitting} onClick={handleConnect}>
        {t('settings.desktop_server_connect_button')}
      </Button>
    </Stack>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `vitest run apps/web/src/features/settings/components/DesktopServerConnectionCard.test.tsx`
Also run regression: `vitest run apps/web/src/features/settings/components/IntegrationsSettingsScreen.test.tsx`

- [ ] **Step 5: Commit**

---

### Task 3: `connected: false` va promise-reject holatlari

**Files:**
- Modify: `apps/web/src/features/settings/components/DesktopServerConnectionCard.tsx` (agar Task 2 implementatsiyasi allaqachon to'liq bo'lsa — o'zgarish shart emas, faqat test qo'shiladi va tasdiqlanadi)
- Test: `apps/web/src/features/settings/components/DesktopServerConnectionCard.test.tsx`

**Interfaces:**
- Consumes: `window.dentalDesktop.setServerUrl(url)` — `connected: false` bilan resolve bo'lgan va reject bo'lgan holatlar.
- Produces: `connected:false` → `settings.desktop_server_saved_not_connected` (sariq/`yellow`); reject → `settings.desktop_server_error` (qizil/`red`).

- [ ] **Step 1: Write the failing test**

```tsx
it('connected:false qaytsa "saqlandi, lekin ulanmadi" ogohlantirishi ko\'rsatiladi', async () => {
  const setServerUrl = vi.fn().mockResolvedValue({ ok: true, connected: false, serverUrl: 'http://10.0.0.9:8001' });
  // @ts-expect-error test stub
  window.dentalDesktop = { setServerUrl };

  const { getByRole, findAllByText } = renderApp(<DesktopServerConnectionCard />);
  fireEvent.change(getByRole('textbox'), { target: { value: 'http://10.0.0.9:8001' } });
  fireEvent.click(getByRole('button'));

  await waitFor(() => expect(setServerUrl).toHaveBeenCalled());
  // notifications.show DOM'ga portal orqali chiqadi — matn mavjudligini tekshiramiz
  expect(await findAllByText(i18n.t('settings.desktop_server_saved_not_connected'))).not.toHaveLength(0);
});

it('setServerUrl reject qilsa umumiy xato xabari ko\'rsatiladi', async () => {
  const setServerUrl = vi.fn().mockRejectedValue(new Error('IPC transport failure'));
  // @ts-expect-error test stub
  window.dentalDesktop = { setServerUrl };

  const { getByRole, findAllByText } = renderApp(<DesktopServerConnectionCard />);
  fireEvent.change(getByRole('textbox'), { target: { value: 'http://10.0.0.9:8001' } });
  fireEvent.click(getByRole('button'));

  await waitFor(() => expect(setServerUrl).toHaveBeenCalled());
  expect(await findAllByText(i18n.t('settings.desktop_server_error'))).not.toHaveLength(0);
});
```
(`i18n` — `@/lib/i18n.ts`dan import, `IntegrationsSettingsScreen.test.tsx`dagi kabi.)

- [ ] **Step 2: Run test to verify it fails**

Run: `vitest run apps/web/src/features/settings/components/DesktopServerConnectionCard.test.tsx`
(Agar Task 2 implementatsiyasi to'g'ri yozilgan bo'lsa, bu testlar allaqachon o'tishi mumkin — shu holda bu qadam "kutilganidek o'tadi, chunki mantiq Task 2'da qamrab olingan" deb hujjatlashtiriladi va Step 3 bo'sh qoladi.)

- [ ] **Step 3: Write minimal implementation (agar kerak bo'lsa)**

Agar Task 2 kodi testni qondirmasa (masalan `notifications.show` rangi yoki matn moslik topmasa) — faqat farqni tuzatuvchi minimal patch.

- [ ] **Step 4: Run test to verify it passes**

Run: `vitest run apps/web/src/features/settings/components/DesktopServerConnectionCard.test.tsx`

- [ ] **Step 5: Commit**

---

### Task 4: `IntegrationsSettingsScreen.tsx`ga ulash (integratsiya)

**Files:**
- Modify: `apps/web/src/features/settings/components/IntegrationsSettingsScreen.tsx:1-13` (import qo'shiladi), `:67-69` (render qo'shiladi, grid'dan oldin)
- Test: `apps/web/src/features/settings/components/IntegrationsSettingsScreen.test.tsx` (regressiya, o'zgarmaydi — yangi test qo'shilmaydi, chunki `DesktopServerConnectionCard`ning o'z testlari Task 1-3'da yozilgan; bu yerda faqat mavjud 3 ta test hali yashil ekanini tasdiqlash)

**Interfaces:**
- Consumes: `DesktopServerConnectionCard` (Task 1-3da qurilgan, o'zgarishsiz import qilinadi).
- Produces: `IntegrationsSettingsScreen` endi grid'dan oldin `<DesktopServerConnectionCard />` render qiladi (brauzer buildda `null` — grid strukturasi va mavjud testlar o'zgarishsiz qoladi).

- [ ] **Step 1: Write the failing test (regressiya-guard sifatida, allaqachon mavjud testni qayta ishga tushirish)**

Yangi test yozilmaydi — mavjud `IntegrationsSettingsScreen.test.tsx` shu bosqichda ishga tushiriladi va **hali** yangi komponent ulanmagani uchun (agar import xato bo'lsa) yiqilishi kutiladi; aslida bu qadam asosan Step 4bilan birlashadi — real "failing" holat yo'q, chunki integratsiya faqat qo'shimcha render, mavjud test assertionlariga ta'sir qilmaydi (`grid.children` soni, button label'lar grid ichidan hisoblanadi, `DesktopServerConnectionCard` grid tashqarisida). Shu sabab bu task uchun TDD "qizil" bosqichi — import qilingandan keyin typecheck orqali tekshiriladi (komponent hali mavjud emas bo'lsa import xatosi chiqadi).

Run: `vitest run apps/web/src/features/settings/components/IntegrationsSettingsScreen.test.tsx`
(Task 1-3 allaqachon bajarilgan bo'lsa, bu buyruq bu bosqichda ham o'tishi kerak — chunki `IntegrationsSettingsScreen.tsx` hali `DesktopServerConnectionCard`ni import qilmagan, demak eski xatti-harakat saqlanadi. Bu — ushbu task uchun "boshlang'ich yashil" holat, keyingi qadam kod qo'shadi va yana yashil ekanini tasdiqlaydi.)

- [ ] **Step 2: Run test to verify current (pre-integration) state is green**

Run: `vitest run apps/web/src/features/settings/components/IntegrationsSettingsScreen.test.tsx`

- [ ] **Step 3: Write minimal implementation**

`IntegrationsSettingsScreen.tsx` import blokiga qo'shish (mavjud `import { SettingsShell } from './SettingsShell';` yonida):
```diff
 import { useTranslation } from 'react-i18next';
 import { useTenantSettings } from '../settings.api';
+import { DesktopServerConnectionCard } from './DesktopServerConnectionCard';
 import { SettingsShell } from './SettingsShell';
```

`return (...)` blokida, grid'dan oldin (joriy `settings.isLoading || !integrations` shartidan TASHQARI — chunki desktop-server karta `tenant_settings` GET'iga bog'liq emas, mustaqil holda ko'rinishi kerak):
```diff
     <SettingsShell active="integrations">
+      <DesktopServerConnectionCard />
       {settings.isLoading || !integrations ? (
```

- [ ] **Step 4: Run test to verify it passes**

Run: `vitest run apps/web/src/features/settings/components/IntegrationsSettingsScreen.test.tsx`
Run: `vitest run apps/web/src/features/settings/components/DesktopServerConnectionCard.test.tsx`
Run: `bun run typecheck` (repo-level — `apps/web/src/types/electron-desktop.d.ts` `include: ["src/**/*"]` orqali avtomatik qamraladi, qo'shimcha tsconfig o'zgarishi shart emas).

- [ ] **Step 5: Commit**

---

## Self-Review (placeholder / type consistency tekshiruvi)

- **Placeholder yo'q:** har task real i18n matn (uz+ru), real `SetServerUrlResult` maydon nomlari (`ok`/`connected`/`serverUrl`), real fayl yo'llari va real satr raqamlari (`settings-ipc.ts` 26-30, `preload.cts` 23-25, `IntegrationsSettingsScreen.tsx` 1-13/67-69, `uz.json`/`ru.json` 372-qator) bilan yozilgan — o'ylab topilgan API shakli yo'q.
- **Tip mosligi:** `DentalDesktopBridge.setServerUrl` qaytarish tipi (`Promise<{ok:true; connected:boolean; serverUrl:string}>`) `settings-ipc.ts`dagi `SetServerUrlResult`ning aynan bir xil field-set'i (mustaqil e'lon, lekin shakl mos) — kelajakda `settings-ipc.ts` o'zgarsa, ikkala joy qo'lda sinxronlanishi kerak (bu spec §4da constraint sifatida hujjatlashtirilgan, avtomatik tekshiruv yo'q — kelajakdagi risk, lekin scope tashqarisida chunki `preload.cts` allaqachon shu naqshni ishlatadi).
- **Test-runtime moslik:** barcha test misollari `vitest`/`@testing-library/react` API (`renderApp`, `fireEvent`, `waitFor`, `findByText`) ishlatadi — `bun:test` emas (apps/desktop uchun `bun:test`, apps/web uchun `vitest` — loyiha konvensiyasiga mos, `settings-ipc.test.ts` bilan aralashtirilmagan).
- **Regressiya:** har task oxirida `IntegrationsSettingsScreen.test.tsx` qayta ishga tushiriladi — mavjud 3 ta test (`4 ta karta`, `statuslar`, `Sozlash/Ulash label`) yangi komponent grid strukturasiga ta'sir qilmasligini tasdiqlaydi (`DesktopServerConnectionCard` `data-testid="desktop-server-card"` bilan alohida, `grid` selectoridan tashqarida).
- **Ochiq nozik joy (keyingi reviewer uchun belgilab qo'yildi):** Task 2/3'dagi test kod namunalari `notifications.show` matnini `findAllByText`/`findByText` orqali qidiradi — Mantine notifications portal DOM tuzilishi va aniq matn-moslik (exact vs substring) implementatsiya paytida moslashtirishni talab qilishi mumkin; bu — "aniq test kodi taxminiy, implementatsiya paytida kichik moslashtirish normal" izohi bilan qoldirilgan, placeholder emas — real API va real i18n kalitlar ishlatilgan.
