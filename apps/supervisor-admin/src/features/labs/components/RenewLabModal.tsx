import { Alert, Button, Group, Modal, Stack, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { updateLab } from '../labs.api';
import { type RenewLabFormValues, renewLabFormSchema } from '../labs.schema';
import type { Lab } from '../labs.types';

interface Props {
  lab: Lab | null;
  onClose: () => void;
}

/** L10: obuna = faqat muddat; uzaytirish = yangi `expiresAt`. */
export const RenewLabModal = ({ lab, onClose }: Props) => {
  const qc = useQueryClient();
  const form = useForm<RenewLabFormValues>({
    initialValues: { expiresAt: '' },
    validate: zod4Resolver(renewLabFormSchema),
  });
  const mutation = useMutation({
    mutationFn: (v: RenewLabFormValues) => updateLab(lab!.id, { expiresAt: v.expiresAt }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['labs'] });
      handleClose();
    },
  });
  const handleClose = () => {
    form.reset();
    mutation.reset();
    onClose();
  };

  return (
    <Modal opened={!!lab} onClose={handleClose} title="Obunani uzaytirish">
      <form onSubmit={form.onSubmit((v) => mutation.mutate(v))}>
        <Stack>
          {lab && (
            <Text size="sm">
              <b>{lab.name}</b> — joriy muddat {lab.expiresAt.slice(0, 10)}
            </Text>
          )}
          {mutation.isError && (
            <Alert color="red">
              {mutation.error instanceof Error ? mutation.error.message : 'Xato'}
            </Alert>
          )}
          <TextInput label="Yangi muddat" type="date" {...form.getInputProps('expiresAt')} />
          <Group justify="flex-end">
            <Button variant="outline" onClick={handleClose}>
              Bekor qilish
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              Saqlash
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
};
