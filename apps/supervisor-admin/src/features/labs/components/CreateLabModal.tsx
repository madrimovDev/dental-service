import {
  Alert,
  Button,
  Checkbox,
  Code,
  CopyButton,
  Group,
  Modal,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useState } from 'react';
import { createLab } from '../labs.api';
import { type CreateLabFormValues, createLabFormSchema } from '../labs.schema';
import type { CreateLabResult } from '../labs.types';

interface Props {
  opened: boolean;
  onClose: () => void;
}

/** L6: lab hisobini faqat vendor yaratadi; lead vaqtinchalik paroli faqat shu oynada ko'rinadi. */
export const CreateLabModal = ({ opened, onClose }: Props) => {
  const qc = useQueryClient();
  const [created, setCreated] = useState<CreateLabResult | null>(null);
  const form = useForm<CreateLabFormValues>({
    initialValues: {
      name: '',
      city: '',
      description: '',
      catalogVisible: true,
      expiresAt: '',
      leadFullName: '',
      leadPhone: '',
    },
    validate: zod4Resolver(createLabFormSchema),
  });

  const mutation = useMutation({
    mutationFn: (v: CreateLabFormValues) =>
      createLab({
        name: v.name,
        city: v.city || undefined,
        description: v.description || undefined,
        catalogVisible: v.catalogVisible,
        expiresAt: v.expiresAt,
        leadFullName: v.leadFullName,
        leadPhone: v.leadPhone,
      }),
    onSuccess: (data) => {
      setCreated(data);
      qc.invalidateQueries({ queryKey: ['labs'] });
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
      title="Yangi laboratoriya"
    >
      {created ? (
        <Stack>
          <Text>
            <b>{created.lab.name}</b> yaratildi.
          </Text>
          <Text size="sm" c="dimmed">
            Lab rahbarining kirish ma'lumotlari. Parol faqat hozir ko'rinadi — Supervisor uni
            saqlamaydi. Birinchi kirishda rahbar parolni almashtiradi.
          </Text>
          <Code block>{created.lead.phone}</Code>
          <Code block>{created.lead.tempPassword}</Code>
          <Group>
            <CopyButton value={`Login: ${created.lead.phone}\nParol: ${created.lead.tempPassword}`}>
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
        <form onSubmit={form.onSubmit((v) => mutation.mutate(v))}>
          <Stack>
            {mutation.isError && (
              <Alert color="red">
                {mutation.error instanceof Error
                  ? mutation.error.message
                  : "Laboratoriya yaratib bo'lmadi"}
              </Alert>
            )}
            <TextInput label="Laboratoriya nomi" {...form.getInputProps('name')} />
            <TextInput label="Shahar" {...form.getInputProps('city')} />
            <Textarea
              label="Tavsif (katalogda)"
              autosize
              minRows={2}
              {...form.getInputProps('description')}
            />
            <Checkbox
              label="Katalogda ko'rinadi"
              {...form.getInputProps('catalogVisible', { type: 'checkbox' })}
            />
            <TextInput label="Obuna muddati" type="date" {...form.getInputProps('expiresAt')} />
            <TextInput label="Rahbar F.I.Sh." {...form.getInputProps('leadFullName')} />
            <TextInput
              label="Rahbar telefoni"
              placeholder="+998 90 123 45 67"
              {...form.getInputProps('leadPhone')}
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
