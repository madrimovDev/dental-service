import {
  Button,
  Container,
  Group,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMutation } from '@tanstack/react-query';
import { zodResolver } from 'mantine-form-zod-resolver';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { PhoneInput } from '@/components/PhoneInput.tsx';
import { api } from '@/lib/api.ts';

const schema = z.object({
  fullName: z.string().min(2).max(120),
  dateOfBirth: z.string().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  phone: z
    .string()
    .regex(/^\+?\d{9,15}$/)
    .optional()
    .or(z.literal('')),
  phoneSecondary: z
    .string()
    .regex(/^\+?\d{9,15}$/)
    .optional()
    .or(z.literal('')),
  passport: z.string().max(64).optional(),
  address: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
});

type FormValues = z.infer<typeof schema>;

export function NewPatientPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const form = useForm<FormValues>({
    initialValues: {
      fullName: '',
      dateOfBirth: '',
      gender: undefined,
      phone: '',
      phoneSecondary: '',
      passport: '',
      address: '',
      notes: '',
    },
    validate: zodResolver(schema),
  });

  const createMut = useMutation({
    mutationFn: (values: FormValues) =>
      api.patients.create({
        fullName: values.fullName,
        dateOfBirth: values.dateOfBirth || undefined,
        gender: values.gender,
        phone: values.phone || undefined,
        phoneSecondary: values.phoneSecondary || undefined,
        passport: values.passport || undefined,
        address: values.address || undefined,
        notes: values.notes || undefined,
      }),
    onSuccess: (patient) => navigate(`/patients/${patient.id}`),
  });

  return (
    <Container size="md">
      <Stack gap="lg">
        <Title order={2}>{t('patients.create')}</Title>

        <Paper withBorder radius="md" p="xl">
          <form onSubmit={form.onSubmit((values) => createMut.mutate(values))}>
            <Stack gap="md">
              <TextInput
                label={t('patients.full_name')}
                required
                {...form.getInputProps('fullName')}
              />

              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <TextInput
                  label={t('patients.dob')}
                  type="date"
                  {...form.getInputProps('dateOfBirth')}
                />
                <Select
                  label={t('patients.gender')}
                  placeholder={t('common.select')}
                  data={[
                    { value: 'male', label: t('patients.gender_male') },
                    { value: 'female', label: t('patients.gender_female') },
                    { value: 'other', label: t('patients.gender_other') },
                  ]}
                  clearable
                  {...form.getInputProps('gender')}
                />
              </SimpleGrid>

              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <PhoneInput label={t('patients.phone')} {...form.getInputProps('phone')} />
                <PhoneInput
                  label={t('patients.phone_secondary')}
                  {...form.getInputProps('phoneSecondary')}
                />
              </SimpleGrid>

              <TextInput label={t('patients.passport')} {...form.getInputProps('passport')} />
              <TextInput label={t('patients.address')} {...form.getInputProps('address')} />
              <Textarea label={t('patients.notes')} rows={3} {...form.getInputProps('notes')} />

              <Group justify="flex-end">
                <Button variant="default" onClick={() => navigate('/patients')}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" loading={createMut.isPending}>
                  {t('common.save')}
                </Button>
              </Group>
            </Stack>
          </form>
        </Paper>
      </Stack>
    </Container>
  );
}
