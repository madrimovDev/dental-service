import type { ConsentTemplate, ConsentType } from '@dental/api-client';
import {
  Badge,
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
import { IconPlus, IconWriting } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api.ts';
import { useAuthStore } from '@/stores/auth-store.ts';

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
  const qc = useQueryClient();
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

  const tplQuery = useQuery({
    queryKey: ['consent-templates'],
    queryFn: () => api.consent.listTemplates(),
  });

  const formsQuery = useQuery({
    queryKey: ['consent-forms', patientId],
    queryFn: () => api.consent.listForms(patientId),
  });

  const createTplMut = useMutation({
    mutationFn: () =>
      api.consent.createTemplate({
        type: tplType,
        title: tplTitle,
        bodyUz: tplBodyUz,
        bodyRu: tplBodyRu || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consent-templates'] });
      setTplTitle('');
      setTplBodyUz('');
      setTplBodyRu('');
      tplCtl.close();
    },
  });

  const signMut = useMutation({
    mutationFn: () => {
      const lang = i18n.language === 'ru' ? 'ru' : 'uz';
      return api.consent.signForm({
        patientId,
        templateId: selectedTplId ?? undefined,
        type: signType,
        title: signTitle,
        bodyText: signBody,
        language: lang,
        patientSignatureName: signSignature || undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consent-forms', patientId] });
      setSelectedTplId(null);
      setSignTitle('');
      setSignBody('');
      setSignSignature('');
      signCtl.close();
    },
  });

  const canManage = hasPermission('consent.manage');
  const canView = hasPermission('consent.view');

  if (!canView) return <Text c="dimmed">{t('patients.no_medical_permission')}</Text>;

  const applyTemplate = (tpl: ConsentTemplate) => {
    setSelectedTplId(tpl.id);
    setSignType(tpl.type);
    setSignTitle(tpl.title);
    const lang = i18n.language === 'ru' ? 'ru' : 'uz';
    setSignBody((lang === 'ru' ? tpl.bodyRu : null) || tpl.bodyUz);
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

      {formsQuery.data?.map((form) => (
        <Card key={form.id} withBorder padding="md">
          <Stack gap="xs">
            <Group justify="space-between">
              <Text fw={700}>📝 {form.title}</Text>
              <Group gap="xs">
                <Badge variant="light">{t(`consent.type_${form.type}`)}</Badge>
                <Badge variant="light" color="cyan">
                  {form.language.toUpperCase()}
                </Badge>
              </Group>
            </Group>
            <Text size="xs" c="dimmed">
              {t('consent.signed_at')}: {new Date(form.signedAt).toLocaleString()}
              {form.patientSignatureName && ` — ${form.patientSignatureName}`}
            </Text>
            <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
              {form.bodyText.slice(0, 240)}
              {form.bodyText.length > 240 && '...'}
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
              onClick={() => signMut.mutate()}
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
              onClick={() => createTplMut.mutate()}
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
