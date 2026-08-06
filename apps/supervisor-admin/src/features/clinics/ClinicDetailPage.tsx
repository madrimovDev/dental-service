import {
  Alert,
  Button,
  Code,
  CopyButton,
  Group,
  Modal,
  Paper,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { authFetch } from '../../lib/api';
import { fetchClinicDetail } from './clinics.api';

const ALL_MODULES = [
  'patients',
  'appointments',
  'queue',
  'cashier',
  'reports',
  'staff',
  'clinical',
  'lab-orders',
  'patient-images',
  'prescriptions',
  'consent',
  'erp',
  'payroll',
  'inventory',
  'branches',
];

export const ClinicDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [reinstallCreds, setReinstallCreds] = useState<{
    loginPhone: string;
    tempPassword: string;
  } | null>(null);
  const [reinstallConfirm, setReinstallConfirm] = useState(false);

  const { data, isError } = useQuery({
    queryKey: ['clinic', id],
    queryFn: () => fetchClinicDetail(id ?? ''),
    enabled: Boolean(id),
  });

  const updateModules = useMutation({
    mutationFn: async (modules: string[]) => {
      if (!data?.license) return;
      const res = await authFetch(`/v1/admin/licenses/${data.license.licenseKey}/modules`, {
        method: 'PATCH',
        body: JSON.stringify({ modules }),
      });
      if (!res.ok) throw new Error("Modulni yangilab bo'lmadi");
    },
    onSuccess: () => {
      setMutationError(null);
      qc.invalidateQueries({ queryKey: ['clinic', id] });
    },
    onError: (err) => {
      setMutationError(err instanceof Error ? err.message : "Modulni yangilab bo'lmadi");
    },
  });

  const reactivate = useMutation({
    mutationFn: async () => {
      if (!data?.license?.fingerprint) return;
      const res = await authFetch('/v1/reactivate', {
        method: 'POST',
        body: JSON.stringify({
          licenseKey: data.license.licenseKey,
          fingerprint: data.license.fingerprint,
        }),
      });
      if (!res.ok) throw new Error("Litsenziyani qayta faollashtirib bo'lmadi");
    },
    onSuccess: () => {
      setMutationError(null);
      qc.invalidateQueries({ queryKey: ['clinic', id] });
    },
    onError: (err) => {
      setMutationError(
        err instanceof Error ? err.message : "Litsenziyani qayta faollashtirib bo'lmadi",
      );
    },
  });

  const generateResetToken = useMutation({
    mutationFn: async () => {
      if (!data?.license?.id) return null;
      // CLI-477 #3 — `/v1/admin/licenses/...` namespace (boshqa admin license
      // op'lar bilan izchil); avvalgi public `/v1/:id/...` dan ko'chirildi.
      const res = await authFetch(`/v1/admin/licenses/${data.license.id}/reset-token`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error("Parol-tiklash tokenini yaratib bo'lmadi");
      return res.json() as Promise<{ resetToken: string; expiresAt: string }>;
    },
    onSuccess: (result) => {
      setMutationError(null);
      if (result) setResetToken(result.resetToken);
    },
    onError: (err) => {
      setMutationError(
        err instanceof Error ? err.message : "Parol-tiklash tokenini yaratib bo'lmadi",
      );
    },
  });

  // Qayta o'rnatishga tayyorlash (audit C1) — mijoz mashinasi almashsa yoki
  // lokal baza yo'qolsa. Server yangi vaqtinchalik parol yozadi va litsenziya
  // fingerprint'ini tozalaydi (ikkalasi BIRGA — `licenses.service.ts`
  // `prepareReinstall` izohiga qarang), shu sababli `reactivate`dan alohida
  // tugma.
  const prepareReinstall = useMutation({
    mutationFn: async () => {
      const res = await authFetch(`/v1/admin/clinics/${id}/prepare-reinstall`, {
        method: 'POST',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
        throw new Error(body?.error?.code ?? "Qayta o'rnatishga tayyorlab bo'lmadi");
      }
      return res.json() as Promise<{
        credentials: { loginPhone: string; tempPassword: string };
      }>;
    },
    onSuccess: (result) => {
      setMutationError(null);
      setReinstallCreds(result.credentials);
      setReinstallConfirm(false);
      // Fingerprint endi NULL — detal kartasi buni ko'rsatishi kerak.
      qc.invalidateQueries({ queryKey: ['clinic', id] });
    },
    onError: (err) => {
      setReinstallConfirm(false);
      setMutationError(err instanceof Error ? err.message : "Qayta o'rnatishga tayyorlab bo'lmadi");
    },
  });

  const deactivate = useMutation({
    mutationFn: async () => {
      if (!data?.clinic) return;
      const ok = confirm(
        'Litsenziyani bekor qilishni tasdiqlaysizmi? Klinika xizmatdan foydalana olmay qoladi.',
      );
      if (!ok) return;
      const res = await authFetch(`/v1/admin/clinics/${data.clinic.id}/deactivate`, {
        method: 'PATCH',
      });
      if (!res.ok) throw new Error("Litsenziyani bekor qilib bo'lmadi");
    },
    onSuccess: () => {
      setMutationError(null);
      qc.invalidateQueries({ queryKey: ['clinic', id] });
    },
    onError: (err) => {
      setMutationError(err instanceof Error ? err.message : "Litsenziyani bekor qilib bo'lmadi");
    },
  });

  if (isError) return <Text c="red">Klinika topilmadi</Text>;
  if (!data) return null;

  const activeModules: string[] = data.license?.modules ?? [];

  const toggle = (mod: string) => {
    const updated = activeModules.includes(mod)
      ? activeModules.filter((m: string) => m !== mod)
      : [...activeModules, mod];
    updateModules.mutate(updated);
  };

  return (
    <>
      <Title order={2} mb="md">
        {data.clinic.name}
      </Title>
      {mutationError && (
        <Text c="red" mb="md">
          {mutationError}
        </Text>
      )}
      <Paper p="md" withBorder mb="md">
        <Text fw={500}>Litsenziya: {data.license?.licenseKey}</Text>
        <Text c="dimmed">Tarif: {data.license?.plan}</Text>
        <Text c="dimmed">
          Amal qilish:{' '}
          {data.license?.expiresAt
            ? new Date(data.license.expiresAt).toLocaleDateString('uz')
            : '—'}
        </Text>
        <Text c="dimmed">Grace period: {data.license?.gracePeriodDays} kun</Text>
        <Text c="dimmed">
          Fingerprint: {data.license?.fingerprint ?? '— (hali faollashtirilmagan)'}
        </Text>
        <Text c={data.license?.isActive ? 'teal' : 'red'} mt="xs">
          Holat: {data.license?.isActive ? 'Faol' : 'Bekor qilingan'}
        </Text>
        {/* Vaqtinchalik owner paroli aktivatsiyadan keyin Supervisor bazasidan
            o'chiriladi — mavjudligi provisioning hali ko'chirilmaganini bildiradi. */}
        <Alert
          color={data.clinic.ownerTempPassword ? 'yellow' : 'green'}
          variant="light"
          mt="sm"
          data-testid="provisioning-status"
        >
          {data.clinic.ownerTempPassword ? (
            <>
              Aktivatsiya kutilmoqda. Login: <b>{data.clinic.ownerPhone}</b>, vaqtinchalik parol:{' '}
              <Code>{data.clinic.ownerTempPassword}</Code>
            </>
          ) : (
            <>
              Aktivatsiya qilingan — vaqtinchalik parol o'chirilgan. Parol unutilsa "Parol-tiklash
              tokeni yaratish" tugmasidan foydalaning.
            </>
          )}
        </Alert>
        <Group mt="sm">
          <Button
            size="xs"
            variant="outline"
            onClick={() => reactivate.mutate()}
            disabled={!data.license?.fingerprint}
          >
            Reactivate
          </Button>
          <Button size="xs" variant="outline" color="red" onClick={() => deactivate.mutate()}>
            Bekor qilish
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() => generateResetToken.mutate()}
            loading={generateResetToken.isPending}
          >
            Parol-tiklash tokeni yaratish
          </Button>
          <Button size="xs" variant="outline" onClick={() => setReinstallConfirm(true)}>
            Qayta o'rnatishga tayyorlash
          </Button>
        </Group>
        <Modal
          opened={reinstallConfirm}
          onClose={() => setReinstallConfirm(false)}
          title="Qayta o'rnatishga tayyorlash"
        >
          <Text size="sm" mb="md">
            Yangi vaqtinchalik parol yaratiladi va qurilma bog'lanishi (fingerprint) bekor qilinadi.
            Mijoz istalgan kompyuterda litsenziya kalitini kiritib klinikani qaytadan o'rnata oladi.
            Eski parol ishlamay qoladi.
          </Text>
          <Text size="sm" c="dimmed" mb="md">
            Eslatma: eski o'rnatma darhol to'xtamaydi — u keshlangan litsenziya bilan muddat
            tugagunicha ishlashda davom etadi. Darhol to'xtatish kerak bo'lsa litsenziyani alohida
            deaktivatsiya qiling.
          </Text>
          <Button onClick={() => prepareReinstall.mutate()} loading={prepareReinstall.isPending}>
            Tasdiqlash
          </Button>
        </Modal>
        {reinstallCreds && (
          <Paper withBorder p="md" mt="md">
            <Text fw={600} mb="xs">
              Mijozga yetkazing (bir marta ko'rsatiladi)
            </Text>
            {/* Qiymatlar ATAYIN alohida elementda (`<b>` / `<Code>`) —
                yuqoridagi provisioning Alert'i bilan bir xil idiom, matn
                bo'yicha aniq qidirish shuni talab qiladi. */}
            <Text size="sm">
              Login (telefon): <b>{reinstallCreds.loginPhone}</b>
            </Text>
            <Text size="sm">
              Vaqtinchalik parol: <Code>{reinstallCreds.tempPassword}</Code>
            </Text>
            <CopyButton value={reinstallCreds.tempPassword}>
              {({ copied, copy }) => (
                <Button size="xs" variant="subtle" onClick={copy}>
                  {copied ? 'Nusxalandi' : 'Parolni nusxalash'}
                </Button>
              )}
            </CopyButton>
          </Paper>
        )}
        {resetToken && (
          <Stack gap={4} mt="sm">
            <TextInput
              label="Parol-tiklash tokeni"
              value={resetToken}
              readOnly
              rightSection={
                <CopyButton value={resetToken}>
                  {({ copied, copy }) => (
                    <Button size="xs" variant="subtle" onClick={copy}>
                      {copied ? 'Nusxalandi' : 'Nusxalash'}
                    </Button>
                  )}
                </CopyButton>
              }
            />
            <Text size="sm" c="dimmed">
              Bir marta ko'rsatiladi — mijozga bering. 24 soat amal qiladi.
            </Text>
          </Stack>
        )}
      </Paper>
      <Title order={4} mb="sm">
        Modullar
      </Title>
      <Stack gap="xs">
        {ALL_MODULES.map((mod) => (
          <Group key={mod} justify="space-between">
            <Text>{mod}</Text>
            <Switch checked={activeModules.includes(mod)} onChange={() => toggle(mod)} />
          </Group>
        ))}
      </Stack>
    </>
  );
};
