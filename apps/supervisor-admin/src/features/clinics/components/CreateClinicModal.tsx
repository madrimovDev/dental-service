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
import { type CreateClinicFormValues, createClinicFormSchema } from '../clinics.schema';
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
            <TextInput label="Kontakt email" type="email" {...form.getInputProps('contactEmail')} />
            <TextInput label="Kontakt telefon" {...form.getInputProps('contactPhone')} />
            <Select label="Tarif" data={PLAN_OPTIONS} {...form.getInputProps('plan')} />
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
