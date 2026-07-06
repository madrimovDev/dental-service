import { Button, Paper, PasswordInput, Stack, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

const API = import.meta.env.VITE_API_URL ?? '';

export const LoginPage = () => {
  const navigate = useNavigate();
  const form = useForm({ initialValues: { email: '', password: '' } });

  const login = useMutation({
    mutationFn: async (values: { email: string; password: string }) => {
      const res = await fetch(`${API}/v1/admin/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error('Login failed');
      return res.json() as Promise<{ token: string }>;
    },
    onSuccess: ({ token }) => {
      localStorage.setItem('admin_token', token);
      navigate('/');
    },
  });

  return (
    <Paper maw={400} mx="auto" mt={100} p="xl" withBorder>
      <Title order={2} mb="md">
        Supervisor Admin
      </Title>
      <form onSubmit={form.onSubmit((v) => login.mutate(v))}>
        <Stack>
          <TextInput label="Email" type="email" {...form.getInputProps('email')} />
          <PasswordInput label="Parol" {...form.getInputProps('password')} />
          <Button type="submit" loading={login.isPending}>
            Kirish
          </Button>
          {login.isError && <span style={{ color: 'red' }}>Login yoki parol noto'g'ri</span>}
        </Stack>
      </form>
    </Paper>
  );
};
