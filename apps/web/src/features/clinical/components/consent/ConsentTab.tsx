import type { ConsentType } from '@dental/api-client';
import { Card, Mono, StateView, Tag } from '@dental/ui';
import {
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { IconFileText, IconPlus, IconWriting } from '@tabler/icons-react';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useConsentForms, useCreateConsentTemplate } from '../../clinical.api';
import { toConsentFormVM } from '../../clinical.mappers';
import { type ConsentTemplateFormValues, consentTemplateFormSchema } from '../../clinical.schema';
import { CONSENT_TYPE_OPTIONS, ConsentSignForm } from './ConsentSignForm';

type Props = { patientId: string };

const TYPE_OPTIONS = CONSENT_TYPE_OPTIONS;

export function ConsentTab({ patientId }: Props) {
  const { t } = useTranslation();
  const { hasPermission } = useAuthStore();
  const [signOpened, signCtl] = useDisclosure(false);
  const [tplOpened, tplCtl] = useDisclosure(false);

  const tplForm = useForm<ConsentTemplateFormValues>({
    initialValues: { type: 'treatment', title: '', bodyUz: '', bodyRu: '' },
    validate: zod4Resolver(consentTemplateFormSchema),
  });

  const formsQuery = useConsentForms(patientId);
  const createTplMut = useCreateConsentTemplate();

  const canManage = hasPermission('consent.manage');
  const canView = hasPermission('consent.view');

  if (!canView) return <Text c="dimmed">{t('patients.no_medical_permission')}</Text>;

  const createTemplate = tplForm.onSubmit((values) => {
    createTplMut.mutate(
      {
        type: values.type as ConsentType,
        title: values.title,
        bodyUz: values.bodyUz,
        bodyRu: values.bodyRu || undefined,
      },
      {
        onSuccess: () => {
          tplForm.reset();
          tplCtl.close();
        },
      },
    );
  });

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={4}>{t('consent.title')}</Title>
        <Group>
          {canManage && (
            <>
              <Button variant="default" leftSection={<IconPlus size={16} />} onClick={tplCtl.open}>
                {t('consent.create_template')}
              </Button>
              <Button leftSection={<IconWriting size={16} />} onClick={signCtl.open}>
                {t('consent.sign_new')}
              </Button>
            </>
          )}
        </Group>
      </Group>

      {formsQuery.isError ? (
        <StateView
          status="error"
          title={t('states.error_title')}
          retryLabel={t('states.retry')}
          onRetry={() => formsQuery.refetch()}
        />
      ) : formsQuery.isLoading ? (
        <StateView status="loading" skeleton="cards" />
      ) : (formsQuery.data?.length ?? 0) === 0 ? (
        <StateView status="empty" title={t('consent.empty')} />
      ) : (
        formsQuery.data?.map(toConsentFormVM).map((vm) => (
          <Card
            key={vm.id}
            title={
              <Group gap={6}>
                <IconFileText size={16} />
                <Text fw={700}>{vm.title}</Text>
              </Group>
            }
            actions={
              <>
                <Tag>{t(vm.typeLabelKey)}</Tag>
                <Mono>{vm.languageUpper}</Mono>
              </>
            }
          >
            <Stack gap="xs">
              <Text style={{ fontSize: '11.5px', color: 'var(--ink-3)' }}>
                {t('consent.signed_at')}: {vm.signedAtText}
                {vm.signerName && ` — ${vm.signerName}`}
              </Text>
              <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                {vm.bodyPreview}
              </Text>
            </Stack>
          </Card>
        ))
      )}

      {/* Sign form modal */}
      <Modal opened={signOpened} onClose={signCtl.close} title={t('consent.sign_new')} size="xl">
        <ConsentSignForm patientId={patientId} onSigned={signCtl.close} onCancel={signCtl.close} />
      </Modal>

      {/* Template create modal */}
      <Modal
        opened={tplOpened}
        onClose={tplCtl.close}
        title={t('consent.create_template')}
        size="xl"
      >
        <form onSubmit={createTemplate}>
          <Stack gap="md">
            <Select
              label={t('consent.type')}
              data={TYPE_OPTIONS.map((tp) => ({ value: tp, label: t(`consent.type_${tp}`) }))}
              {...tplForm.getInputProps('type')}
            />
            <TextInput
              label={t('consent.template_title')}
              required
              {...tplForm.getInputProps('title')}
            />
            <Textarea
              label={t('consent.body_uz')}
              rows={8}
              required
              {...tplForm.getInputProps('bodyUz')}
            />
            <Textarea label={t('consent.body_ru')} rows={8} {...tplForm.getInputProps('bodyRu')} />
            <Group justify="flex-end">
              <Button variant="default" onClick={tplCtl.close}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" loading={createTplMut.isPending} disabled={!tplForm.isValid()}>
                {t('common.save')}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
