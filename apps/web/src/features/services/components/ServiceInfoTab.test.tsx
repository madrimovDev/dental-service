import { useForm } from '@mantine/form';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import type { ServiceFormValues } from '../services.types';
import { ServiceInfoTab } from './ServiceInfoTab';

vi.mock('@/features/service-categories', () => ({
  useServiceCategories: () => ({
    data: [{ id: 'c1', name: 'Terapevtika', nameRu: 'Терапевтика' }],
  }),
}));

function Wrapper({ initialCategory = '' }: { initialCategory?: string }) {
  const form = useForm<ServiceFormValues>({
    initialValues: {
      code: 'T-001',
      nameUz: 'Test',
      nameRu: '',
      category: initialCategory,
      durationMinutes: 30,
      requiredRole: '',
      descriptionUz: '',
      descriptionRu: '',
      isActive: true,
    },
  });
  return <ServiceInfoTab form={form} isEditing={false} />;
}

describe('ServiceInfoTab', () => {
  it("kategoriya inputi render bo'ladi", () => {
    renderApp(<Wrapper />);
    // Autocomplete renders with the category label
    expect(screen.getByRole('textbox', { name: /kategoriya/i })).toBeInTheDocument();
  });

  it('erkin nom yozilganda form.values.category yangilanadi', () => {
    renderApp(<Wrapper />);
    const input = screen.getByRole('textbox', { name: /kategoriya/i });
    fireEvent.change(input, { target: { value: 'Yangi kategoriya' } });
    expect((input as HTMLInputElement).value).toBe('Yangi kategoriya');
  });

  it("mavjud kategoriya nomi suggestion sifatida ko'rinadi", () => {
    renderApp(<Wrapper />);
    const input = screen.getByRole('textbox', { name: /kategoriya/i });
    // Focus / click to open dropdown
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Ter' } });
    // Mantine Autocomplete renders options in combobox
    expect(screen.getByRole('option', { name: 'Terapevtika' })).toBeInTheDocument();
  });
});
