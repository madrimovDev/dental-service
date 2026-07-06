# CLI-368 — Supervisor Admin'da klinika yaratish UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the permanently-`disabled` "+ Yangi klinika" button in `apps/supervisor-admin/src/features/clinics/ClinicsPage.tsx:30-36` with a working modal form that calls the already-working `POST /v1/admin/clinics` backend endpoint (`apps/supervisor-api/src/modules/clinics/clinics.routes.ts:74-118`, no backend changes needed) and shows the resulting license key in a persistent, copy-capable, explicitly-dismissed panel — not an auto-disappearing toast.

**Architecture:** `apps/supervisor-admin` feature-folder React (`src/features/clinics/`). New `components/CreateClinicModal.tsx` (first Modal in this app — no existing Modal pattern to follow locally, `useDisclosure` from `@mantine/hooks` mirrors the idiom already used in `apps/web/src/shell/AppShell.tsx`). New client-side Zod schema mirrored 1:1 from the server's `createClinicSchema` (`clinics.routes.ts:12-19`). `@mantine/form` + `zod4Resolver`, matching `apps/web`'s convention — this requires adding `zod` + `mantine-form-zod-resolver` to `apps/supervisor-admin/package.json` (currently absent). No `@mantine/dates` dependency added — `expiresAt` uses a native `<input type="date">` via Mantine `TextInput type="date"`.

**Tech Stack:** React, Mantine v7, @mantine/form, zod4Resolver, TanStack Query, vitest, @testing-library/react

## Global Constraints

