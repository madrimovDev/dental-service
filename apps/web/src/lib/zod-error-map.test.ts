import { zod4Resolver } from 'mantine-form-zod-resolver';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { i18n } from '@/lib/i18n.ts';

// Global Zod error map test-setup.ts orqali (i18n import) o'rnatiladi.
// Statik (qo'lda xabarsiz) sxema → uz/ru tarjima qaytarishi kerak.
const schema = z.object({
  name: z.string().min(3),
  age: z.coerce.number().positive(),
  email: z.email(),
});

afterEach(async () => {
  await i18n.changeLanguage('uz');
});

describe('global Zod error map (CLI-182)', () => {
  it("too_small (string) → uz 'tooShort' {{min}} bilan", () => {
    const res = schema.safeParse({ name: 'ab', age: 5, email: 'a@b.uz' });
    expect(res.success).toBe(false);
    const msg = res.error?.issues.find((i) => i.path[0] === 'name')?.message;
    expect(msg).toBe("Kamida 3 belgi bo'lishi kerak");
  });

  it("too_small (number) → uz 'tooSmall', 'tooShort' EMAS", () => {
    const res = schema.safeParse({ name: 'abc', age: -1, email: 'a@b.uz' });
    const msg = res.error?.issues.find((i) => i.path[0] === 'age')?.message;
    expect(msg).toBe("0 dan katta yoki teng bo'lishi kerak");
  });

  it("invalid_format email → uz 'invalidEmail'", () => {
    const res = schema.safeParse({ name: 'abc', age: 5, email: 'not-an-email' });
    const msg = res.error?.issues.find((i) => i.path[0] === 'email')?.message;
    expect(msg).toBe("Email manzili noto'g'ri");
  });

  it('til almashganda ru xabarlar qaytadi', async () => {
    await i18n.changeLanguage('ru');
    const res = schema.safeParse({ name: 'ab', age: -1, email: 'nope' });
    const nameMsg = res.error?.issues.find((i) => i.path[0] === 'name')?.message;
    const ageMsg = res.error?.issues.find((i) => i.path[0] === 'age')?.message;
    const emailMsg = res.error?.issues.find((i) => i.path[0] === 'email')?.message;
    expect(nameMsg).toBe('Минимум 3 символов');
    expect(ageMsg).toBe('Должно быть больше или равно 0');
    expect(emailMsg).toBe('Неверный адрес эл. почты');
  });

  it("zod4Resolver orqali ham tarjima qaytadi (форма yo'li)", () => {
    const resolve = zod4Resolver(schema);
    const errors = resolve({ name: 'ab', age: 5, email: 'a@b.uz' });
    expect(errors.name).toBe("Kamida 3 belgi bo'lishi kerak");
  });
});
