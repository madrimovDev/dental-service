import { Text, TextInput, type TextInputProps } from '@mantine/core';

/**
 * +998 prefiksli reusable telefon input.
 *
 * Foydalanuvchi faqat 9 ta raqam yozadi (90 123 45 67),
 * komponent +998 prefiksini avtomatik qo'shadi va `+998XXXXXXXXX` formatida
 * onChange'ga uzatadi.
 *
 * Mantine `useForm` bilan ham, oddiy state bilan ham ishlaydi:
 *   <PhoneInput {...form.getInputProps('phone')} />
 *   <PhoneInput value={value} onChange={setValue} />
 */
type PhoneInputProps = Omit<TextInputProps, 'value' | 'onChange' | 'leftSection'> & {
  value?: string;
  onChange?: (value: string) => void;
};

export function PhoneInput({ value, onChange, placeholder, ...rest }: PhoneInputProps) {
  // Saqlangan qiymatdan +998 yoki 998 prefiksini ajratib, faqat raqamlarni ko'rsatamiz.
  const digits = (value ?? '')
    .replace(/^\+?998/, '')
    .replace(/\D/g, '')
    .slice(0, 9);

  return (
    <TextInput
      {...rest}
      leftSection={
        <Text size="sm" fw={500} c="dimmed">
          +998
        </Text>
      }
      leftSectionWidth={56}
      value={digits}
      onChange={(e) => {
        const newDigits = e.currentTarget.value.replace(/\D/g, '').slice(0, 9);
        onChange?.(newDigits ? `+998${newDigits}` : '');
      }}
      inputMode="numeric"
      autoComplete="tel"
      maxLength={9}
      placeholder={placeholder ?? '90 123 45 67'}
    />
  );
}