- **No backend changes.** `POST /v1/admin/clinics` already works exactly as needed (confirmed by reading `clinics.routes.ts:74-118`) — request body `{ name, contactEmail?, contactPhone?, plan, expiresAt, gracePeriodDays? }`, response `{ clinic: Clinic, license: License }` (license never null in this response, unlike the `GET /:id` shape). No task in this plan touches `apps/supervisor-api`.
- **Response type reuse:** the existing `ClinicDetail` interface in `apps/supervisor-admin/src/features/clinics/clinics.types.ts` (`{ clinic: Clinic; license: License | null }`) already matches the create-response shape exactly. No new response type is added.
- **New dependencies required:** `zod` and `mantine-form-zod-resolver` must be added to `apps/supervisor-admin/package.json`, matching the exact versions already used in `apps/web/package.json` (`zod@^4.4.3`, `mantine-form-zod-resolver@^1.3.0`) — this repo is Zod 4, so a plain `zodResolver` is wrong (it reads `error.errors`, a Zod-3-ism, and crashes on invalid submit); always `zod4Resolver` (`.issues`).
- **License key presentation is a hard UX requirement, not a nice-to-have:** once the create mutation succeeds, the modal must show the license key in a persistent block (not a `@mantine/notifications` toast, which this app doesn't even have as a dependency) with a `CopyButton` (from `@mantine/core`, no new dependency), and the modal must NOT be closable via click-outside/Escape in that state — only an explicit "Yopish" button closes it. This directly implements the ticket's "one-time-visible/sensitive" requirement even though the key is technically also visible later on `ClinicsPage`'s table and `ClinicDetailPage`.
- **`zValidator`'s default 400 error shape is not parsed** — `apps/supervisor-api` has no custom Hono `onError`/error formatter for `zValidator` failures (confirmed: no `app.onError` in `app.ts`/`index.ts`), so on `!res.ok` the frontend throws a single generic `Error` message, exactly like the existing `fetchClinics`/`fetchClinicDetail` functions in `clinics.api.ts` do today. Client-side `zod4Resolver` validation is what prevents most invalid submissions in practice.

---

### Task 1: Dependencies + shared types + `createClinic` API client function

**Files:**
- Modify: `apps/supervisor-admin/package.json` (add `zod: "^4.4.3"`, `mantine-form-zod-resolver: "^1.3.0"` to `dependencies`)
- Modify: `apps/supervisor-admin/src/features/clinics/clinics.types.ts` (add `CreateClinicInput` interface)
- Create: `apps/supervisor-admin/src/features/clinics/clinics.schema.ts` (client-side Zod schema, mirrors server's `createClinicSchema`)
- Modify: `apps/supervisor-admin/src/features/clinics/clinics.api.ts` (add `createClinic` function)
- Test: `apps/supervisor-admin/src/features/clinics/clinics.api.test.ts` (new file)

**Interfaces:**
- Consumes: `POST /v1/admin/clinics` — request body (exact, from `apps/supervisor-api/src/modules/clinics/clinics.routes.ts:12-19`):
  ```ts
  {
    name: string;            // min length 1
    contactEmail?: string;   // must be valid email if present
    contactPhone?: string;
    plan: 'starter' | 'standard' | 'premium' | 'enterprise';
    expiresAt: string;       // ISO date string
    gracePeriodDays?: number; // int, 1-365, server defaults to 30 if omitted
  }
  ```
  Response (`clinics.routes.ts:117`, 200): `{ clinic: Clinic, license: License }` — matches the existing `ClinicDetail` type in `clinics.types.ts` exactly.

- [ ] **Step 1: Write the failing test**

  Create `apps/supervisor-admin/src/features/clinics/clinics.api.test.ts`:
  ```ts
  import { beforeEach, describe, expect, it, vi } from 'vitest';
  import { createClinic } from './clinics.api';

  const fetchMock = vi.fn();

  const jsonResponse = (body: unknown, ok = true) => ({ ok, json: async () => body });

  describe('createClinic', () => {
    beforeEach(() => {
      fetchMock.mockReset();
      vi.stubGlobal('fetch', fetchMock);
    });

    it('POST /v1/admin/clinics ga to\'g\'ri body yuboradi va { clinic, license } qaytaradi', async () => {
      const clinic = {
        id: 'c1',
        name: 'New Clinic',
        contactEmail: 'new@test.com',
        contactPhone: null,
        createdAt: '2026-07-04T00:00:00.000Z',
      };
      const license = {
        id: 'lic1',
        clinicId: 'c1',
        branchId: 'b1',
        licenseKey: 'ABCDE-FGHIJ-KLMNO-PQRST',
        fingerprint: null,
        plan: 'standard',
        modules: ['patients'],
        gracePeriodDays: 30,
        expiresAt: '2027-07-04T00:00:00.000Z',
        isActive: true,
        lastHeartbeatAt: null,
        activatedAt: null,
        createdAt: '2026-07-04T00:00:00.000Z',
      };
      fetchMock.mockResolvedValueOnce(jsonResponse({ clinic, license }));

      const result = await createClinic({
        name: 'New Clinic',
        contactEmail: 'new@test.com',
        plan: 'standard',
        expiresAt: '2027-07-04',
        gracePeriodDays: 30,
      });

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/v1/admin/clinics'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            name: 'New Clinic',
            contactEmail: 'new@test.com',
            plan: 'standard',
            expiresAt: '2027-07-04',
            gracePeriodDays: 30,
          }),
        }),
      );
      expect(result).toEqual({ clinic, license });
    });

    it('server 400/500 qaytarsa generic xato tashlaydi', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ success: false }, false));

      await expect(
        createClinic({
          name: '',
          plan: 'starter',
          expiresAt: '2027-01-01',
          gracePeriodDays: 30,
        }),
      ).rejects.toThrow("Klinika yaratib bo'lmadi");
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**
  `cd apps/supervisor-admin && bun run test -- clinics.api.test.ts` (runs `vitest run`) — fails: `createClinic` is not exported from `clinics.api.ts` yet (import error).

- [ ] **Step 3: Write minimal implementation**

  In `apps/supervisor-admin/package.json`, add to `"dependencies"` (alongside the existing `@mantine/form` line):
  ```json
  "mantine-form-zod-resolver": "^1.3.0",
  "zod": "^4.4.3",
  ```
  Then run `bun install` at the repo root so the lockfile picks them up.

  In `apps/supervisor-admin/src/features/clinics/clinics.types.ts`, add:
  ```ts
  export interface CreateClinicInput {
    name: string;
    contactEmail?: string;
    contactPhone?: string;
    plan: 'starter' | 'standard' | 'premium' | 'enterprise';
    expiresAt: string;
    gracePeriodDays: number;
  }
  ```

  Create `apps/supervisor-admin/src/features/clinics/clinics.schema.ts`:
  ```ts
  import { z } from 'zod';

  // Server-side createClinicSchema (apps/supervisor-api/src/modules/clinics/clinics.routes.ts:12-19)
  // mirrored 1:1 for client-side @mantine/form validation via zod4Resolver.
  export const createClinicFormSchema = z.object({
    name: z.string().min(1, "Klinika nomi kiritilishi shart"),
    contactEmail: z.union([z.string().email("Email formati noto'g'ri"), z.literal('')]).optional(),
    contactPhone: z.string().optional(),
    plan: z.enum(['starter', 'standard', 'premium', 'enterprise'], {
      message: 'Tarifni tanlang',
    }),
    expiresAt: z.string().min(1, 'Amal qilish muddatini tanlang'),
    gracePeriodDays: z.number().int().min(1).max(365),
  });

  export type CreateClinicFormValues = z.infer<typeof createClinicFormSchema>;
  ```

  In `apps/supervisor-admin/src/features/clinics/clinics.api.ts`, add:
  ```ts
  import type { Clinic, ClinicDetail, CreateClinicInput } from './clinics.types';

  export const createClinic = async (input: CreateClinicInput): Promise<ClinicDetail> => {
    const res = await authFetch('/v1/admin/clinics', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error("Klinika yaratib bo'lmadi");
    return res.json();
  };
  ```
  (`Clinic` import already present in the file for `fetchClinics`'s return type — just extend the existing type-only import line to also bring in `CreateClinicInput`.)

- [ ] **Step 4: Run test to verify it passes**
  Same command as Step 2 — both new cases green.

- [ ] **Step 5: Commit**
  `git add apps/supervisor-admin/package.json apps/supervisor-admin/bun.lock apps/supervisor-admin/src/features/clinics/clinics.types.ts apps/supervisor-admin/src/features/clinics/clinics.schema.ts apps/supervisor-admin/src/features/clinics/clinics.api.ts apps/supervisor-admin/src/features/clinics/clinics.api.test.ts` — message: `feat(supervisor-admin): add createClinic API client + zod schema (CLI-368)`

---

### Task 2: `CreateClinicModal` component (form + success view with license key + copy)

**Files:**
- Create: `apps/supervisor-admin/src/features/clinics/components/CreateClinicModal.tsx`
- Test: `apps/supervisor-admin/src/features/clinics/components/CreateClinicModal.test.tsx` (new file)

**Interfaces:**
- Consumes: `createClinic(input: CreateClinicInput): Promise<ClinicDetail>` from Task 1, via `useMutation`.
- Props: `{ opened: boolean; onClose: () => void }`.
- Produces: on submit success, renders `data.license.licenseKey` in a persistent block with a `CopyButton`; does not auto-close; calls `onClose` only when the user clicks the explicit "Yopish" button. On submit failure, shows an error message in the form view (form values preserved, resubmit possible).

- [ ] **Step 1: Write the failing test**

  Create `apps/supervisor-admin/src/features/clinics/components/CreateClinicModal.test.tsx`:
  ```tsx
  import { fireEvent, screen, waitFor } from '@testing-library/react';
  import { beforeEach, describe, expect, it, vi } from 'vitest';
  import { renderApp } from '../../../test-utils';
  import { CreateClinicModal } from './CreateClinicModal';

  const fetchMock = vi.fn();
  const jsonResponse = (body: unknown, ok = true) => ({ ok, json: async () => body });

  describe('CreateClinicModal', () => {
    beforeEach(() => {
      fetchMock.mockReset();
      vi.stubGlobal('fetch', fetchMock);
      // CopyButton uses @mantine/hooks' useClipboard -> navigator.clipboard.writeText;
      // jsdom doesn't implement it, so stub it per-test (not in the global test-setup.ts,
      // this is the first component in the app to need it).
      Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    });

    it("bo'sh nom bilan submit qilinsa validatsiya xatosini ko'rsatadi va so'rov yubormaydi", async () => {
      renderApp(<CreateClinicModal opened onClose={vi.fn()} />);

      fireEvent.click(screen.getByRole('button', { name: 'Yaratish' }));

      expect(await screen.findByText('Klinika nomi kiritilishi shart')).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("to'g'ri to'ldirilgan formani submit qilganda POST /v1/admin/clinics chaqiradi va litsenziya kalitini ko'rsatadi", async () => {
      const clinic = {
        id: 'c1',
        name: 'New Clinic',
        contactEmail: null,
        contactPhone: null,
        createdAt: '2026-07-04T00:00:00.000Z',
      };
      const license = {
        id: 'lic1',
        clinicId: 'c1',
        branchId: 'b1',
        licenseKey: 'ABCDE-FGHIJ-KLMNO-PQRST',
        fingerprint: null,
        plan: 'standard',
        modules: ['patients'],
        gracePeriodDays: 30,
        expiresAt: '2027-07-04T00:00:00.000Z',
        isActive: true,
        lastHeartbeatAt: null,
        activatedAt: null,
        createdAt: '2026-07-04T00:00:00.000Z',
      };
      fetchMock.mockResolvedValueOnce(jsonResponse({ clinic, license }));

      const onClose = vi.fn();
      renderApp(<CreateClinicModal opened onClose={onClose} />);

      fireEvent.change(screen.getByLabelText('Klinika nomi'), {
        target: { value: 'New Clinic' },
      });
      fireEvent.change(screen.getByLabelText('Amal qilish muddati'), {
        target: { value: '2027-07-04' },
      });
      // Tarif maydonini bu testda ataylab tegmaymiz — Mantine v7ning
      // non-searchable Select'i readOnly combobox input render qiladi;
      // fireEvent.change onChange'ni ishga tushirmaydi (faqat option-click
      // ishlaydi), shuning uchun forma `plan` uchun useForm initialValues'dagi
      // 'starter' default'ida qoladi va aynan shu qiymat tekshiriladi.

      fireEvent.click(screen.getByRole('button', { name: 'Yaratish' }));

      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      const [, init] = fetchMock.mock.calls[0];
      expect(JSON.parse(init.body)).toMatchObject({ name: 'New Clinic', plan: 'starter' });

      expect(await screen.findByText('ABCDE-FGHIJ-KLMNO-PQRST')).toBeInTheDocument();

      // onClose hali chaqirilmagan — muvaffaqiyat holati avto-yopilmaydi.
      expect(onClose).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Nusxalash' }));
      await waitFor(() =>
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('ABCDE-FGHIJ-KLMNO-PQRST'),
      );

      fireEvent.click(screen.getByRole('button', { name: 'Yopish' }));
      expect(onClose).toHaveBeenCalled();
    });

    it('server xato qaytarsa forma view ichida xato xabarini ko\'rsatadi (forma qayta ishlatiladi)', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ success: false }, false));
      renderApp(<CreateClinicModal opened onClose={vi.fn()} />);

      fireEvent.change(screen.getByLabelText('Klinika nomi'), {
        target: { value: 'New Clinic' },
      });
      fireEvent.change(screen.getByLabelText('Amal qilish muddati'), {
        target: { value: '2027-07-04' },
      });
      // Tarifga tegilmaydi — 'starter' default'i required-validatsiyani
      // qondirish uchun yetarli (bu testda plan qiymati tekshirilmaydi).
      fireEvent.click(screen.getByRole('button', { name: 'Yaratish' }));

      expect(await screen.findByText("Klinika yaratib bo'lmadi")).toBeInTheDocument();
      expect(screen.getByLabelText('Klinika nomi')).toHaveValue('New Clinic');
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**
  `cd apps/supervisor-admin && bun run test -- CreateClinicModal.test.tsx` — fails: module `./CreateClinicModal` doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

  Create `apps/supervisor-admin/src/features/clinics/components/CreateClinicModal.tsx`:
  ```tsx
  import {
    Alert,
    Button,
    Code,
    CopyButton,
    Group,
    Modal,
    NumberInput,
    Select,
    Stack,
    Text,
    TextInput,
  } from '@mantine/core';
  import { useForm } from '@mantine/form';
  import { useMutation, useQueryClient } from '@tanstack/react-query';
  import { zod4Resolver } from 'mantine-form-zod-resolver';
  import { useState } from 'react';
  import { createClinic } from '../clinics.api';
  import { createClinicFormSchema, type CreateClinicFormValues } from '../clinics.schema';
  import type { ClinicDetail } from '../clinics.types';

  const PLAN_OPTIONS = [
    { value: 'starter', label: "Boshlang'ich" },
    { value: 'standard', label: 'Standart' },
    { value: 'premium', label: 'Premium' },
    { value: 'enterprise', label: 'Korporativ' },
  ];

  interface Props {
    opened: boolean;
    onClose: () => void;
  }

  export const CreateClinicModal = ({ opened, onClose }: Props) => {
    const qc = useQueryClient();
    const [created, setCreated] = useState<ClinicDetail | null>(null);

    const form = useForm<CreateClinicFormValues>({
      initialValues: {
        name: '',
        contactEmail: '',
        contactPhone: '',
        plan: 'starter',
        expiresAt: '',
        gracePeriodDays: 30,
      },
      validate: zod4Resolver(createClinicFormSchema),
    });

    const mutation = useMutation({
      mutationFn: (values: CreateClinicFormValues) =>
        createClinic({
          name: values.name,
          contactEmail: values.contactEmail || undefined,
          contactPhone: values.contactPhone || undefined,
          plan: values.plan,
          expiresAt: values.expiresAt,
          gracePeriodDays: values.gracePeriodDays,
        }),
      onSuccess: (data) => {
        setCreated(data);
        qc.invalidateQueries({ queryKey: ['clinics'] });
      },
    });

    const handleClose = () => {
      setCreated(null);
      form.reset();
      mutation.reset();
      onClose();
    };

    return (
      <Modal
        opened={opened}
        onClose={created ? () => {} : handleClose}
        closeOnClickOutside={!created}
        closeOnEscape={!created}
        withCloseButton={!created}
        title="Yangi klinika"
      >
        {created ? (
          <Stack>
            <Text>
              <b>{created.clinic.name}</b> yaratildi ({created.license?.plan}).
            </Text>
            <Text size="sm" c="dimmed">
              Bu litsenziya kalitini hozir nusxalab, klinikaga yetkazing — oynani yopishdan oldin
              saqlab qo'yganingizga ishonch hosil qiling.
            </Text>
            <Code block>{created.license?.licenseKey}</Code>
            <Group>
              <CopyButton value={created.license?.licenseKey ?? ''}>
                {({ copied, copy }) => (
                  <Button color={copied ? 'teal' : 'blue'} onClick={copy}>
                    {copied ? 'Nusxalandi!' : 'Nusxalash'}
                  </Button>
                )}
              </CopyButton>
              <Button variant="outline" onClick={handleClose}>
                Yopish
              </Button>
            </Group>
          </Stack>
        ) : (
          <form onSubmit={form.onSubmit((values) => mutation.mutate(values))}>
            <Stack>
              {mutation.isError && (
                <Alert color="red">
                  {mutation.error instanceof Error
                    ? mutation.error.message
                    : "Klinika yaratib bo'lmadi"}
                </Alert>
              )}
              <TextInput label="Klinika nomi" {...form.getInputProps('name')} />
              <TextInput
                label="Kontakt email"
                type="email"
                {...form.getInputProps('contactEmail')}
              />
              <TextInput label="Kontakt telefon" {...form.getInputProps('contactPhone')} />
              <Select
                label="Tarif"
                data={PLAN_OPTIONS}
                {...form.getInputProps('plan')}
              />
              <TextInput
                label="Amal qilish muddati"
                type="date"
                {...form.getInputProps('expiresAt')}
              />
              <NumberInput
                label="Grace period (kun)"
                min={1}
                max={365}
                {...form.getInputProps('gracePeriodDays')}
              />
              <Group justify="flex-end">
                <Button variant="outline" onClick={handleClose}>
                  Bekor qilish
                </Button>
                <Button type="submit" loading={mutation.isPending}>
                  Yaratish
                </Button>
              </Group>
            </Stack>
          </form>
        )}
      </Modal>
    );
  };
  ```

  Note: Mantine's `Select` fires `onChange` with the raw value string, not a native change event — `fireEvent.change(screen.getByLabelText('Tarif'), { target: { value: 'standard' } })` works against Mantine v7's underlying `<input>` (read-only combobox input backed by a hidden native select-like behavior); if this specific interaction doesn't fire the expected value in the test run, fall back to `fireEvent.click` to open it then `fireEvent.click(screen.getByText('Standart'))` to pick the option — adjust the test in Step 2/4 iteration, not the component, since `form.getInputProps('plan')` is the standard-correct wiring.

- [ ] **Step 4: Run test to verify it passes**
  Same command as Step 2 — all 3 cases green. If the `Select` interaction in the second test needs the combobox-click fallback described above, update the test (not the component) and re-run.

- [ ] **Step 5: Commit**
  `git add apps/supervisor-admin/src/features/clinics/components/CreateClinicModal.tsx apps/supervisor-admin/src/features/clinics/components/CreateClinicModal.test.tsx` — message: `feat(supervisor-admin): add CreateClinicModal with license-key reveal (CLI-368)`

---

### Task 3: Wire the modal into `ClinicsPage` and enable the "+ Yangi klinika" button

**Files:**
- Modify: `apps/supervisor-admin/src/features/clinics/ClinicsPage.tsx:1-2, 27-37` (imports + the disabled-button block)
- Test: `apps/supervisor-admin/src/features/clinics/ClinicsPage.test.tsx` (extend the existing `describe('ClinicsPage', ...)` block)

**Interfaces:**
- Consumes: `CreateClinicModal` from Task 2 (`opened`/`onClose` props via `useDisclosure` from `@mantine/hooks`, already a dependency).
- Produces: clicking "+ Yangi klinika" opens the modal; the modal's own `onSuccess` (Task 2) invalidates the `['clinics']` query that `ClinicsPage` already reads, so the new clinic appears in the table without any extra wiring needed on this page.

- [ ] **Step 1: Write the failing test**

  Add to `apps/supervisor-admin/src/features/clinics/ClinicsPage.test.tsx` (inside the existing `describe('ClinicsPage', ...)` block, reusing the file's existing `fetchMock`/`jsonResponse` setup):
  ```tsx
  it("'+ Yangi klinika' bosilganda modal ochiladi va yaratilgandan so'ng ro'yxat yangilanadi", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'POST' && url.endsWith('/v1/admin/clinics')) {
        const newClinic = {
          id: 'c3',
          name: 'New Clinic',
          contactEmail: null,
          contactPhone: null,
          createdAt: '2026-07-04T00:00:00.000Z',
        };
        return jsonResponse({
          clinic: newClinic,
          license: licenseFor('c3', { plan: 'standard' }),
        });
      }
      if (url.endsWith('/v1/admin/clinics')) {
        return jsonResponse([clinicOne, clinicTwo]);
      }
      if (url.endsWith('/v1/admin/clinics/c1')) {
        return jsonResponse({ clinic: clinicOne, license: licenseFor('c1', { isActive: true }) });
      }
      if (url.endsWith('/v1/admin/clinics/c2')) {
        return jsonResponse({ clinic: clinicTwo, license: licenseFor('c2', { isActive: false }) });
      }
      throw new Error(`unhandled fetch: ${url} ${init?.method ?? 'GET'}`);
    });

    renderApp(<ClinicsPage />);
    await screen.findByText('Clinic One');

    const button = screen.getByRole('button', { name: '+ Yangi klinika' });
    expect(button).not.toBeDisabled();
    fireEvent.click(button);

    fireEvent.change(screen.getByLabelText('Klinika nomi'), {
      target: { value: 'New Clinic' },
    });
    fireEvent.change(screen.getByLabelText('Amal qilish muddati'), {
      target: { value: '2027-07-04' },
    });
    fireEvent.change(screen.getByLabelText('Tarif'), { target: { value: 'standard' } });
    fireEvent.click(screen.getByRole('button', { name: 'Yaratish' }));

    expect(await screen.findByText(/KEY-c3/)).toBeInTheDocument();
  });
  ```
  (Add `fireEvent` to the existing `@testing-library/react` import at the top of the file, alongside the already-imported `screen`.)

- [ ] **Step 2: Run test to verify it fails**
  `cd apps/supervisor-admin && bun run test -- ClinicsPage.test.tsx` — fails: button is `disabled`, clicking it does nothing, no modal/form fields exist in the DOM.

- [ ] **Step 3: Write minimal implementation**

  In `apps/supervisor-admin/src/features/clinics/ClinicsPage.tsx`, change the import line:
  ```tsx
  import { Badge, Button, Group, Table, Text, Title } from '@mantine/core';
  import { useDisclosure } from '@mantine/hooks';
  import { useQueries, useQuery } from '@tanstack/react-query';
  import { Link } from 'react-router-dom';
  import { CreateClinicModal } from './components/CreateClinicModal';
  import { fetchClinicDetail, fetchClinics } from './clinics.api';
  ```
  (Drop the now-unused `Tooltip` import.)

  Inside the component, add before `return`:
  ```tsx
  const [opened, { open, close }] = useDisclosure(false);
  ```

  Replace lines 27-37 (the `Group`/`Tooltip`/disabled `Button` block) with:
  ```tsx
  <Group justify="space-between" mb="md">
    <Title order={2}>Klinikalar</Title>
    <Button onClick={open}>+ Yangi klinika</Button>
  </Group>
  <CreateClinicModal opened={opened} onClose={close} />
  ```

- [ ] **Step 4: Run test to verify it passes**
  Same command as Step 2 — new case green, plus re-run the full `ClinicsPage.test.tsx` file to confirm the 3 pre-existing tests (list display, badge, error state) are still green (they don't touch the button/modal).

- [ ] **Step 5: Commit**
  `git add apps/supervisor-admin/src/features/clinics/ClinicsPage.tsx apps/supervisor-admin/src/features/clinics/ClinicsPage.test.tsx` — message: `feat(supervisor-admin): wire CreateClinicModal into ClinicsPage (CLI-368)`

---

## Self-review

- **Placeholders:** none — every code block is the literal diff/file content to apply, derived from files actually read (`ClinicsPage.tsx`, `ClinicsPage.test.tsx`, `ClinicDetailPage.tsx`, `clinics.api.ts`, `clinics.types.ts`, `clinics.routes.ts:1-135`, `apps/supervisor-admin/package.json`, `apps/web/package.json`, `test-utils.tsx`, `test-setup.ts`, `vitest.config.ts`, and the CLI-365 plan for house style).
- **Request/response shape exactness:** request body fields (`name`, `contactEmail?`, `contactPhone?`, `plan`, `expiresAt`, `gracePeriodDays?`) and response shape (`{ clinic, license }`) are copied verbatim from `createClinicSchema` and the `c.json({ clinic: result.clinic, license: result.license })` return in `clinics.routes.ts:74-118` — not guessed.
- **No backend task:** confirmed by reading the full route handler that `POST /v1/admin/clinics` already creates clinic + branch + license in one transaction and returns the license key directly in the same response — nothing to build server-side. This plan is 100% frontend.
- **New dependency justification:** `zod` + `mantine-form-zod-resolver` are added because the task brief and CLAUDE.md §5 mandate `zod4Resolver` for all Mantine forms in this codebase (Zod 4, plain `zodResolver` reads the wrong error shape and crashes on invalid submit) — versions pinned to match `apps/web`'s existing versions exactly, avoiding a second version of the same libraries in the monorepo. `@mantine/dates` is deliberately NOT added (native `<input type="date">` suffices for a single ISO-date field), and `@mantine/notifications` is deliberately NOT added (the license-key reveal must NOT be a toast — see Global Constraints).
- **Test-only risk flagged honestly:** Task 2's Step 3 note calls out that Mantine `Select`'s DOM interaction in jsdom/Testing Library sometimes needs a click-to-open + click-option pattern instead of a plain `fireEvent.change`; the plan tells the implementer to adjust the *test* if Step 4 fails on that specific line, not to change the component wiring (`form.getInputProps('plan')` is correct regardless of how the test drives it).
- **Clipboard stubbing scope:** `navigator.clipboard.writeText` is stubbed per-test-file (inside `CreateClinicModal.test.tsx`'s `beforeEach`), not added to the shared `src/test-setup.ts` — keeps the change scoped to the one component that needs it, no risk of altering behavior for other existing test files.
- **Existing tests unaffected:** confirmed by reading `ClinicsPage.test.tsx` in full — none of its 3 existing cases assert on the disabled button or the tooltip text, so removing both is safe.
- **Unverified, non-blocking:** `clinics.schema.ts`'s custom Uzbek messages (`z.string().email("...")`, `z.enum([...], { message: '...' })`) are Zod 4 syntax that should surface as-typed, but this hasn't been runtime-verified against the exact `zod@^4.4.3` used elsewhere in the repo (Qaror #12 territory — this codebase has already hit one Zod-4-vs-3 API mismatch). If Task 2 Step 4 shows a default Zod message instead of the custom Uzbek one, that's a message-text-only issue (not a crash) — adjust the schema syntax, not the resolver choice.
