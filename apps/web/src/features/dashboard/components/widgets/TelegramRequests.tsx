import { ApiError } from '@dental/api-client';
import {
  Box,
  Button,
  Group,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth-store.ts';
import {
  type BookingRequestRow,
  useBookingRequests,
  useConfirmBookingRequest,
  useDeclineBookingRequest,
  useDoctorOptions,
} from '../../reception.api.ts';

type Tab = 'pending' | 'expired';

/**
 * FX-172: «boshqa shifokor» tanlovi — faqat so'rov FILIALIDA ishlaydigan shifokorlar
 * (`GET /appointments/doctors?branchId=`); boshqa filial shifokori taklif qilinmaydi.
 */
function DoctorPick({
  branchId,
  pending,
  onConfirm,
}: {
  branchId: string;
  pending: boolean;
  onConfirm: (doctorId: string) => void;
}) {
  const { t } = useTranslation();
  const doctors = useDoctorOptions(branchId);
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <Group gap="xs" mt="xs" align="flex-start" wrap="nowrap">
      <Select
        size="xs"
        style={{ flex: 1 }}
        aria-label={t('telegramRequests.pick_doctor')}
        placeholder={t('telegramRequests.pick_doctor')}
        data={(doctors.data ?? []).map((d) => ({ value: d.id, label: d.name }))}
        value={picked}
        onChange={setPicked}
      />
      <Button
        size="xs"
        disabled={!picked}
        loading={pending}
        onClick={() => picked && onConfirm(picked)}
      >
        {t('telegramRequests.confirm_other_doctor')}
      </Button>
    </Group>
  );
}

/**
 * Telegram bron so'rovlari umumiy widget'i (FX-23): har qatorda «Tasdiqlash» / «Rad etish» (sabab bilan),
 * «Muddati o'tgan» tab (faqat ko'rish). `compact` (Mudir/Shifokor/Generic bosh sahifalari) — faqat
 * `appointment.create` bor rolga va kamida bitta kutilayotgan so'rov bo'lganda chiziladi.
 * Ro'yxat davriy yangilanadi (`useBookingRequests`), sidebar badge bilan bir query-key.
 */
export function TelegramRequests({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const { hasPermission } = useAuthStore();
  const canCreate = hasPermission('appointment.create');
  const [tab, setTab] = useState<Tab>('pending');
  const pendingQ = useBookingRequests('pending', { enabled: !compact || canCreate });
  const expiredQ = useBookingRequests('expired', { enabled: tab === 'expired' });
  const items = (tab === 'pending' ? pendingQ.data?.items : expiredQ.data?.items) ?? [];
  const pendingCount = pendingQ.data?.pendingCount ?? pendingQ.data?.items.length ?? 0;
  const canDecide = canCreate && tab === 'pending';
  const confirm = useConfirmBookingRequest();
  const decline = useDeclineBookingRequest();
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState(false);

  // FX-24: band slot (409) yoki shifokorsiz so'rov (400) — registrator boshqa shifokor tanlaydi.
  // Muddati o'tgan / allaqachon hal qilingan so'rovda shifokor tanlash yordam bermaydi.
  const needsDoctorPick = (r: BookingRequestRow) => {
    if (!r.doctorId) return true;
    const err = confirm.error;
    if (!(err instanceof ApiError) || confirm.variables?.id !== r.id) return false;
    if (err.code === 'booking_request.expired' || err.code === 'booking_request.not_pending') {
      return false;
    }
    return err.status === 409 || err.code === 'booking_request.doctor_required';
  };

  const submitDecline = (id: string) => {
    const trimmed = reason.trim();
    if (!trimmed) {
      setReasonError(true);
      return;
    }
    decline.mutate({ id, reason: trimmed });
    setDecliningId(null);
    setReason('');
    setReasonError(false);
  };

  if (compact && (!canCreate || (pendingCount === 0 && tab === 'pending'))) return null;

  return (
    <Box
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-card)',
        padding: 18,
      }}
    >
      <Group justify="space-between" align="center" wrap="nowrap">
        <Text fw={700} c="var(--ink)">
          {t('receptionToday.tg_title')}
        </Text>
        <SegmentedControl
          size="xs"
          value={tab}
          onChange={(v) => setTab(v as Tab)}
          aria-label={t('receptionToday.tg_title')}
          data={[
            {
              value: 'pending',
              label:
                pendingCount > 0
                  ? `${t('telegramRequests.tab_pending')} · ${pendingCount}`
                  : t('telegramRequests.tab_pending'),
            },
            { value: 'expired', label: t('telegramRequests.tab_expired') },
          ]}
        />
      </Group>
      {items.length === 0 ? (
        <Text size="sm" c="var(--ink-3)" mt={4}>
          {tab === 'pending' ? t('telegramRequests.empty') : t('telegramRequests.empty_expired')}
        </Text>
      ) : (
        <Stack gap="sm" mt="sm">
          {items.map((r) => (
            <Box
              key={r.id}
              style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}
              data-testid="booking-request"
            >
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Box style={{ minWidth: 0 }}>
                  <Text fw={600} size="sm" c="var(--ink)">
                    {r.patientName ?? t('receptionToday.patient_unknown')}
                  </Text>
                  <Text size="xs" c="var(--ink-3)">
                    {[
                      tab === 'expired' ? t('telegramRequests.expired_badge') : null,
                      new Date(r.requestedStart).toLocaleString('uz-UZ', {
                        timeZone: 'Asia/Tashkent',
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      }),
                      r.doctorName,
                      r.branchName,
                      r.rescheduleOfAppointmentId ? t('telegramRequests.reschedule') : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </Box>
                {canDecide && decliningId !== r.id && (
                  <Group gap="xs" wrap="nowrap">
                    <Button
                      size="xs"
                      loading={confirm.isPending}
                      onClick={() => confirm.mutate({ id: r.id })}
                    >
                      {t('telegramRequests.confirm')}
                    </Button>
                    <Button
                      size="xs"
                      variant="default"
                      onClick={() => {
                        setDecliningId(r.id);
                        setReason('');
                        setReasonError(false);
                      }}
                    >
                      {t('telegramRequests.decline')}
                    </Button>
                  </Group>
                )}
              </Group>
              {canDecide && decliningId !== r.id && needsDoctorPick(r) && (
                <DoctorPick
                  branchId={r.branchId}
                  pending={confirm.isPending}
                  onConfirm={(doctorId) => confirm.mutate({ id: r.id, doctorId })}
                />
              )}
              {canDecide && decliningId === r.id && (
                <Group gap="xs" mt="xs" align="flex-start" wrap="nowrap">
                  <TextInput
                    size="xs"
                    style={{ flex: 1 }}
                    aria-label={t('telegramRequests.reason_label')}
                    placeholder={t('telegramRequests.reason_label')}
                    value={reason}
                    maxLength={300}
                    error={reasonError ? t('telegramRequests.reason_required') : undefined}
                    onChange={(e) => {
                      setReason(e.currentTarget.value);
                      setReasonError(false);
                    }}
                  />
                  <Button
                    size="xs"
                    color="red"
                    loading={decline.isPending}
                    onClick={() => submitDecline(r.id)}
                  >
                    {t('telegramRequests.decline_submit')}
                  </Button>
                  <Button size="xs" variant="subtle" onClick={() => setDecliningId(null)}>
                    {t('telegramRequests.cancel')}
                  </Button>
                </Group>
              )}
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  );
}
