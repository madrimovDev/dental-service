import { AppShell, Button, Group, Title } from '@mantine/core';
import { Outlet, useNavigate } from 'react-router-dom';

export const AppLayout = () => {
  const navigate = useNavigate();

  const logout = () => {
    localStorage.removeItem('admin_token');
    navigate('/login');
  };

  return (
    <AppShell header={{ height: 56 }} padding="md">
      <AppShell.Header>
        <Group justify="space-between" h="100%" px="md">
          <Title order={4}>Supervisor Admin</Title>
          <Button variant="subtle" size="xs" onClick={logout}>
            Chiqish
          </Button>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
};
