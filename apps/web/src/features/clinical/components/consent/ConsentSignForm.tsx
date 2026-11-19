import type { ConsentForm, ConsentTemplate, ConsentType } from '@dental/api-client';
import { Button, Checkbox, Group, Select, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useTranslation } from 'react-i18next';
import { useConsentTemplates, useSignConsent } from '../../clinical.api';
import { templateBodyForLang } from '../../clinical.mappers';
import { type ConsentSignFormValues, consentSignFormSchema } from '../../clinical.schema';

export const CONSENT_TYPE_OPTIONS: ConsentType[] = [
  'treatment',
  'anesthesia',
  'photo',
  'data_processing',
  'other',
];

type Props = {
  patientId: string;
  /** FX-26: tur qat'iy berilsa (masalan reja modalida 'treatment') tur tanlagichi yashiriladi. */
  fixedType?: ConsentType;
  onSigned: (form: ConsentForm) => void;
  onCancel: () => void;
};

/**
 * FX-26: bitta imzolash formasi — Rozilik bo'limi VA davolash rejasi modali ikkalasi
 * ishlatadi (avval faqat ConsentTab ichida inline edi). Imzolangandan keyin `onSigned`
 * yaratilgan forma bilan chaqiriladi (reja modali uni `setConsent`ga uzatadi).
 */
export function ConsentSignForm({ patientId, fixedType, onSigned, onCancel }: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ru' ? 'ru' : 'uz';

  const signForm = useForm<ConsentSignFormValues>({
    initialValues: {
      templateId: null,
      type: fixedType ?? 'treatment',
      title: '',
      bodyText: '',
      patientSignatureName: '',
      // CLI-461: default muddatsiz — staff aniq muddat qo'yishni tanlasa checkbox'ni o'chiradi.
      isPerpetual: true,
      expiresAt: null,
    },
    validate: zod4Resolver(consentSignFormSchema),
  });

  const tplQuery = useConsentTemplates();
  const signMut = useSignConsent(patientId);

  const applyTemplate = (tpl: ConsentTemplate) => {
    signForm.setValues({
      templateId: tpl.id,
      type: fixedType ?? tpl.type,
      title: tpl.title,
      bodyText: templateBodyForLang(tpl, lang),
    });
  };

  const sign = signForm.onSubmit((values) => {
    signMut.mutate(
      {
        patientId,
        templateId: values.templateId ?? undefined,
        type: (fixedType ?? values.type) as ConsentType,
        title: values.title,
        bodyText: values.bodyText,
        language: lang,
        patientSignatureName: values.patientSignatureName || undefined,
        // CLI-461
        isPerpetual: values.isPerpetual,
        expiresAt: values.isPerpetual ? undefined : (values.expiresAt?.toISOString() ?? undefined),
      },
      { onSuccess: (form) => onSigned(form) },
    );
  });

  return (
    <form onSubmit={sign}>
      <Stack gap="md">
        {tplQuery.data && tplQuery.data.length > 0 ? (
          <Select
            label={t('consent.select_template')}
            placeholder={t('common.select')}
            data={tplQuery.data.map((tpl) => ({
              value: tpl.id,
              label: `${t(`consent.type_${tpl.type}`)} — ${tpl.title}`,
            }))}
            clearable
            value={signForm.values.templateId}
            onChange={(v) => {
              signForm.setFieldValue('templateId', v);
              if (v) {
                const tpl = tplQuery.data?.find((x) => x.id === v);
                if (tpl) applyTemplate(tpl);
              }
            }}
          />
        ) : (
          <Text c="dimmed">{t('consent.no_templates')}</Text>
        )}
        {!fixedType && (
          <Select
            label={t('consent.type')}
            data={CONSENT_TYPE_OPTIONS.map((tp) => ({
              value: tp,
              label: t(`consent.type_${tp}`),
            }))}
            {...signForm.getInputProps('type')}
          />
        )}
        <TextInput
          label={t('consent.template_title')}
          required
          {...signForm.getInputProps('title')}
        />
        <Textarea
          label={t('consent.body_text')}
          rows={10}
          required
          {...signForm.getInputProps('bodyText')}
        />
        <TextInput
          label={t('consent.patient_signature_name')}
          {...signForm.getInputProps('patientSignatureName')}
        />
        {/* CLI-461: muddat — treatment-plan accept gate shu ikkalasiga tayanadi. */}
        <Checkbox
          label={t('consent.is_perpetual')}
          checked={signForm.values.isPerpetual}
          onChange={(e) => signForm.setFieldValue('isPerpetual', e.currentTarget.checked)}
        />
        {!signForm.values.isPerpetual && (
          <DatePickerInput
            label={t('consent.expires_at')}
            minDate={new Date()}
            clearable
            {...signForm.getInputProps('expiresAt')}
          />
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={signMut.isPending} disabled={!signForm.isValid()}>
            {t('consent.sign')}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
