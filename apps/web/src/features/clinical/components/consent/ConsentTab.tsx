import type { ConsentTemplate, ConsentType } from '@dental/api-client';
import { Mono, Tag } from '@dental/ui';
import {
  Button,
  Card,
  Group,
  Modal,
  Paper,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconFileText, IconPlus, IconWriting } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth-store.ts';
import {
  useConsentForms,
  useConsentTemplates,
  useCreateConsentTemplate,
  useSignConsent,
} from '../../clinical.api';
import { templateBodyForLang, toConsentFormVM } from '../../clinical.mappers';

type Props = { patientId: string };

const TYPE_OPTIONS: ConsentType[] = [
  'treatment',
  'anesthesia',
  'photo',
  'data_processing',
  'other',
];

export function ConsentTab({ patientId }: Props) {
  const { t, i18n } = useTranslation();
  const { hasPermission } = useAuthStore();
  const [signOpened, signCtl] = useDisclosure(false);
  const [tplOpened, tplCtl] = useDisclosure(false);

  const [selectedTplId, setSelectedTplId] = useState<string | null>(null);
  const [signType, setSignType] = useState<ConsentType>('treatment');
  const [signTitle, setSignTitle] = useState('');
  const [signBody, setSignBody] = useState('');
  const [signSignature, setSignSignature] = useState('');

  const [tplType, setTplType] = useState<ConsentType>('treatment');
  const [tplTitle, setTplTitle] = useState('');
  const [tplBodyUz, setTplBodyUz] = useState('');
  const [tplBodyRu, setTplBodyRu] = useState('');

  const tplQuery = useConsentTemplates();
  const formsQuery = useConsentForms(patientId);
  const createTplMut = useCreateConsentTemplate();
  const signMut = useSignConsent(patientId);

  const canManage = hasPermission('consent.manage');
  const canView = hasPermission('consent.view');

  if (!canView) return <Text c="dimmed">{t('patients.no_medical_permission')}</Text>;

  const lang = i18n.language === 'ru' ? 'ru' : 'uz';

  const applyTemplate = (tpl: ConsentTemplate) => {
    setSelectedTplId(tpl.id);
    setSignType(tpl.type);
    setSignTitle(tpl.title);
    setSignBody(templateBodyForLang(tpl, lang));
  };

  const createTemplate = () => {
    createTplMut.mutate(
      {
        type: tplType,
        title: tplTitle,
        bodyUz: tplBodyUz,
        bodyRu: tplBodyRu || undefined,
      },
      {
        onSuccess: () => {
          setTplTitle('');
          setTplBodyUz('');
          setTplBodyRu('');
          tplCtl.close();
        },
      },
    );
  };

  const sign = () => {
    signMut.mutate(
      {
        patientId,
        templateId: selectedTplId ?? undefined,
        type: signType,
        title: signTitle,
        bodyText: signBody,
        language: lang,
        patientSignatureName: signSignature || undefined,
      },
      {
        onSuccess: () => {
          setSelectedTplId(null);
          setSignTitle('');
          setSignBody('');
          setSignSignature('');
          signCtl.close();
        },
      },
    );
  };

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

      {formsQuery.isLoading && <Text>{t('common.loading')}</Text>}
      {!formsQuery.isLoading && formsQuery.data?.length === 0 && (
        <Paper withBorder p="md">
          <Text c="dimmed">{t('consent.empty')}</Text>
        </Paper>
      )}

      {formsQuery.data?.map(toConsentFormVM).map((vm) => (
        <Card key={vm.id} withBorder padding="md">
          <Stack gap="xs">
            <Group justify="space-between">
              <Group gap={6}>
                <IconFileText size={16} />
                <Text fw={700}>{vm.title}</Text>
              </Group>
              <Group gap="xs">
                <Tag>{t(vm.typeLabelKey)}</Tag>
                <Mono>{vm.languageUpper}</Mono>
              </Group>
            </Group>
            <Text size="xs" c="dimmed">
              {t('consent.signed_at')}: {vm.signedAtText}
              {vm.signerName && ` — ${vm.signerName}`}
            </Text>
            <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
              {vm.bodyPreview}
            </Text>
          </Stack>
        </Card>
      ))}

      {/* Sign form modal */}
      <Modal opened={signOpened} onClose={signCtl.close} title={t('consent.sign_new')} size="xl">
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
              value={selectedTplId}
              onChange={(v) => {
                setSelectedTplId(v);
                if (v) {
                  const tpl = tplQuery.data?.find((x) => x.id === v);
                  if (tpl) applyTemplate(tpl);
                }
              }}
            />
          ) : (
            <Text c="dimmed">{t('consent.no_templates')}</Text>
          )}
          <Select
            label={t('consent.type')}
            data={TYPE_OPTIONS.map((tp) => ({ value: tp, label: t(`consent.type_${tp}`) }))}
            value={signType}
            onChange={(v) => v && setSignType(v as ConsentType)}
          />
          <TextInput
            label={t('consent.template_title')}
            value={signTitle}
            onChange={(e) => setSignTitle(e.currentTarget.value)}
            required
          />
          <Textarea
            label={t('consent.body_text')}
            value={signBody}
            onChange={(e) => setSignBody(e.currentTarget.value)}
            rows={10}
            required
          />
          <TextInput
            label={t('consent.patient_signature_name')}
            value={signSignature}
            onChange={(e) => setSignSignature(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={signCtl.close}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={sign}
              loading={signMut.isPending}
              disabled={!signTitle || signBody.length < 10}
            >
              {t('consent.sign')}
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Template create modal */}
      <Modal
        opened={tplOpened}
        onClose={tplCtl.close}
        title={t('consent.create_template')}
        size="xl"
      >
        <Stack gap="md">
          <Select
            label={t('consent.type')}
            data={TYPE_OPTIONS.map((tp) => ({ value: tp, label: t(`consent.type_${tp}`) }))}
            value={tplType}
            onChange={(v) => v && setTplType(v as ConsentType)}
          />
          <TextInput
            label={t('consent.template_title')}
            value={tplTitle}
            onChange={(e) => setTplTitle(e.currentTarget.value)}
            required
          />
          <Textarea
            label={t('consent.body_uz')}
            value={tplBodyUz}
            onChange={(e) => setTplBodyUz(e.currentTarget.value)}
            rows={8}
            required
          />
          <Textarea
            label={t('consent.body_ru')}
            value={tplBodyRu}
            onChange={(e) => setTplBodyRu(e.currentTarget.value)}
            rows={8}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={tplCtl.close}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={createTemplate}
              loading={createTplMut.isPending}
              disabled={!tplTitle || tplBodyUz.length < 10}
            >
              {t('common.save')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
