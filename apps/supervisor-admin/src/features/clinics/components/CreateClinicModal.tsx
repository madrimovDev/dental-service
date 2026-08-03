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
import type { CreateClinicResult } from '../clinics.types';

const PLAN_OPTIONS = [
  { value: 'starter', label: "Boshlang'ich" },
  { value: 'standard', label: 'Standart' },
  { value: 'premium', label: 'Premium' },
  { value: 'enterprise', label: 'Korporativ' },
];

const LANGUAGE_OPTIONS = [
  { value: 'uz', label: "O'zbekcha" },
  { value: 'ru', label: 'Ruscha' },
];

interface Props {
  opened: boolean;
  onClose: () => void;
}

export const CreateClinicModal = ({ opened, onClose }: Props) => {
  const qc = useQueryClient();
  const [created, setCreated] = useState<CreateClinicResult | null>(null);

  const form = useForm<CreateClinicFormValues>({
    initialValues: {
      name: '',
      contactEmail: '',
      contactPhone: '',
      plan: 'starter',
      expiresAt: '',
      gracePeriodDays: 30,
      ownerFullName: '',
      ownerPhone: '',
      defaultLanguage: 'uz',
      branchName: 'Bosh filial',
      branchAddress: '',
      branchPhone: '',
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
        ownerFullName: values.ownerFullName,
        ownerPhone: values.ownerPhone,
        defaultLanguage: values.defaultLanguage,
        branchName: values.branchName,
        // Bo'sh matn o'rniga `undefined` — server uni NULL sifatida saqlaydi.
        branchAddress: values.branchAddress || undefined,
        branchPhone: values.branchPhone || undefined,
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
          <Text size="sm" fw={600} mt="md">
            Klinika kirish ma'lumotlari
          </Text>
          <Text size="sm" c="dimmed">
            Klinika aktivatsiya qilgach bu parol Supervisor bazasidan o'chiriladi — hozir nusxalab,
            mijozga yetkazing.
          </Text>
          {/* Login — serverda normallashtirilgan telefon (+998XXXXXXXXX), formadagi xom qiymat emas. */}
          <Code block>{created.credentials.loginPhone}</Code>
          <Code block>{created.credentials.tempPassword}</Code>
          <Group>
            <CopyButton value={created.license?.licenseKey ?? ''}>
              {({ copied, copy }) => (
                <Button color={copied ? 'teal' : 'blue'} onClick={copy}>
                  {copied ? 'Nusxalandi!' : 'Nusxalash'}
                </Button>
              )}
            </CopyButton>
            <CopyButton
              value={`Login: ${created.credentials.loginPhone}\nParol: ${created.credentials.tempPassword}`}
            >
              {({ copied, copy }) => (
                <Button color={copied ? 'teal' : 'blue'} onClick={copy}>
                  {copied ? 'Nusxalandi!' : "Kirish ma'lumotlarini nusxalash"}
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
            <TextInput label="Owner F.I.Sh." {...form.getInputProps('ownerFullName')} />
            <TextInput
              label="Owner telefoni"
              placeholder="+998 90 123 45 67"
              {...form.getInputProps('ownerPhone')}
            />
            <Select
              label="Til"
              data={LANGUAGE_OPTIONS}
              {...form.getInputProps('defaultLanguage')}
            />
            <TextInput label="Filial nomi" {...form.getInputProps('branchName')} />
            <TextInput label="Filial manzili" {...form.getInputProps('branchAddress')} />
            <TextInput label="Filial telefoni" {...form.getInputProps('branchPhone')} />
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
