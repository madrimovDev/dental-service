import type { Service } from '@dental/api-client';
import {
  ActionIcon,
  Badge,
  Button,
  Container,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { IconEdit, IconPlus, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from 'mantine-form-zod-resolver';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { api } from '@/lib/api.ts';
import { useAuthStore } from '@/stores/auth-store.ts';

const schema = z.object({
  code: z.string().min(1).max(64),
  nameUz: z.string().min(2).max(200),
  nameRu: z.string().max(200).optional(),
  category: z.string().max(100).optional(),
  durationMinutes: z.coerce.number().int().positive().default(30),
  isActive: z.boolean().default(true),
  initialPrice: z.coerce.number().nonnegative().optional(),
  initialBranchId: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

const formatUZS = (n: string | number) =>
  new Intl.NumberFormat('uz-UZ').format(typeof n === 'string' ? Number(n) : n) + " so'm";

export function ServicesSettingsPage() {
  const { t } = useTranslation();
  const { hasPermission } = useAuthStore();
  const qc = useQueryClient();
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState<Service | null>(null);

  const servicesQuery = useQuery({ queryKey: ['services'], queryFn: api.services.list });
  const branchesQuery = useQuery({ queryKey: ['branches'], queryFn: api.branches.list });
  const detailQuery = useQuery({
    queryKey: ['service', editing?.id],
    queryFn: () => api.services.get(editing?.id ?? ''),
    enabled: !!editing?.id && opened,
  });

  const form = useForm<FormValues>({
    initialValues: {
      code: '',
      nameUz: '',
      nameRu: '',
      category: '',
      durationMinutes: 30,
      isActive: true,
    },
    validate: zodResolver(schema),
  });

  const upsertMut = useMutation({
    mutationFn: async (values: FormValues) => {
      if (editing) {
        return api.services.update(editing.id, {
          nameUz: values.nameUz,
          nameRu: values.nameRu || null,
          category: values.category || null,
          durationMinutes: values.durationMinutes,
          isActive: values.isActive,
        });
      }
      return api.services.create(values);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['services'] });
      close();
      setEditing(null);
      form.reset();
    },
  });

  const setPriceMut = useMutation({
    mutationFn: ({ id, branchId, price }: { id: string; branchId: string; price: number }) =>
      api.services.setPrice(id, { branchId, price }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service', editing?.id] }),
  });

  const deleteMut = useMutation({
    mutationFn: api.services.remove,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  });

  const openCreate = () => {
    setEditing(null);
    form.reset();
    open();
  };

  const openEdit = (s: Service) => {
    setEditing(s);
    form.setValues({
      code: s.code,
      nameUz: s.nameUz,
      nameRu: s.nameRu ?? '',
      category: s.category ?? '',
      durationMinutes: s.durationMinutes,
      isActive: s.isActive,
    });
    open();
  };

  return (
    <Container size="xl">
      <Stack gap="lg">
        <Group justify="space-between">
          <Title order={2}>{t('services.title')}</Title>
          {hasPermission('service.manage') && (
            <Button leftSection={<IconPlus size={18} />} onClick={openCreate}>
              {t('services.create')}
            </Button>
          )}
        </Group>

        {servicesQuery.data && servicesQuery.data.length === 0 && (
          <Text c="dimmed">{t('services.empty')}</Text>
        )}
        {servicesQuery.data && servicesQuery.data.length > 0 && (
          <Table verticalSpacing="md">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('services.code')}</Table.Th>
                <Table.Th>{t('services.name')}</Table.Th>
                <Table.Th>{t('services.category')}</Table.Th>
                <Table.Th>{t('services.duration')}</Table.Th>
                <Table.Th>{t('services.status')}</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {servicesQuery.data.map((s) => (
                <Table.Tr key={s.id}>
                  <Table.Td>
                    <Text ff="monospace">{s.code}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text fw={500}>{s.nameUz}</Text>
                    {s.nameRu && (
                      <Text size="xs" c="dimmed">
                        {s.nameRu}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>{s.category ?? '—'}</Table.Td>
                  <Table.Td>
                    {s.durationMinutes} {t('services.minutes')}
                  </Table.Td>
                  <Table.Td>
                    <Badge color={s.isActive ? 'teal' : 'gray'}>
                      {s.isActive ? t('common.active') : t('common.inactive')}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs" justify="flex-end">
                      {hasPermission('service.manage') && (
                        <ActionIcon variant="subtle" onClick={() => openEdit(s)}>
                          <IconEdit size={16} />
                        </ActionIcon>
                      )}
                      {hasPermission('service.manage') && (
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          onClick={() => {
                            if (confirm(t('services.confirm_delete'))) {
                              deleteMut.mutate(s.id);
                            }
                          }}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      )}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Stack>

      <Modal
        opened={opened}
        onClose={close}
        title={editing ? `${t('services.edit')}: ${editing.code}` : t('services.create')}
        size="lg"
      >
        <form onSubmit={form.onSubmit((values) => upsertMut.mutate(values))}>
          <Stack gap="md">
            <Group grow>
              <TextInput
                label={t('services.code')}
                required
                disabled={!!editing}
                {...form.getInputProps('code')}
              />
              <TextInput
                label={t('services.category')}
                placeholder="Terapevtika / Ortopediya / ..."
                {...form.getInputProps('category')}
              />
            </Group>
            <TextInput label={t('services.name_uz')} required {...form.getInputProps('nameUz')} />
            <TextInput label={t('services.name_ru')} {...form.getInputProps('nameRu')} />
            <NumberInput
              label={t('services.duration_minutes')}
              min={5}
              step={5}
              {...form.getInputProps('durationMinutes')}
            />

            {!editing && (
              <Group grow>
                <Select
                  label={t('services.initial_branch')}
                  data={branchesQuery.data?.map((b) => ({ value: b.id, label: b.name })) ?? []}
                  clearable
                  {...form.getInputProps('initialBranchId')}
                />
                <NumberInput
                  label={t('services.initial_price')}
                  min={0}
                  step={1000}
                  suffix=" so'm"
                  {...form.getInputProps('initialPrice')}
                />
              </Group>
            )}

            <Group justify="flex-end">
              <Button variant="default" onClick={close}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" loading={upsertMut.isPending}>
                {t('common.save')}
              </Button>
            </Group>
          </Stack>
        </form>

        {editing && detailQuery.data && (
          <Stack mt="xl" gap="sm">
            <Text fw={600}>{t('services.prices_per_branch')}</Text>
            {detailQuery.data.prices.length === 0 ? (
              <Text c="dimmed" size="sm">
                {t('services.no_prices')}
              </Text>
            ) : (
              <Table>
                <Table.Tbody>
                  {detailQuery.data.prices.map((p) => (
                    <Table.Tr key={p.id}>
                      <Table.Td>
                        {branchesQuery.data?.find((b) => b.id === p.branchId)?.name ?? p.branchId}
                      </Table.Td>
                      <Table.Td>{formatUZS(p.price)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
            <BranchPriceForm
              serviceId={editing.id}
              branches={branchesQuery.data ?? []}
              onSubmit={(branchId, price) =>
                setPriceMut.mutate({ id: editing.id, branchId, price })
              }
              loading={setPriceMut.isPending}
            />
          </Stack>
        )}
      </Modal>
    </Container>
  );
}

function BranchPriceForm({
  serviceId: _serviceId,
  branches,
  onSubmit,
  loading,
}: {
  serviceId: string;
  branches: Array<{ id: string; name: string }>;
  onSubmit: (branchId: string, price: number) => void;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const [branchId, setBranchId] = useState<string | null>(null);
  const [price, setPrice] = useState<number | ''>('');

  return (
    <Group align="flex-end">
      <Select
        label={t('services.branch')}
        data={branches.map((b) => ({ value: b.id, label: b.name }))}
        value={branchId}
        onChange={setBranchId}
        clearable
        flex={1}
      />
      <NumberInput
        label={t('services.price')}
        min={0}
        step={1000}
        suffix=" so'm"
        value={price}
        onChange={(v) => setPrice(typeof v === 'number' ? v : Number(v))}
        flex={1}
      />
      <Button
        disabled={!branchId || !price}
        loading={loading}
        onClick={() => {
          if (branchId && typeof price === 'number') {
            onSubmit(branchId, price);
            setPrice('');
          }
        }}
      >
        {t('services.set_price')}
      </Button>
    </Group>
  );
}
