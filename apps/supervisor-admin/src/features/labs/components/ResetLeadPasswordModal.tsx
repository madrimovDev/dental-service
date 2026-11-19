import { Alert, Button, Code, CopyButton, Group, Modal, Stack, Text } from '@mantine/core';
import { useMutation, useQuery } from '@tanstack/react-query';
import { fetchLabUsers, resetLabUserPassword } from '../labs.api';
import type { Lab } from '../labs.types';

interface Props {
  lab: Lab | null;
  onClose: () => void;
}

/** FX-94: lab rahbari parolini tiklash — yangi vaqtinchalik parol bir marta ko'rsatiladi. */
export const ResetLeadPasswordModal = ({ lab, onClose }: Props) => {
  const users = useQuery({
    queryKey: ['lab-users', lab?.id],
    queryFn: () => fetchLabUsers(lab!.id),
    enabled: !!lab,
  });
  const reset = useMutation({
    mutationFn: (userId: string) => resetLabUserPassword(lab!.id, userId),
  });
  const close = () => {
    reset.reset();
    onClose();
  };
  const leads = (users.data ?? []).filter((u) => u.role === 'lead');

  return (
    <Modal opened={!!lab} onClose={close} title="Lab rahbari parolini tiklash">
      <Stack>
        {lab && (
          <Text size="sm">
            <b>{lab.name}</b>
          </Text>
        )}
        {(users.isError || reset.isError) && (
          <Alert color="red">
            {(reset.error ?? users.error) instanceof Error
              ? (reset.error ?? users.error)?.message
              : 'Xato'}
          </Alert>
        )}
        {reset.data ? (
          <Stack>
            <Text size="sm" c="dimmed">
              Yangi vaqtinchalik parol faqat hozir ko'rinadi — Supervisor uni saqlamaydi. Rahbar
              birinchi kirishda parolni almashtiradi.
            </Text>
            <Code block>{reset.data.user.phone}</Code>
            <Code block>{reset.data.tempPassword}</Code>
            <CopyButton
              value={`Login: ${reset.data.user.phone}\nParol: ${reset.data.tempPassword}`}
            >
              {({ copied, copy }) => (
                <Button color={copied ? 'teal' : 'blue'} onClick={copy}>
                  {copied ? 'Nusxalandi!' : "Kirish ma'lumotlarini nusxalash"}
                </Button>
              )}
            </CopyButton>
          </Stack>
        ) : (
          <>
            {users.isLoading && <Text size="sm">Yuklanmoqda...</Text>}
            {leads.map((u) => (
              <Group key={u.id} justify="space-between">
                <Text size="sm">
                  {u.fullName} · {u.phone}
                  {u.isActive ? '' : ' (faol emas)'}
                </Text>
                <Button size="xs" loading={reset.isPending} onClick={() => reset.mutate(u.id)}>
                  Parolni tiklash
                </Button>
              </Group>
            ))}
          </>
        )}
        <Group justify="flex-end">
          <Button variant="outline" onClick={close}>
            Yopish
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
