import { Badge, Button, Group, Table, Text, Title, Tooltip } from '@mantine/core';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { fetchClinicDetail, fetchClinics } from './clinics.api';

export const ClinicsPage = () => {
  const {
    data: clinics = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['clinics'],
    queryFn: fetchClinics,
  });

  // GET /v1/admin/clinics ro'yxatida litsenziya kiritilmagan (bare clinic
  // row'lar) — jadvalda litsenziya/tarif/holat ko'rsatish uchun har bir
  // klinika uchun detail endpoint'ni alohida so'raymiz.
  const detailQueries = useQueries({
    queries: clinics.map((clinic) => ({
      queryKey: ['clinic', clinic.id],
      queryFn: () => fetchClinicDetail(clinic.id),
    })),
  });

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={2}>Klinikalar</Title>
        <Tooltip label="Klinika yaratish hozircha faqat API orqali: POST /v1/admin/clinics">
          {/* Disabled buttons don't fire pointer events, so the Tooltip's
              hover trigger needs a non-disabled wrapper element to hang off. */}
          <span>
            <Button disabled>+ Yangi klinika</Button>
          </span>
        </Tooltip>
      </Group>
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
            {clinics.map((clinic, index) => {
              const license = detailQueries[index]?.data?.license;
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
