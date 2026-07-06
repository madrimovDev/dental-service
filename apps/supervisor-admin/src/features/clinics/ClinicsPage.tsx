import { Badge, Button, Group, Table, Text, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { fetchClinics } from './clinics.api';
import { CreateClinicModal } from './components/CreateClinicModal';

export const ClinicsPage = () => {
  const {
    data: clinics = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['clinics'],
    queryFn: fetchClinics,
  });

  const [opened, { open, close }] = useDisclosure(false);

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={2}>Klinikalar</Title>
        <Button onClick={open}>+ Yangi klinika</Button>
      </Group>
      <CreateClinicModal opened={opened} onClose={close} />
      {isError && (
        <Text c="red" mb="md">
          Klinikalar ro'yxatini yuklab bo'lmadi. Qayta urinib ko'ring yoki qaytadan kiring.
        </Text>
      )}
      {!isError && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Nomi</Table.Th>
              <Table.Th>Litsenziya</Table.Th>
              <Table.Th>Tarif</Table.Th>
              <Table.Th>Holat</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {isLoading && (
              <Table.Tr>
                <Table.Td colSpan={5}>Yuklanmoqda...</Table.Td>
              </Table.Tr>
            )}
            {clinics.map((clinic) => {
              const license = clinic.license;
              return (
                <Table.Tr key={clinic.id}>
                  <Table.Td>{clinic.name}</Table.Td>
                  <Table.Td>{license?.licenseKey ?? '—'}</Table.Td>
                  <Table.Td>{license?.plan ?? '—'}</Table.Td>
                  <Table.Td>
                    <Badge color={license?.isActive ? 'green' : 'red'}>
                      {license?.isActive ? 'Faol' : 'Nofaol'}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Button
                      size="xs"
                      variant="subtle"
                      component={Link}
                      to={`/clinics/${clinic.id}`}
                    >
                      Ko'rish
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
