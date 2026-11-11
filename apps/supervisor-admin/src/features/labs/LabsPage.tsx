import { Badge, Button, Group, Switch, Table, Text, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { CreateLabModal } from './components/CreateLabModal';
import { RenewLabModal } from './components/RenewLabModal';
import { fetchLabs, updateLab } from './labs.api';
import type { Lab, LabSubscription } from './labs.types';

const SUBSCRIPTION: Record<LabSubscription, { label: string; color: string }> = {
  active: { label: 'Faol', color: 'green' },
  grace: { label: 'Imtiyoz (7 kun)', color: 'yellow' },
  expired: { label: 'Muddati tugagan', color: 'red' },
};

export const LabsPage = () => {
  const qc = useQueryClient();
  const {
    data: labs = [],
    isLoading,
    isError,
    error,
  } = useQuery({ queryKey: ['labs'], queryFn: fetchLabs });
  const [opened, { open, close }] = useDisclosure(false);
  const [renewing, setRenewing] = useState<Lab | null>(null);
  const toggle = useMutation({
    mutationFn: (l: Lab) => updateLab(l.id, { catalogVisible: !l.catalogVisible }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['labs'] }),
  });

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={2}>Laboratoriyalar</Title>
        <Button onClick={open}>+ Yangi laboratoriya</Button>
      </Group>
      <CreateLabModal opened={opened} onClose={close} />
      <RenewLabModal lab={renewing} onClose={() => setRenewing(null)} />
      {isError && (
        <Text c="red" mb="md">
          {error instanceof Error ? error.message : "Laboratoriyalar ro'yxatini yuklab bo'lmadi"}
        </Text>
      )}
      {!isError && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Nomi</Table.Th>
              <Table.Th>Shahar</Table.Th>
              <Table.Th>Obuna muddati</Table.Th>
              <Table.Th>Holat</Table.Th>
              <Table.Th>Katalogda</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {isLoading && (
              <Table.Tr>
                <Table.Td colSpan={6}>Yuklanmoqda...</Table.Td>
              </Table.Tr>
            )}
            {!isLoading && labs.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={6}>Hali laboratoriya yo'q</Table.Td>
              </Table.Tr>
            )}
            {labs.map((lab) => {
              const s = SUBSCRIPTION[lab.subscription];
              return (
                <Table.Tr key={lab.id}>
                  <Table.Td>{lab.name}</Table.Td>
                  <Table.Td>{lab.city ?? '—'}</Table.Td>
                  <Table.Td>{lab.expiresAt.slice(0, 10)}</Table.Td>
                  <Table.Td>
                    <Badge color={s.color}>{s.label}</Badge>
                  </Table.Td>
                  <Table.Td>
                    <Switch
                      aria-label={`${lab.name} — katalogda ko'rinadi`}
                      checked={lab.catalogVisible}
                      disabled={toggle.isPending}
                      onChange={() => toggle.mutate(lab)}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Button size="xs" variant="subtle" onClick={() => setRenewing(lab)}>
                      Uzaytirish
                    </Button>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      )}
    </>
  );
};
